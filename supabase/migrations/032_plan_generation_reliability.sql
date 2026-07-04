-- Generation reliability: serialize per user, make retries idempotent, enforce
-- product limits in PostgreSQL, and expose aggregate success metrics.

CREATE TABLE IF NOT EXISTS public.plan_generation_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  plan_id UUID UNIQUE REFERENCES public.workout_plans(id) ON DELETE SET NULL,
  mode TEXT NOT NULL CHECK (mode IN ('initial', 'weekly_regeneration', 'plan_adjustment')),
  generator TEXT NOT NULL CHECK (generator IN ('evidence_engine', 'legacy_ai')),
  success BOOLEAN NOT NULL,
  engine_version TEXT,
  error_code TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.plan_generation_events ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_plan_generation_events_created
  ON public.plan_generation_events (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_plan_generation_events_user_created
  ON public.plan_generation_events (user_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.record_plan_generation_failure(
  p_mode TEXT,
  p_engine_version TEXT,
  p_error_code TEXT,
  p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF p_mode NOT IN ('initial', 'weekly_regeneration', 'plan_adjustment') THEN
    RAISE EXCEPTION 'Invalid generation mode';
  END IF;

  INSERT INTO plan_generation_events (
    user_id, mode, generator, success, engine_version, error_code, metadata
  ) VALUES (
    v_user_id, p_mode, 'evidence_engine', FALSE, p_engine_version,
    LEFT(COALESCE(p_error_code, 'unknown'), 120), COALESCE(p_metadata, '{}'::jsonb)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.record_plan_generation_failure(TEXT, TEXT, TEXT, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_plan_generation_failure(TEXT, TEXT, TEXT, JSONB) TO authenticated;

CREATE OR REPLACE FUNCTION public.record_plan_generation_success(p_plan_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_plan workout_plans%ROWTYPE;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT * INTO v_plan
  FROM workout_plans
  WHERE id = p_plan_id AND user_id = v_user_id AND source_type = 'engine';
  IF NOT FOUND THEN RAISE EXCEPTION 'Engine plan not found'; END IF;

  INSERT INTO plan_generation_events (
    user_id, plan_id, mode, generator, success, engine_version, metadata
  ) VALUES (
    v_user_id,
    v_plan.id,
    CASE v_plan.plan_context
      WHEN 'first_plan' THEN 'initial'
      WHEN 'weekly_regeneration' THEN 'weekly_regeneration'
      ELSE 'plan_adjustment'
    END,
    'evidence_engine',
    TRUE,
    v_plan.generation_metadata->>'engineVersion',
    jsonb_build_object('weekNumber', v_plan.week_number)
  )
  ON CONFLICT (plan_id) DO NOTHING;
END;
$$;

REVOKE ALL ON FUNCTION public.record_plan_generation_success(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_plan_generation_success(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.create_engine_plan(
  p_plan JSONB,
  p_metadata JSONB,
  p_week_number INTEGER,
  p_plan_context TEXT,
  p_parent_plan_id UUID DEFAULT NULL,
  p_profile_updates JSONB DEFAULT '{}'::jsonb
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_plan_id UUID;
  v_recent_plan_id UUID;
  v_generation_count INTEGER;
  v_workout_id UUID;
  v_day JSONB;
  v_exercise JSONB;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_plan_context NOT IN ('first_plan', 'weekly_regeneration', 'manual_update') THEN
    RAISE EXCEPTION 'Invalid plan context';
  END IF;

  IF jsonb_array_length(COALESCE(p_plan->'days', '[]'::jsonb)) = 0 THEN
    RAISE EXCEPTION 'Plan has no days';
  END IF;

  -- Only one generation transaction per user can enter the critical section.
  PERFORM pg_advisory_xact_lock(hashtextextended(v_user_id::TEXT, 0));

  -- A retry/double tap for the same operation returns the committed result.
  SELECT id INTO v_recent_plan_id
  FROM workout_plans
  WHERE user_id = v_user_id
    AND plan_context = p_plan_context
    AND (
      p_plan_context IN ('first_plan', 'weekly_regeneration')
      OR parent_plan_id IS NOT DISTINCT FROM p_parent_plan_id
    )
    AND source_type = 'engine'
    AND created_at >= NOW() - INTERVAL '30 seconds'
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_recent_plan_id IS NOT NULL THEN
    RETURN v_recent_plan_id;
  END IF;

  IF p_plan_context = 'first_plan' THEN
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
  ELSIF p_plan_context = 'weekly_regeneration' THEN
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

  UPDATE workout_plans
  SET is_active = FALSE
  WHERE user_id = v_user_id AND is_active = TRUE;

  INSERT INTO workout_plans (
    user_id, name, goal, duration_weeks, days_per_week, difficulty,
    is_active, generated_by_ai, ai_notes, week_number, plan_context,
    parent_plan_id, source_type, generation_metadata
  ) VALUES (
    v_user_id,
    p_plan->>'display_name',
    p_plan->>'goal',
    1,
    jsonb_array_length(p_plan->'days'),
    NULLIF(p_plan->>'difficulty', ''),
    TRUE,
    FALSE,
    p_plan->>'ai_notes',
    GREATEST(1, p_week_number),
    p_plan_context,
    p_parent_plan_id,
    'engine',
    COALESCE(p_metadata, '{}'::jsonb)
  )
  RETURNING id INTO v_plan_id;

  FOR v_day IN SELECT value FROM jsonb_array_elements(p_plan->'days')
  LOOP
    IF jsonb_array_length(COALESCE(v_day->'exercises', '[]'::jsonb)) = 0 THEN
      RAISE EXCEPTION 'Workout day has no exercises';
    END IF;

    INSERT INTO workouts (
      user_id, plan_id, name, focus, day_of_week, order_in_plan,
      estimated_duration_minutes
    ) VALUES (
      v_user_id,
      v_plan_id,
      v_day->>'display_name',
      v_day->>'focus',
      (v_day->>'day_of_week')::INTEGER,
      (v_day->>'day_number')::INTEGER,
      (v_day->>'estimated_duration_minutes')::INTEGER
    )
    RETURNING id INTO v_workout_id;

    FOR v_exercise IN SELECT value FROM jsonb_array_elements(v_day->'exercises')
    LOOP
      INSERT INTO workout_exercises (
        workout_id, exercise_id, order_index, sets, reps, duration_seconds,
        rest_seconds, target_rpe, weight_kg, notes, weight_suggestion_basis
      ) VALUES (
        v_workout_id,
        (v_exercise->>'exercise_id')::UUID,
        COALESCE((v_exercise->>'order_index')::INTEGER, 1),
        (v_exercise->>'sets')::INTEGER,
        NULLIF(v_exercise->>'reps', '')::INTEGER,
        NULLIF(v_exercise->>'duration_seconds', '')::INTEGER,
        (v_exercise->>'rest_seconds')::INTEGER,
        (v_exercise->>'target_rpe')::INTEGER,
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
      THEN ARRAY(SELECT jsonb_array_elements_text(COALESCE(p_profile_updates->'preferred_workout_days', '[]'::jsonb))::INTEGER)
      ELSE preferred_workout_days END,
    available_equipment = CASE WHEN p_profile_updates ? 'available_equipment'
      THEN ARRAY(SELECT jsonb_array_elements_text(p_profile_updates->'available_equipment'))
      ELSE available_equipment END,
    cardio_preferences = CASE WHEN p_profile_updates ? 'cardio_preferences'
      THEN ARRAY(SELECT jsonb_array_elements_text(p_profile_updates->'cardio_preferences'))
      ELSE cardio_preferences END
  WHERE id = v_user_id;

  -- Runs in the same transaction; a later failure rolls the event back too.
  PERFORM public.record_plan_generation_success(v_plan_id);

  RETURN v_plan_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_engine_plan(JSONB, JSONB, INTEGER, TEXT, UUID, JSONB)
  TO authenticated;

COMMENT ON FUNCTION public.create_engine_plan IS
  'Atomically and idempotently replaces the active plan with per-user serialization and generation limits.';

CREATE OR REPLACE VIEW public.plan_generation_daily
WITH (security_invoker = true) AS
SELECT
  date_trunc('day', created_at AT TIME ZONE 'UTC') AS day,
  plan_context,
  COALESCE(generation_metadata->>'engineVersion', 'unknown') AS engine_version,
  COUNT(*) AS successful_generations
FROM workout_plans
WHERE source_type = 'engine'
GROUP BY 1, 2, 3
ORDER BY 1 DESC, 2, 3;

REVOKE ALL ON public.plan_generation_daily FROM anon, authenticated;
GRANT SELECT ON public.plan_generation_daily TO service_role;

CREATE OR REPLACE VIEW public.plan_generation_health_daily
WITH (security_invoker = true) AS
SELECT
  date_trunc('day', created_at AT TIME ZONE 'UTC') AS day,
  mode,
  generator,
  COALESCE(engine_version, 'unknown') AS engine_version,
  COUNT(*) AS attempts,
  COUNT(*) FILTER (WHERE success) AS successes,
  COUNT(*) FILTER (WHERE NOT success) AS failures,
  CASE WHEN COUNT(*) > 0
    THEN ROUND((COUNT(*) FILTER (WHERE success))::NUMERIC / COUNT(*)::NUMERIC, 4)
    ELSE 0
  END AS success_rate
FROM public.plan_generation_events
GROUP BY 1, 2, 3, 4
ORDER BY 1 DESC, 2, 3, 4;

REVOKE ALL ON public.plan_generation_health_daily FROM anon, authenticated;
GRANT SELECT ON public.plan_generation_health_daily TO service_role;
