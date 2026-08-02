-- Version plan families without deleting workouts or completed-session evidence.
-- PostgreSQL functions are transaction-scoped, so every failure below rolls back
-- plan rows, workouts, profile changes, active-state changes and success events.

-- Hold writes while auditing legacy state and installing both invariants. This
-- prevents a concurrent insert or tier downgrade from slipping between the
-- preexisting-data check and trigger creation.
LOCK TABLE public.workout_plans IN SHARE ROW EXCLUSIVE MODE;
LOCK TABLE public.profiles IN SHARE ROW EXCLUSIVE MODE;

DO $plan_family_preexisting_check$
DECLARE
  v_user_id UUID;
  v_family_count INTEGER;
BEGIN
  SELECT profile.id, COUNT(DISTINCT wp.family_id)::INTEGER
  INTO v_user_id, v_family_count
  FROM public.profiles AS profile
  JOIN public.workout_plans AS wp ON wp.user_id = profile.id
  WHERE profile.subscription_tier = 'free'
    AND wp.retired_at IS NULL
    AND wp.superseded_at IS NULL
  GROUP BY profile.id
  HAVING COUNT(DISTINCT wp.family_id) > 2
  ORDER BY profile.id
  LIMIT 1;

  IF v_user_id IS NOT NULL THEN
    RAISE EXCEPTION
      'PLAN_PREEXISTING_FREE_FAMILY_LIMIT: user % has % current families',
      v_user_id,
      v_family_count;
  END IF;
END;
$plan_family_preexisting_check$;

-- RLS proves row ownership, but it cannot serialize a cross-row family count.
-- This trigger is the final invariant for every write path, including direct
-- authenticated inserts and future RPCs that might otherwise omit the check.
CREATE OR REPLACE FUNCTION public.enforce_plan_family_limit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor_id UUID := auth.uid();
  v_actor_role TEXT := COALESCE(auth.role(), '');
  v_subscription_tier TEXT;
  v_family_count INTEGER;
  v_family_exists BOOLEAN;
BEGIN
  IF v_actor_id IS NULL THEN
    IF v_actor_role <> 'service_role'
      AND session_user NOT IN ('postgres', 'supabase_admin') THEN
      RAISE EXCEPTION 'Not authenticated';
    END IF;
  ELSIF v_actor_id <> NEW.user_id THEN
    RAISE EXCEPTION 'PLAN_OWNERSHIP_MISMATCH';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(NEW.user_id::TEXT, 0));

  IF NEW.is_active AND (
    NEW.retired_at IS NOT NULL OR NEW.superseded_at IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'PLAN_VERSION_UNAVAILABLE';
  END IF;

  IF NEW.retired_at IS NOT NULL OR NEW.superseded_at IS NOT NULL THEN
    RETURN NEW;
  END IF;

  SELECT subscription_tier INTO v_subscription_tier
  FROM profiles
  WHERE id = NEW.user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Profile not found';
  END IF;

  IF COALESCE(v_subscription_tier, 'free') = 'free' THEN
    SELECT COUNT(DISTINCT family_id)::INTEGER INTO v_family_count
    FROM workout_plans
    WHERE user_id = NEW.user_id
      AND retired_at IS NULL
      AND superseded_at IS NULL
      AND id <> NEW.id;

    SELECT EXISTS (
      SELECT 1
      FROM workout_plans
      WHERE user_id = NEW.user_id
        AND family_id = NEW.family_id
        AND retired_at IS NULL
        AND superseded_at IS NULL
        AND id <> NEW.id
    ) INTO v_family_exists;

    IF NOT v_family_exists AND v_family_count >= 2 THEN
      RAISE EXCEPTION 'PLAN_FAMILY_LIMIT: free plan family limit reached';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.enforce_plan_family_limit() FROM PUBLIC;

DROP TRIGGER IF EXISTS trg_enforce_plan_family_limit ON public.workout_plans;
CREATE TRIGGER trg_enforce_plan_family_limit
  BEFORE INSERT OR UPDATE OF user_id, family_id, retired_at, superseded_at, is_active
  ON public.workout_plans
  FOR EACH ROW EXECUTE FUNCTION public.enforce_plan_family_limit();

CREATE OR REPLACE FUNCTION public.enforce_subscription_tier_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor_role TEXT := COALESCE(auth.role(), '');
  v_family_count INTEGER;
BEGIN
  IF NEW.subscription_tier IS NOT DISTINCT FROM OLD.subscription_tier THEN
    RETURN NEW;
  END IF;

  IF v_actor_role <> 'service_role'
    AND session_user NOT IN ('postgres', 'supabase_admin') THEN
    RAISE EXCEPTION 'PLAN_SUBSCRIPTION_TIER_CHANGE_FORBIDDEN';
  END IF;

  IF NOT pg_try_advisory_xact_lock(hashtextextended(NEW.id::TEXT, 0)) THEN
    RAISE EXCEPTION 'PLAN_TIER_LOCK_BUSY_RETRY';
  END IF;

  IF OLD.subscription_tier = 'pro' AND NEW.subscription_tier = 'free' THEN
    SELECT COUNT(DISTINCT family_id)::INTEGER INTO v_family_count
    FROM workout_plans
    WHERE user_id = NEW.id
      AND retired_at IS NULL
      AND superseded_at IS NULL;

    IF v_family_count > 2 THEN
      RAISE EXCEPTION
        'PLAN_DOWNGRADE_FAMILY_LIMIT: archive plans until at most two current families remain';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.enforce_subscription_tier_change() FROM PUBLIC;

-- The first trigger rejects an explicit tier SET before the legacy protected-
-- fields trigger can silently restore OLD. The last trigger validates any tier
-- mutation produced by another BEFORE trigger while leaving normal profile
-- updates untouched when the tier did not change.
DROP TRIGGER IF EXISTS trg_00_guard_subscription_tier_request ON public.profiles;
CREATE TRIGGER trg_00_guard_subscription_tier_request
  BEFORE UPDATE OF subscription_tier ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.enforce_subscription_tier_change();

DROP TRIGGER IF EXISTS trg_zz_guard_subscription_tier_result ON public.profiles;
CREATE TRIGGER trg_zz_guard_subscription_tier_result
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.enforce_subscription_tier_change();

CREATE OR REPLACE FUNCTION public.set_subscription_tier_atomic(
  p_user_id UUID,
  p_subscription_tier TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor_role TEXT := COALESCE(auth.role(), '');
  v_current_tier TEXT;
  v_family_count INTEGER;
BEGIN
  IF v_actor_role <> 'service_role'
    AND session_user NOT IN ('postgres', 'supabase_admin') THEN
    RAISE EXCEPTION 'PLAN_SUBSCRIPTION_TIER_CHANGE_FORBIDDEN';
  END IF;

  IF p_subscription_tier NOT IN ('free', 'pro') THEN
    RAISE EXCEPTION 'Invalid subscription tier';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_user_id::TEXT, 0));

  SELECT subscription_tier INTO v_current_tier
  FROM profiles
  WHERE id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Profile not found';
  END IF;

  IF v_current_tier = 'pro' AND p_subscription_tier = 'free' THEN
    SELECT COUNT(DISTINCT family_id)::INTEGER INTO v_family_count
    FROM workout_plans
    WHERE user_id = p_user_id
      AND retired_at IS NULL
      AND superseded_at IS NULL;

    IF v_family_count > 2 THEN
      RAISE EXCEPTION
        'PLAN_DOWNGRADE_FAMILY_LIMIT: archive plans until at most two current families remain';
    END IF;
  END IF;

  UPDATE profiles
  SET subscription_tier = p_subscription_tier
  WHERE id = p_user_id;

  RETURN p_user_id;
END;
$$;

REVOKE ALL ON FUNCTION public.set_subscription_tier_atomic(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_subscription_tier_atomic(UUID, TEXT) TO service_role;

CREATE OR REPLACE FUNCTION public.create_engine_plan_v2(
  p_plan JSONB,
  p_metadata JSONB,
  p_week_number INTEGER,
  p_plan_context TEXT,
  p_expected_parent_plan_id UUID,
  p_generation_request_id UUID,
  p_profile_updates JSONB DEFAULT '{}'::jsonb
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_existing_plan_id UUID;
  v_plan_id UUID;
  v_family_id UUID;
  v_parent_plan workout_plans%ROWTYPE;
  v_subscription_tier TEXT;
  v_family_count INTEGER;
  v_generation_count INTEGER;
  v_workout_id UUID;
  v_day JSONB;
  v_exercise JSONB;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_generation_request_id IS NULL THEN
    RAISE EXCEPTION 'PLAN_REQUEST_ID_REQUIRED';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(v_user_id::TEXT, 0));

  -- A retry must win even after its parent was superseded by the first attempt.
  SELECT id INTO v_existing_plan_id
  FROM workout_plans
  WHERE user_id = v_user_id
    AND generation_request_id = p_generation_request_id
  LIMIT 1;

  IF v_existing_plan_id IS NOT NULL THEN
    RETURN v_existing_plan_id;
  END IF;

  IF p_plan_context NOT IN ('first_plan', 'weekly_regeneration', 'manual_update') THEN
    RAISE EXCEPTION 'Invalid plan context';
  END IF;

  IF jsonb_typeof(p_plan->'days') IS DISTINCT FROM 'array'
    OR jsonb_array_length(p_plan->'days') = 0 THEN
    RAISE EXCEPTION 'Plan has no days';
  END IF;

  IF p_plan_context = 'first_plan' THEN
    IF p_expected_parent_plan_id IS NOT NULL THEN
      RAISE EXCEPTION 'PLAN_INITIAL_PARENT_NOT_ALLOWED';
    END IF;

    SELECT subscription_tier INTO v_subscription_tier
    FROM profiles
    WHERE id = v_user_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Profile not found';
    END IF;

    IF COALESCE(v_subscription_tier, 'free') = 'free' THEN
      SELECT COUNT(DISTINCT family_id)::INTEGER INTO v_family_count
      FROM workout_plans
      WHERE user_id = v_user_id
        AND retired_at IS NULL
        AND superseded_at IS NULL;

      IF v_family_count >= 2 THEN
        RAISE EXCEPTION 'PLAN_FAMILY_LIMIT: free plan family limit reached';
      END IF;
    END IF;

    SELECT COUNT(*)::INTEGER INTO v_generation_count
    FROM plan_generation_events
    WHERE user_id = v_user_id
      AND mode = 'initial'
      AND generator = 'evidence_engine'
      AND success = TRUE
      AND created_at >= NOW() - INTERVAL '24 hours';

    IF v_generation_count >= 3 THEN
      RAISE EXCEPTION 'PLAN_RATE_LIMIT: initial plan limit reached';
    END IF;

    v_family_id := gen_random_uuid();
  ELSE
    IF p_expected_parent_plan_id IS NULL THEN
      RAISE EXCEPTION 'PLAN_STALE_PARENT: expected active parent is required';
    END IF;

    SELECT * INTO v_parent_plan
    FROM workout_plans
    WHERE id = p_expected_parent_plan_id
      AND user_id = v_user_id
      AND is_active = TRUE
      AND retired_at IS NULL
      AND superseded_at IS NULL
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'PLAN_STALE_PARENT: active plan changed';
    END IF;

    v_family_id := v_parent_plan.family_id;

    IF p_plan_context = 'weekly_regeneration' THEN
      SELECT COUNT(*)::INTEGER INTO v_generation_count
      FROM plan_generation_events
      WHERE user_id = v_user_id
        AND mode = 'weekly_regeneration'
        AND generator = 'evidence_engine'
        AND success = TRUE
        AND created_at >= NOW() - INTERVAL '7 days';

      IF v_generation_count >= 2 THEN
        RAISE EXCEPTION 'PLAN_RATE_LIMIT: weekly regeneration limit reached';
      END IF;
    END IF;
  END IF;

  INSERT INTO workout_plans (
    user_id,
    name,
    goal,
    duration_weeks,
    days_per_week,
    difficulty,
    is_active,
    generated_by_ai,
    ai_notes,
    week_number,
    plan_context,
    parent_plan_id,
    source_type,
    generation_metadata,
    family_id,
    generation_request_id
  ) VALUES (
    v_user_id,
    p_plan->>'display_name',
    p_plan->>'goal',
    1,
    jsonb_array_length(p_plan->'days'),
    NULLIF(p_plan->>'difficulty', ''),
    FALSE,
    FALSE,
    p_plan->>'ai_notes',
    GREATEST(1, p_week_number),
    p_plan_context,
    p_expected_parent_plan_id,
    'engine',
    COALESCE(p_metadata, '{}'::jsonb),
    v_family_id,
    p_generation_request_id
  )
  RETURNING id INTO v_plan_id;

  FOR v_day IN SELECT value FROM jsonb_array_elements(p_plan->'days')
  LOOP
    IF jsonb_typeof(v_day->'exercises') IS DISTINCT FROM 'array'
      OR jsonb_array_length(v_day->'exercises') = 0 THEN
      RAISE EXCEPTION 'Workout day has no exercises';
    END IF;

    INSERT INTO workouts (
      user_id,
      plan_id,
      name,
      focus,
      day_of_week,
      order_in_plan,
      estimated_duration_minutes
    ) VALUES (
      v_user_id,
      v_plan_id,
      v_day->>'display_name',
      NULLIF(v_day->>'focus', ''),
      (v_day->>'day_of_week')::INTEGER,
      (v_day->>'day_number')::INTEGER,
      (v_day->>'estimated_duration_minutes')::INTEGER
    )
    RETURNING id INTO v_workout_id;

    FOR v_exercise IN SELECT value FROM jsonb_array_elements(v_day->'exercises')
    LOOP
      INSERT INTO workout_exercises (
        workout_id,
        exercise_id,
        order_index,
        sets,
        reps,
        duration_seconds,
        rest_seconds,
        target_rpe,
        weight_kg,
        notes,
        weight_suggestion_basis
      ) VALUES (
        v_workout_id,
        (v_exercise->>'exercise_id')::UUID,
        COALESCE((v_exercise->>'order_index')::INTEGER, 1),
        (v_exercise->>'sets')::INTEGER,
        NULLIF(v_exercise->>'reps', '')::INTEGER,
        NULLIF(v_exercise->>'duration_seconds', '')::INTEGER,
        (v_exercise->>'rest_seconds')::INTEGER,
        NULLIF(v_exercise->>'target_rpe', '')::INTEGER,
        NULLIF(v_exercise->>'weight_kg', '')::NUMERIC,
        NULLIF(v_exercise->>'notes', ''),
        v_exercise->>'weight_suggestion_basis'
      );
    END LOOP;
  END LOOP;

  UPDATE profiles SET
    days_per_week = CASE WHEN p_profile_updates ? 'days_per_week'
      THEN (p_profile_updates->>'days_per_week')::INTEGER ELSE days_per_week END,
    session_duration_minutes = CASE WHEN p_profile_updates ? 'session_duration_minutes'
      THEN (p_profile_updates->>'session_duration_minutes')::INTEGER ELSE session_duration_minutes END,
    preferred_workout_days = CASE WHEN p_profile_updates ? 'preferred_workout_days'
      THEN ARRAY(
        SELECT jsonb_array_elements_text(
          COALESCE(p_profile_updates->'preferred_workout_days', '[]'::jsonb)
        )::INTEGER
      ) ELSE preferred_workout_days END,
    available_equipment = CASE WHEN p_profile_updates ? 'available_equipment'
      THEN ARRAY(SELECT jsonb_array_elements_text(p_profile_updates->'available_equipment'))
      ELSE available_equipment END,
    cardio_preferences = CASE WHEN p_profile_updates ? 'cardio_preferences'
      THEN ARRAY(SELECT jsonb_array_elements_text(p_profile_updates->'cardio_preferences'))
      ELSE cardio_preferences END
  WHERE id = v_user_id;

  IF p_plan_context <> 'first_plan' THEN
    UPDATE workout_plans
    SET is_active = FALSE, superseded_at = NOW()
    WHERE id = p_expected_parent_plan_id
      AND user_id = v_user_id
      AND is_active = TRUE
      AND retired_at IS NULL
      AND superseded_at IS NULL;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'PLAN_STALE_PARENT: active plan changed';
    END IF;
  ELSE
    UPDATE workout_plans
    SET is_active = FALSE
    WHERE user_id = v_user_id
      AND is_active = TRUE;
  END IF;

  UPDATE workout_plans
  SET is_active = TRUE
  WHERE id = v_plan_id
    AND user_id = v_user_id;

  PERFORM public.record_plan_generation_success(v_plan_id);

  RETURN v_plan_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_engine_plan_v2(JSONB, JSONB, INTEGER, TEXT, UUID, UUID, JSONB)
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_engine_plan_v2(JSONB, JSONB, INTEGER, TEXT, UUID, UUID, JSONB)
  TO authenticated;

COMMENT ON FUNCTION public.create_engine_plan_v2 IS
  'Creates one idempotent plan version and atomically switches active state under a per-user lock.';

CREATE OR REPLACE FUNCTION public.activate_plan_version(p_plan_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_plan workout_plans%ROWTYPE;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(v_user_id::TEXT, 0));

  SELECT * INTO v_plan
  FROM workout_plans
  WHERE id = p_plan_id
    AND user_id = v_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'PLAN_NOT_FOUND';
  END IF;

  IF v_plan.retired_at IS NOT NULL THEN
    RAISE EXCEPTION 'PLAN_VERSION_RETIRED';
  END IF;

  IF v_plan.superseded_at IS NOT NULL THEN
    RAISE EXCEPTION 'PLAN_VERSION_SUPERSEDED';
  END IF;

  UPDATE workout_plans
  SET is_active = FALSE
  WHERE user_id = v_user_id
    AND is_active = TRUE;

  UPDATE workout_plans
  SET is_active = TRUE
  WHERE id = p_plan_id
    AND user_id = v_user_id
    AND retired_at IS NULL
    AND superseded_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'PLAN_VERSION_UNAVAILABLE';
  END IF;

  RETURN p_plan_id;
END;
$$;

REVOKE ALL ON FUNCTION public.activate_plan_version(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.activate_plan_version(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.retire_plan_family(p_plan_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_target_plan workout_plans%ROWTYPE;
  v_family_id UUID;
  v_was_active BOOLEAN;
  v_active_plan_id UUID;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(v_user_id::TEXT, 0));

  SELECT * INTO v_target_plan
  FROM workout_plans
  WHERE id = p_plan_id
    AND user_id = v_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'PLAN_NOT_FOUND';
  END IF;

  v_family_id := v_target_plan.family_id;

  SELECT EXISTS (
    SELECT 1
    FROM workout_plans
    WHERE user_id = v_user_id
      AND family_id = v_family_id
      AND is_active = TRUE
  ) INTO v_was_active;

  UPDATE workout_plans
  SET retired_at = COALESCE(retired_at, NOW()), is_active = FALSE
  WHERE family_id = v_family_id
    AND user_id = v_user_id;

  IF v_was_active THEN
    SELECT id INTO v_active_plan_id
    FROM workout_plans
    WHERE user_id = v_user_id
      AND family_id <> v_family_id
      AND retired_at IS NULL
      AND superseded_at IS NULL
    ORDER BY created_at DESC, id DESC
    LIMIT 1
    FOR UPDATE;

    IF v_active_plan_id IS NOT NULL THEN
      UPDATE workout_plans
      SET is_active = TRUE
      WHERE id = v_active_plan_id
        AND user_id = v_user_id
        AND retired_at IS NULL
        AND superseded_at IS NULL;
    END IF;
  ELSE
    SELECT id INTO v_active_plan_id
    FROM workout_plans
    WHERE user_id = v_user_id
      AND is_active = TRUE
      AND retired_at IS NULL
      AND superseded_at IS NULL
    LIMIT 1;
  END IF;

  RETURN v_active_plan_id;
END;
$$;

REVOKE ALL ON FUNCTION public.retire_plan_family(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.retire_plan_family(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.create_manual_plan_atomic(
  p_plan JSONB,
  p_workouts JSONB,
  p_make_active BOOLEAN DEFAULT TRUE
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_plan_id UUID;
  v_family_id UUID := gen_random_uuid();
  v_subscription_tier TEXT;
  v_family_count INTEGER;
  v_workout JSONB;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NULLIF(BTRIM(p_plan->>'name'), '') IS NULL THEN
    RAISE EXCEPTION 'Manual plan name is required';
  END IF;

  IF jsonb_typeof(p_workouts) IS DISTINCT FROM 'array'
    OR jsonb_array_length(p_workouts) = 0 THEN
    RAISE EXCEPTION 'Manual plan has no workouts';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(v_user_id::TEXT, 0));

  SELECT subscription_tier INTO v_subscription_tier
  FROM profiles
  WHERE id = v_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Profile not found';
  END IF;

  IF COALESCE(v_subscription_tier, 'free') = 'free' THEN
    SELECT COUNT(DISTINCT family_id)::INTEGER INTO v_family_count
    FROM workout_plans
    WHERE user_id = v_user_id
      AND retired_at IS NULL
      AND superseded_at IS NULL;

    IF v_family_count >= 2 THEN
      RAISE EXCEPTION 'PLAN_FAMILY_LIMIT: free plan family limit reached';
    END IF;
  END IF;

  INSERT INTO workout_plans (
    user_id,
    name,
    goal,
    duration_weeks,
    days_per_week,
    difficulty,
    is_active,
    generated_by_ai,
    plan_context,
    source_type,
    manually_updated_at,
    family_id
  ) VALUES (
    v_user_id,
    BTRIM(p_plan->>'name'),
    NULLIF(BTRIM(p_plan->>'goal'), ''),
    COALESCE((p_plan->>'duration_weeks')::INTEGER, 1),
    jsonb_array_length(p_workouts),
    NULLIF(p_plan->>'difficulty', ''),
    FALSE,
    FALSE,
    'manual_update',
    'manual',
    NOW(),
    v_family_id
  )
  RETURNING id INTO v_plan_id;

  FOR v_workout IN
    SELECT value FROM jsonb_array_elements(COALESCE(p_workouts, '[]'::jsonb))
  LOOP
    IF NULLIF(BTRIM(v_workout->>'name'), '') IS NULL THEN
      RAISE EXCEPTION 'Manual workout name is required';
    END IF;

    INSERT INTO workouts (
      user_id,
      plan_id,
      name,
      focus,
      day_of_week,
      order_in_plan,
      estimated_duration_minutes
    ) VALUES (
      v_user_id,
      v_plan_id,
      BTRIM(v_workout->>'name'),
      NULLIF(BTRIM(v_workout->>'focus'), ''),
      (v_workout->>'day_of_week')::INTEGER,
      (v_workout->>'order_in_plan')::INTEGER,
      COALESCE((v_workout->>'estimated_duration_minutes')::INTEGER, 60)
    );
  END LOOP;

  IF p_make_active THEN
    UPDATE workout_plans
    SET is_active = FALSE
    WHERE user_id = v_user_id
      AND is_active = TRUE;

    UPDATE workout_plans
    SET is_active = TRUE
    WHERE id = v_plan_id
      AND user_id = v_user_id
      AND retired_at IS NULL
      AND superseded_at IS NULL;
  END IF;

  RETURN v_plan_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_manual_plan_atomic(JSONB, JSONB, BOOLEAN) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_manual_plan_atomic(JSONB, JSONB, BOOLEAN) TO authenticated;

CREATE OR REPLACE FUNCTION public.clone_plan_from_post_atomic(p_post_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_source_user_id UUID;
  v_snapshot JSONB;
  v_plan_id UUID;
  v_family_id UUID := gen_random_uuid();
  v_subscription_tier TEXT;
  v_family_count INTEGER;
  v_workout JSONB;
  v_workout_id UUID;
  v_exercise JSONB;
  v_order_in_plan INTEGER := -1;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(v_user_id::TEXT, 0));

  -- SECURITY INVOKER keeps the current posts SELECT policy authoritative:
  -- removed, blocked or private posts unavailable to this user are not visible.
  SELECT user_id, routine_snapshot
  INTO v_source_user_id, v_snapshot
  FROM posts
  WHERE id = p_post_id
    AND routine_snapshot IS NOT NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'POST_ROUTINE_NOT_FOUND_OR_UNAVAILABLE';
  END IF;

  IF NULLIF(BTRIM(v_snapshot->>'name'), '') IS NULL
    OR jsonb_typeof(v_snapshot->'workouts') IS DISTINCT FROM 'array'
    OR jsonb_array_length(v_snapshot->'workouts') = 0 THEN
    RAISE EXCEPTION 'POST_ROUTINE_INVALID';
  END IF;

  SELECT subscription_tier INTO v_subscription_tier
  FROM profiles
  WHERE id = v_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Profile not found';
  END IF;

  IF COALESCE(v_subscription_tier, 'free') = 'free' THEN
    SELECT COUNT(DISTINCT family_id)::INTEGER INTO v_family_count
    FROM workout_plans
    WHERE user_id = v_user_id
      AND retired_at IS NULL
      AND superseded_at IS NULL;

    IF v_family_count >= 2 THEN
      RAISE EXCEPTION 'PLAN_FAMILY_LIMIT: free plan family limit reached';
    END IF;
  END IF;

  INSERT INTO workout_plans (
    user_id,
    name,
    goal,
    duration_weeks,
    days_per_week,
    difficulty,
    is_active,
    generated_by_ai,
    plan_context,
    source_type,
    source_post_id,
    source_user_id,
    family_id
  ) VALUES (
    v_user_id,
    BTRIM(v_snapshot->>'name'),
    NULLIF(BTRIM(v_snapshot->>'goal'), ''),
    1,
    COALESCE(NULLIF(v_snapshot->>'days_per_week', '')::INTEGER, jsonb_array_length(v_snapshot->'workouts')),
    NULLIF(v_snapshot->>'difficulty', ''),
    FALSE,
    FALSE,
    'first_plan',
    'shared_post',
    p_post_id,
    v_source_user_id,
    v_family_id
  )
  RETURNING id INTO v_plan_id;

  FOR v_workout IN
    SELECT value FROM jsonb_array_elements(v_snapshot->'workouts')
  LOOP
    v_order_in_plan := v_order_in_plan + 1;

    IF NULLIF(BTRIM(v_workout->>'name'), '') IS NULL
      OR jsonb_typeof(v_workout->'exercises') IS DISTINCT FROM 'array' THEN
      RAISE EXCEPTION 'POST_ROUTINE_INVALID';
    END IF;

    INSERT INTO workouts (
      user_id,
      plan_id,
      name,
      day_of_week,
      order_in_plan
    ) VALUES (
      v_user_id,
      v_plan_id,
      BTRIM(v_workout->>'name'),
      NULLIF(v_workout->>'day_of_week', '')::INTEGER,
      v_order_in_plan
    )
    RETURNING id INTO v_workout_id;

    FOR v_exercise IN
      SELECT value FROM jsonb_array_elements(v_workout->'exercises')
    LOOP
      INSERT INTO workout_exercises (
        workout_id,
        exercise_id,
        order_index,
        sets,
        reps,
        rest_seconds,
        weight_kg
      ) VALUES (
        v_workout_id,
        (v_exercise->>'exercise_id')::UUID,
        COALESCE((v_exercise->>'order_index')::INTEGER, 0),
        NULLIF(v_exercise->>'sets', '')::INTEGER,
        NULLIF(v_exercise->>'reps', '')::INTEGER,
        NULLIF(v_exercise->>'rest_seconds', '')::INTEGER,
        NULLIF(v_exercise->>'weight_kg', '')::NUMERIC
      );
    END LOOP;
  END LOOP;

  RETURN v_plan_id;
END;
$$;

REVOKE ALL ON FUNCTION public.clone_plan_from_post_atomic(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.clone_plan_from_post_atomic(UUID) TO authenticated;

-- The v1 RPC cannot express an expected parent or a durable request ID. Keep
-- the function definition for migration compatibility, but close it as an
-- authenticated lifecycle entry point so callers cannot bypass v2 invariants.
REVOKE ALL ON FUNCTION public.create_engine_plan(JSONB, JSONB, INTEGER, TEXT, UUID, JSONB)
  FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.create_engine_plan(JSONB, JSONB, INTEGER, TEXT, UUID, JSONB)
  FROM authenticated;
