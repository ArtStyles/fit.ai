BEGIN;

-- Available professional assignments are independent of the client's principal
-- plan. The trusted role is the caller of these INVOKER triggers, never the
-- owner of a SECURITY DEFINER trigger. Authenticated callers cannot impersonate
-- postgres by setting custom GUCs.
CREATE OR REPLACE FUNCTION public.guard_plan_lifecycle_mutation() RETURNS trigger
    LANGUAGE plpgsql SECURITY INVOKER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_actor_role TEXT := COALESCE(auth.role(), '');
  v_target_user_id UUID;
  v_trusted_actor TEXT := current_setting('app.plan_lifecycle_actor', TRUE);
  v_changes_lifecycle BOOLEAN := FALSE;
BEGIN
  -- GoTrue deletes auth.users as supabase_auth_admin. The resulting FK cascade
  -- must be allowed to remove owned plans, but this internal role receives no
  -- lifecycle write bypass for inserts or updates.
  IF TG_OP = 'DELETE' AND session_user = 'supabase_auth_admin' THEN
    RETURN OLD;
  END IF;

  IF v_actor_role = 'service_role'
    OR session_user IN ('postgres', 'supabase_admin') THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    v_target_user_id := OLD.user_id;
    v_changes_lifecycle := TRUE;
  ELSIF TG_OP = 'INSERT' THEN
    v_target_user_id := NEW.user_id;
    v_changes_lifecycle := TRUE;
  ELSE
    v_target_user_id := NEW.user_id;
    v_changes_lifecycle := NEW.user_id IS DISTINCT FROM OLD.user_id
      OR NEW.family_id IS DISTINCT FROM OLD.family_id
      OR NEW.parent_plan_id IS DISTINCT FROM OLD.parent_plan_id
      OR NEW.generation_request_id IS DISTINCT FROM OLD.generation_request_id
      OR NEW.retired_at IS DISTINCT FROM OLD.retired_at
      OR NEW.superseded_at IS DISTINCT FROM OLD.superseded_at
      OR NEW.is_active IS DISTINCT FROM OLD.is_active;
  END IF;

  IF NOT v_changes_lifecycle THEN
    RETURN NEW;
  END IF;

  IF current_user = 'postgres' AND v_trusted_actor = v_target_user_id::TEXT THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;

  IF auth.uid() IS NULL
    OR auth.uid() IS DISTINCT FROM v_target_user_id
    OR v_trusted_actor IS DISTINCT FROM v_target_user_id::TEXT THEN
    RAISE EXCEPTION 'PLAN_DIRECT_LIFECYCLE_MUTATION_FORBIDDEN';
  END IF;

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;


CREATE OR REPLACE FUNCTION public.enforce_plan_family_limit() RETURNS trigger
    LANGUAGE plpgsql SECURITY INVOKER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_actor_id UUID := auth.uid();
  v_actor_role TEXT := COALESCE(auth.role(), '');
  v_subscription_tier TEXT;
  v_family_count INTEGER;
  v_family_exists BOOLEAN;
BEGIN
  IF v_actor_id IS NULL THEN
    IF v_actor_role <> 'service_role' AND session_user NOT IN ('postgres', 'supabase_admin') THEN
      RAISE EXCEPTION 'Not authenticated';
    END IF;
  ELSIF v_actor_id <> NEW.user_id
    AND NOT (current_user = 'postgres' AND current_setting('app.plan_lifecycle_actor', TRUE) IS NOT DISTINCT FROM NEW.user_id::TEXT)
    AND v_actor_role <> 'service_role'
    AND session_user NOT IN ('postgres', 'supabase_admin') THEN
    RAISE EXCEPTION 'PLAN_OWNERSHIP_MISMATCH';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(NEW.user_id::TEXT, 0));
  IF NEW.is_active AND (NEW.retired_at IS NOT NULL OR NEW.superseded_at IS NOT NULL) THEN
    RAISE EXCEPTION 'PLAN_VERSION_UNAVAILABLE';
  END IF;
  IF NEW.retired_at IS NOT NULL OR NEW.superseded_at IS NOT NULL OR NEW.library_slot <> 'personal' THEN
    RETURN NEW;
  END IF;

  SELECT subscription_tier INTO v_subscription_tier FROM profiles WHERE id = NEW.user_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Profile not found'; END IF;
  IF COALESCE(v_subscription_tier, 'free') = 'free' THEN
    SELECT COUNT(DISTINCT family_id)::INTEGER INTO v_family_count
    FROM workout_plans
    WHERE user_id = NEW.user_id AND library_slot = 'personal'
      AND retired_at IS NULL AND superseded_at IS NULL AND id <> NEW.id;
    SELECT EXISTS (
      SELECT 1 FROM workout_plans
      WHERE user_id = NEW.user_id AND library_slot = 'personal' AND family_id = NEW.family_id
        AND retired_at IS NULL AND superseded_at IS NULL AND id <> NEW.id
    ) INTO v_family_exists;
    IF NOT v_family_exists AND v_family_count >= 2 THEN
      RAISE EXCEPTION 'PLAN_FAMILY_LIMIT: free plan family limit reached';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;


DROP INDEX IF EXISTS public.trainer_plan_assignments_one_active_client;

-- Each request is recorded, including requests deduplicated to a retained copy.
-- This prevents an old alternative key from recreating a copy after removal.
CREATE TABLE IF NOT EXISTS private.trainer_assignment_requests (
  trainer_user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  idempotency_key TEXT NOT NULL CHECK (char_length(btrim(idempotency_key)) BETWEEN 1 AND 200),
  relationship_id UUID NOT NULL REFERENCES public.coaching_relationships(id) ON DELETE RESTRICT,
  template_id UUID NOT NULL REFERENCES public.trainer_program_templates(id) ON DELETE RESTRICT,
  assignment_id UUID NOT NULL REFERENCES public.trainer_plan_assignments(id) ON DELETE RESTRICT,
  assignment_version_id UUID NOT NULL REFERENCES public.trainer_assignment_versions(id) ON DELETE RESTRICT,
  workout_plan_id UUID NOT NULL REFERENCES public.workout_plans(id) ON DELETE RESTRICT,
  PRIMARY KEY (trainer_user_id, idempotency_key)
);
ALTER TABLE private.trainer_assignment_requests OWNER TO postgres;
REVOKE ALL ON private.trainer_assignment_requests FROM PUBLIC, anon, authenticated, service_role;

-- Preserve historical request results before repairing pending/duplicate rows.
INSERT INTO private.trainer_assignment_requests
SELECT a.trainer_user_id,a.proposal_idempotency_key,a.relationship_id,a.source_template_id,a.id,v.id,v.materialized_plan_id
FROM public.trainer_plan_assignments a JOIN public.trainer_assignment_versions v ON v.assignment_id=a.id AND v.version_number=1
WHERE a.proposal_idempotency_key IS NOT NULL AND a.source_template_id IS NOT NULL AND v.materialized_plan_id IS NOT NULL
ON CONFLICT DO NOTHING;

-- The ledger's creation is the atomic first-install/backfill boundary. An
-- existing ledger, even an empty one, means availability no longer proves
-- selection: direct assignments and later revisions may never have been used.
-- Capture accepted legacy windows before repairing pending/duplicate copies.
DO $$
BEGIN
  IF to_regclass('private.trainer_plan_selection_periods') IS NULL THEN
    CREATE TABLE private.trainer_plan_selection_periods (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      client_user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
      plan_id UUID NOT NULL REFERENCES public.workout_plans(id) ON DELETE RESTRICT,
      started_at TIMESTAMPTZ NOT NULL,
      ended_at TIMESTAMPTZ,
      CHECK (ended_at IS NULL OR ended_at > started_at)
    );

    -- Legacy acceptance and publication selected immediately. Closed version
    -- intervals are recoverable even when their plans are superseded/frozen.
    -- Only a still-selected, available plan proves an open-ended interval;
    -- an inactive legacy copy without a known end cannot establish one.
    INSERT INTO private.trainer_plan_selection_periods(client_user_id,plan_id,started_at,ended_at)
    SELECT p.user_id,p.id,GREATEST(v.effective_from,a.accepted_at),v.effective_to
    FROM public.workout_plans p
    JOIN public.trainer_assignment_versions v ON v.id=p.trainer_assignment_version_id AND v.materialized_plan_id=p.id
    JOIN public.trainer_plan_assignments a ON a.id=p.trainer_assignment_id AND v.assignment_id=a.id
      AND a.client_user_id=p.user_id AND a.relationship_id=p.trainer_relationship_id
    WHERE a.accepted_at IS NOT NULL
      AND p.library_slot='professional' AND p.source_type='trainer_assigned' AND p.prescription_locked
      AND v.status IN ('active','frozen','superseded')
      AND (
        v.effective_to > GREATEST(v.effective_from,a.accepted_at)
        OR (v.effective_to IS NULL AND p.is_active AND p.retired_at IS NULL AND p.superseded_at IS NULL
          AND a.status IN ('active','frozen'))
      );
  END IF;
END;
$$;
ALTER TABLE private.trainer_plan_selection_periods OWNER TO postgres;
REVOKE ALL ON private.trainer_plan_selection_periods FROM PUBLIC,anon,authenticated,service_role;
CREATE UNIQUE INDEX IF NOT EXISTS trainer_plan_selection_periods_one_open_client
ON private.trainer_plan_selection_periods(client_user_id) WHERE ended_at IS NULL;
CREATE INDEX IF NOT EXISTS trainer_plan_selection_periods_plan_time
ON private.trainer_plan_selection_periods(plan_id,started_at);

CREATE OR REPLACE FUNCTION private.track_trainer_plan_selection() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE changed_at TIMESTAMPTZ:=clock_timestamp();
BEGIN
  -- Table RLS and BEFORE guards have already validated this actual row change.
  -- No GUC grants permission to write selection history.
  IF NEW.library_slot<>'professional' THEN RETURN NEW; END IF;
  IF NOT NEW.is_active OR NEW.retired_at IS NOT NULL OR NEW.superseded_at IS NOT NULL THEN
    UPDATE private.trainer_plan_selection_periods period
    SET ended_at=GREATEST(changed_at,period.started_at+INTERVAL '1 microsecond')
    WHERE period.plan_id=NEW.id AND period.ended_at IS NULL;
  ELSIF NOT EXISTS (SELECT 1 FROM private.trainer_plan_selection_periods period WHERE period.plan_id=NEW.id AND period.ended_at IS NULL) THEN
    UPDATE private.trainer_plan_selection_periods period
    SET ended_at=GREATEST(changed_at,period.started_at+INTERVAL '1 microsecond')
    WHERE period.client_user_id=NEW.user_id AND period.ended_at IS NULL;
    INSERT INTO private.trainer_plan_selection_periods(client_user_id,plan_id,started_at)
    VALUES(NEW.user_id,NEW.id,changed_at);
  END IF;
  RETURN NEW;
END;
$$;
ALTER FUNCTION private.track_trainer_plan_selection() OWNER TO postgres;
REVOKE ALL ON FUNCTION private.track_trainer_plan_selection() FROM PUBLIC,anon,authenticated,service_role;
DROP TRIGGER IF EXISTS trg_track_trainer_plan_selection ON public.workout_plans;
CREATE TRIGGER trg_track_trainer_plan_selection
AFTER INSERT OR UPDATE OF is_active,retired_at,superseded_at ON public.workout_plans
FOR EACH ROW EXECUTE FUNCTION private.track_trainer_plan_selection();

-- Resolve legacy pending proposals using the immutable materialization. Never
-- create another copy, change principal choice, or invent client acceptance.
DO $$
DECLARE
  a public.trainer_plan_assignments%ROWTYPE;
  v public.trainer_assignment_versions%ROWTYPE;
  p public.workout_plans%ROWTYPE;
  valid BOOLEAN;
BEGIN
  FOR a IN SELECT * FROM public.trainer_plan_assignments WHERE status='proposed' ORDER BY created_at,id FOR UPDATE LOOP
    SELECT * INTO v FROM public.trainer_assignment_versions WHERE assignment_id=a.id AND version_number=1;
    SELECT * INTO p FROM public.workout_plans WHERE id=v.materialized_plan_id;
    valid := v.id IS NOT NULL AND v.status='proposed' AND p.id IS NOT NULL
      AND p.user_id=a.client_user_id AND p.trainer_relationship_id=a.relationship_id
      AND p.trainer_assignment_id=a.id AND p.trainer_assignment_version_id=v.id
      AND p.source_type='trainer_assigned' AND p.library_slot='professional' AND p.prescription_locked
      AND NOT p.is_active AND p.retired_at IS NULL AND p.superseded_at IS NULL
      AND EXISTS (SELECT 1 FROM public.coaching_relationships r
        JOIN public.profiles trainer ON trainer.id=r.trainer_user_id AND trainer.account_status='active'
        JOIN public.profiles client ON client.id=r.client_user_id AND client.account_status='active'
        JOIN public.trainer_profiles professional ON professional.user_id=r.trainer_user_id AND professional.status='active'
        WHERE r.id=a.relationship_id AND r.trainer_user_id=a.trainer_user_id AND r.client_user_id=a.client_user_id AND r.status='active'
          AND EXISTS (SELECT 1 FROM public.coaching_consents c WHERE c.relationship_id=r.id AND c.scope='training_profile' AND c.revoked_at IS NULL))
      AND EXISTS (SELECT 1 FROM public.trainer_program_templates t WHERE t.id=a.source_template_id AND t.trainer_user_id=a.trainer_user_id AND t.status<>'archived')
      AND (SELECT count(*) FROM public.workouts w WHERE w.plan_id=p.id)=p.days_per_week
      AND NOT EXISTS (SELECT 1 FROM public.workouts w WHERE w.plan_id=p.id AND NOT EXISTS (SELECT 1 FROM public.workout_exercises e JOIN public.exercises catalog ON catalog.id=e.exercise_id AND catalog.is_public WHERE e.workout_id=w.id))
      AND NOT EXISTS (SELECT 1 FROM public.workouts w JOIN public.workout_exercises e ON e.workout_id=w.id LEFT JOIN public.exercises catalog ON catalog.id=e.exercise_id AND catalog.is_public WHERE w.plan_id=p.id AND catalog.id IS NULL)
      AND NOT EXISTS (SELECT 1 FROM public.trainer_plan_assignments retained WHERE retained.id<>a.id AND retained.trainer_user_id=a.trainer_user_id AND retained.client_user_id=a.client_user_id AND retained.source_template_id=a.source_template_id AND retained.status IN ('active','frozen'));
    IF COALESCE(valid,FALSE) THEN
      UPDATE public.trainer_assignment_versions SET status='active',effective_from=clock_timestamp() WHERE id=v.id;
      UPDATE public.trainer_plan_assignments SET status='active',active_version_id=v.id WHERE id=a.id;
    ELSE
      PERFORM set_config('app.plan_lifecycle_actor',a.client_user_id::TEXT,TRUE);
      PERFORM set_config('app.trainer_prescription_mutation','authorized',TRUE);
      UPDATE public.workout_plans SET is_active=FALSE,retired_at=COALESCE(retired_at,clock_timestamp()) WHERE trainer_assignment_id=a.id;
      UPDATE public.trainer_assignment_versions SET status='cancelled',effective_to=COALESCE(effective_to,GREATEST(clock_timestamp(),effective_from+INTERVAL '1 microsecond')) WHERE assignment_id=a.id AND status IN ('proposed','active','frozen');
      UPDATE public.trainer_plan_assignments SET status='cancelled' WHERE id=a.id;
    END IF;
  END LOOP;
  -- Earlier acceptance cancelled other proposals without retiring their copies.
  -- Close that legacy library exposure, preserving every historical row.
  FOR a IN SELECT * FROM public.trainer_plan_assignments WHERE status='cancelled' LOOP
    PERFORM set_config('app.plan_lifecycle_actor',a.client_user_id::TEXT,TRUE);
    PERFORM set_config('app.trainer_prescription_mutation','authorized',TRUE);
    UPDATE public.workout_plans SET is_active=FALSE,retired_at=COALESCE(retired_at,clock_timestamp())
    WHERE trainer_assignment_id=a.id AND (retired_at IS NULL OR is_active);
    UPDATE public.trainer_assignment_versions
    SET status='cancelled',effective_to=COALESCE(effective_to,GREATEST(clock_timestamp(),effective_from+INTERVAL '1 microsecond'))
    WHERE assignment_id=a.id AND status IN ('proposed','active','frozen');
  END LOOP;
  -- Older releases allowed the same template to survive across relationships.
  -- Keep the selected copy first, then active, then the oldest retained copy.
  FOR a IN
    SELECT assignment.* FROM public.trainer_plan_assignments assignment JOIN (
      SELECT id,row_number() OVER (PARTITION BY trainer_user_id,client_user_id,source_template_id
        ORDER BY EXISTS(SELECT 1 FROM public.workout_plans selected_plan WHERE selected_plan.trainer_assignment_id=retained.id AND selected_plan.is_active) DESC,
          (status='active') DESC,created_at,id) ordinal
      FROM public.trainer_plan_assignments retained WHERE status IN ('active','frozen') AND source_template_id IS NOT NULL
    ) duplicates ON duplicates.id=assignment.id WHERE duplicates.ordinal>1
  LOOP
    PERFORM set_config('app.plan_lifecycle_actor',a.client_user_id::TEXT,TRUE);
    PERFORM set_config('app.trainer_prescription_mutation','authorized',TRUE);
    UPDATE public.workout_plans SET is_active=FALSE,retired_at=COALESCE(retired_at,clock_timestamp()) WHERE trainer_assignment_id=a.id;
    UPDATE public.trainer_assignment_versions SET status='cancelled',effective_to=COALESCE(effective_to,GREATEST(clock_timestamp(),effective_from+INTERVAL '1 microsecond')) WHERE assignment_id=a.id AND status IN ('active','frozen');
    UPDATE public.trainer_plan_assignments SET status='cancelled' WHERE id=a.id;
  END LOOP;
END;
$$;

-- Flush reciprocal deferred identity checks before indexing the repaired rows.
SET CONSTRAINTS ALL IMMEDIATE;
SET CONSTRAINTS ALL DEFERRED;
CREATE UNIQUE INDEX IF NOT EXISTS trainer_assignments_retained_template_unique
ON public.trainer_plan_assignments(trainer_user_id,client_user_id,source_template_id)
WHERE status IN ('proposed','active','frozen') AND source_template_id IS NOT NULL;

CREATE OR REPLACE FUNCTION private.trainer_assignment_selection_windows(
  p_relationship_id UUID,p_from_date DATE,p_to_date DATE,p_timezone TEXT
) RETURNS TABLE(version_id UUID,selection_id UUID,effective_from TIMESTAMPTZ,effective_to TIMESTAMPTZ,first_for_version BOOLEAN)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path=public,pg_temp AS $$
  SELECT version.id,period.id,period.started_at,period.ended_at,
    row_number() OVER(PARTITION BY version.id ORDER BY period.started_at,period.id)=1
  FROM private.trainer_plan_selection_periods period
  JOIN public.workout_plans plan ON plan.id=period.plan_id AND plan.user_id=period.client_user_id
  JOIN public.trainer_assignment_versions version ON version.id=plan.trainer_assignment_version_id AND version.materialized_plan_id=plan.id
  JOIN public.trainer_plan_assignments assignment ON assignment.id=version.assignment_id AND assignment.id=plan.trainer_assignment_id
  WHERE assignment.relationship_id=p_relationship_id AND plan.trainer_relationship_id=p_relationship_id
    AND period.started_at < ((p_to_date+1)::TIMESTAMP AT TIME ZONE p_timezone)
    AND COALESCE(period.ended_at,'infinity'::TIMESTAMPTZ) > (p_from_date::TIMESTAMP AT TIME ZONE p_timezone);
$$;
ALTER FUNCTION private.trainer_assignment_selection_windows(UUID,DATE,DATE,TEXT) OWNER TO postgres;
REVOKE ALL ON FUNCTION private.trainer_assignment_selection_windows(UUID,DATE,DATE,TEXT) FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.assign_trainer_program(p_relationship_id uuid, p_template_id uuid, p_change_summary text, p_idempotency_key text) RETURNS TABLE(assignment_id uuid, assignment_version_id uuid, workout_plan_id uuid)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_trainer_user_id UUID := auth.uid();
  v_client_user_id UUID;
  v_relationship public.coaching_relationships%ROWTYPE;
  v_template public.trainer_program_templates%ROWTYPE;
  v_assignment_id UUID;
  v_assignment_version_id UUID;
  v_workout_plan_id UUID;
  v_request private.trainer_assignment_requests%ROWTYPE;
  v_snapshot JSONB;
  v_snapshot_workouts JSONB;
  v_workout JSONB;
  v_exercise JSONB;
  v_materialized_workout_id UUID;
  v_workout_count INTEGER;
  v_exercise_count INTEGER;
BEGIN
  IF v_trainer_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF p_relationship_id IS NULL OR p_template_id IS NULL
    OR NULLIF(BTRIM(COALESCE(p_idempotency_key, '')), '') IS NULL THEN
    RAISE EXCEPTION 'TRAINER_ASSIGNMENT_PROPOSAL_INVALID';
  END IF;
  IF char_length(BTRIM(p_idempotency_key)) > 200
    OR (p_change_summary IS NOT NULL AND char_length(BTRIM(p_change_summary)) > 1000) THEN
    RAISE EXCEPTION 'TRAINER_ASSIGNMENT_PROPOSAL_INVALID';
  END IF;

  -- Acquire the client lock before any mutable relationship state. This is the
  -- same lock order as acceptance/end flows and serializes proposals per client.
  SELECT relationship.client_user_id INTO v_client_user_id
  FROM public.coaching_relationships relationship
  WHERE relationship.id = p_relationship_id;
  IF v_client_user_id IS NULL THEN
    RAISE EXCEPTION 'COACHING_RELATIONSHIP_NOT_FOUND';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(v_client_user_id::TEXT, 0));
  -- This is the exact administrative suspension lock. Revalidate every
  -- trainer/relationship row only after it has been acquired.
  PERFORM pg_advisory_xact_lock(hashtextextended(v_trainer_user_id::TEXT, 0));

  SELECT * INTO v_relationship
  FROM public.coaching_relationships relationship
  WHERE relationship.id = p_relationship_id
    AND relationship.trainer_user_id = v_trainer_user_id
  FOR UPDATE;
  IF NOT FOUND OR v_relationship.status <> 'active' THEN
    RAISE EXCEPTION 'COACHING_RELATIONSHIP_NOT_ACTIVE';
  END IF;
  IF v_relationship.client_user_id <> v_client_user_id THEN
    RAISE EXCEPTION 'COACHING_RELATIONSHIP_NOT_FOUND';
  END IF;

  PERFORM 1 FROM public.profiles profile
  WHERE profile.id = v_trainer_user_id AND profile.account_status = 'active'
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'TRAINER_ASSIGNMENT_TRAINER_INACTIVE'; END IF;
  PERFORM 1 FROM public.trainer_profiles profile
  WHERE profile.user_id = v_trainer_user_id AND profile.status = 'active'
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'TRAINER_ASSIGNMENT_TRAINER_INACTIVE'; END IF;
  PERFORM 1 FROM public.profiles profile
  WHERE profile.id = v_client_user_id AND profile.account_status = 'active'
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'TRAINER_ASSIGNMENT_CLIENT_INACTIVE'; END IF;

  SELECT * INTO v_request FROM private.trainer_assignment_requests request
  WHERE request.trainer_user_id=v_trainer_user_id AND request.idempotency_key=BTRIM(p_idempotency_key);
  IF FOUND THEN
    IF v_request.relationship_id<>p_relationship_id OR v_request.template_id<>p_template_id THEN
      RAISE EXCEPTION 'TRAINER_ASSIGNMENT_IDEMPOTENCY_MISMATCH';
    END IF;
    RETURN QUERY SELECT v_request.assignment_id,v_request.assignment_version_id,v_request.workout_plan_id;
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.coaching_consents consent
    WHERE consent.relationship_id = v_relationship.id
      AND consent.scope = 'training_profile'
      AND consent.revoked_at IS NULL
  ) THEN
    RAISE EXCEPTION 'TRAINER_ASSIGNMENT_CONSENT_REQUIRED';
  END IF;
  SELECT assignment.id,version.id,version.materialized_plan_id
  INTO v_assignment_id,v_assignment_version_id,v_workout_plan_id
  FROM public.trainer_plan_assignments assignment
  JOIN public.trainer_assignment_versions version ON version.id=assignment.active_version_id
  WHERE assignment.trainer_user_id=v_trainer_user_id AND assignment.client_user_id=v_client_user_id
    AND assignment.source_template_id=p_template_id AND assignment.status IN ('active','frozen')
  FOR UPDATE OF assignment;
  IF FOUND THEN
    INSERT INTO private.trainer_assignment_requests VALUES (v_trainer_user_id,BTRIM(p_idempotency_key),p_relationship_id,p_template_id,v_assignment_id,v_assignment_version_id,v_workout_plan_id);
    RETURN QUERY SELECT v_assignment_id,v_assignment_version_id,v_workout_plan_id;
    RETURN;
  END IF;

  SELECT * INTO v_template
  FROM public.trainer_program_templates template
  WHERE template.id = p_template_id
    AND template.trainer_user_id = v_trainer_user_id
    AND template.status <> 'archived'
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'TRAINER_ASSIGNMENT_TEMPLATE_NOT_AVAILABLE'; END IF;

  SELECT COUNT(*)::INTEGER INTO v_workout_count
  FROM public.trainer_template_workouts workout
  WHERE workout.template_id = v_template.id;
  IF v_workout_count <> v_template.days_per_week THEN
    RAISE EXCEPTION 'TRAINER_ASSIGNMENT_TEMPLATE_INCOMPLETE';
  END IF;
  SELECT COUNT(*)::INTEGER INTO v_exercise_count
  FROM public.trainer_template_exercises exercise
  JOIN public.trainer_template_workouts workout ON workout.id = exercise.template_workout_id
  JOIN public.exercises catalog ON catalog.id = exercise.exercise_id AND catalog.is_public = TRUE
  WHERE workout.template_id = v_template.id;
  IF v_exercise_count = 0 OR EXISTS (
    SELECT 1
    FROM public.trainer_template_workouts workout
    WHERE workout.template_id = v_template.id
      AND NOT EXISTS (SELECT 1 FROM public.trainer_template_exercises exercise WHERE exercise.template_workout_id = workout.id)
  ) OR EXISTS (
    SELECT 1
    FROM public.trainer_template_exercises exercise
    JOIN public.trainer_template_workouts workout ON workout.id = exercise.template_workout_id
    LEFT JOIN public.exercises catalog ON catalog.id = exercise.exercise_id AND catalog.is_public = TRUE
    WHERE workout.template_id = v_template.id AND catalog.id IS NULL
  ) THEN
    RAISE EXCEPTION 'TRAINER_ASSIGNMENT_TEMPLATE_INCOMPLETE';
  END IF;

  SELECT jsonb_agg(
    jsonb_build_object(
      'sourceTemplateWorkoutId', row.id,
      'name', row.name,
      'dayOfWeek', row.day_of_week,
      'orderInPlan', row.order_in_plan,
      'exercises', row.exercises
    ) ORDER BY row.day_of_week, row.order_in_plan, row.id
  ) INTO v_snapshot_workouts
  FROM (
    SELECT workout.id, workout.name, workout.day_of_week, workout.order_in_plan,
      jsonb_agg(jsonb_build_object(
        'sourceTemplateExerciseId', exercise.id,
        'exerciseId', exercise.exercise_id,
        'orderIndex', exercise.order_index,
        'sets', exercise.sets,
        'reps', exercise.reps,
        'weightKg', exercise.weight_kg,
        'targetRpe', exercise.target_rpe,
        'restSeconds', exercise.rest_seconds,
        'notes', exercise.notes
      ) ORDER BY exercise.order_index, exercise.id) AS exercises
    FROM public.trainer_template_workouts workout
    JOIN public.trainer_template_exercises exercise ON exercise.template_workout_id = workout.id
    WHERE workout.template_id = v_template.id
    GROUP BY workout.id, workout.name, workout.day_of_week, workout.order_in_plan
  ) AS row;
  v_snapshot := jsonb_build_object(
    'schemaVersion', 1,
    'name', v_template.name,
    'goal', v_template.goal,
    'description', v_template.description,
    'daysPerWeek', v_template.days_per_week,
    'workouts', v_snapshot_workouts
  );

  INSERT INTO public.trainer_plan_assignments (
    relationship_id, trainer_user_id, client_user_id, source_template_id, status, proposal_idempotency_key
  ) VALUES (
    v_relationship.id, v_trainer_user_id, v_client_user_id, v_template.id, 'active', BTRIM(p_idempotency_key)
  ) RETURNING id INTO v_assignment_id;
  INSERT INTO public.trainer_assignment_versions (
    assignment_id, version_number, snapshot, change_summary, status
  ) VALUES (
    v_assignment_id, 1, v_snapshot, NULLIF(BTRIM(p_change_summary), ''), 'active'
  ) RETURNING id INTO v_assignment_version_id;
  PERFORM set_config('app.plan_lifecycle_actor',v_client_user_id::TEXT,TRUE);
  PERFORM set_config('app.trainer_prescription_mutation','authorized',TRUE);
  INSERT INTO public.workout_plans (
    user_id, name, goal, duration_weeks, days_per_week, is_active,
    generated_by_ai, plan_context, source_type, family_id, library_slot,
    trainer_relationship_id, trainer_assignment_id, trainer_assignment_version_id, prescription_locked
  ) VALUES (
    v_client_user_id, v_template.name, v_template.goal, 1, v_template.days_per_week, FALSE,
    FALSE, 'first_plan', 'trainer_assigned', gen_random_uuid(), 'professional',
    v_relationship.id, v_assignment_id, v_assignment_version_id, TRUE
  ) RETURNING id INTO v_workout_plan_id;

  PERFORM set_config('app.trainer_prescription_mutation', 'authorized', TRUE);

  FOR v_workout IN SELECT value FROM jsonb_array_elements(v_snapshot->'workouts')
  LOOP
    INSERT INTO public.workouts (user_id, plan_id, name, day_of_week, order_in_plan)
    VALUES (
      v_client_user_id, v_workout_plan_id, v_workout->>'name', NULLIF(v_workout->>'dayOfWeek', '')::INTEGER,
      NULLIF(v_workout->>'orderInPlan', '')::INTEGER
    ) RETURNING id INTO v_materialized_workout_id;
    FOR v_exercise IN SELECT value FROM jsonb_array_elements(v_workout->'exercises')
    LOOP
      INSERT INTO public.workout_exercises (
        workout_id, exercise_id, order_index, sets, reps, rest_seconds, weight_kg, target_rpe, notes
      ) VALUES (
        v_materialized_workout_id, (v_exercise->>'exerciseId')::UUID,
        (v_exercise->>'orderIndex')::INTEGER, (v_exercise->>'sets')::INTEGER,
        (v_exercise->>'reps')::INTEGER, (v_exercise->>'restSeconds')::INTEGER,
        NULLIF(v_exercise->>'weightKg', '')::NUMERIC,
        NULLIF(v_exercise->>'targetRpe', '')::NUMERIC, NULLIF(v_exercise->>'notes', '')
      );
    END LOOP;
  END LOOP;
  UPDATE public.trainer_assignment_versions
  SET materialized_plan_id = v_workout_plan_id
  WHERE id = v_assignment_version_id;

  UPDATE public.trainer_plan_assignments SET active_version_id=v_assignment_version_id WHERE id=v_assignment_id;
  INSERT INTO private.trainer_assignment_requests VALUES (v_trainer_user_id,BTRIM(p_idempotency_key),p_relationship_id,p_template_id,v_assignment_id,v_assignment_version_id,v_workout_plan_id);

  INSERT INTO public.professional_audit_logs (
    actor_user_id, subject_user_id, entity_type, entity_id, action, metadata
  ) VALUES (
    v_trainer_user_id, v_client_user_id, 'trainer_plan_assignment', v_assignment_id,
    'assigned', jsonb_build_object('relationship_id', v_relationship.id, 'version_number', 1)
  );
  PERFORM public.create_product_notification(
    v_client_user_id, 'coaching_assignment_status', 'Nueva rutina profesional',
    'Tu entrenador añadió una rutina a tu biblioteca.', '/plan',
    'coaching-assignment-assigned:' || v_assignment_id::TEXT,
    jsonb_build_object('assignment_id', v_assignment_id, 'version_number', 1)
  );

  RETURN QUERY SELECT v_assignment_id, v_assignment_version_id, v_workout_plan_id;
END;
$$;


CREATE OR REPLACE FUNCTION public.propose_trainer_assignment(p_relationship_id uuid,p_template_id uuid,p_change_summary text,p_idempotency_key text)
RETURNS TABLE(assignment_id uuid,assignment_version_id uuid,workout_plan_id uuid)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
  RETURN QUERY SELECT * FROM public.assign_trainer_program(p_relationship_id,p_template_id,p_change_summary,p_idempotency_key);
END;
$$;

-- Obsolete clients may still acknowledge delivery. This read-only compatibility
-- entry point never records acceptance, changes selection, or resurrects rows.
CREATE OR REPLACE FUNCTION public.accept_trainer_assignment(p_assignment_id uuid,p_idempotency_key text)
RETURNS TABLE(assignment_id uuid,workout_plan_id uuid)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE a public.trainer_plan_assignments%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(auth.uid()::TEXT,0));
  SELECT * INTO a FROM public.trainer_plan_assignments WHERE id=p_assignment_id AND client_user_id=auth.uid();
  IF NOT FOUND THEN RAISE EXCEPTION 'TRAINER_ASSIGNMENT_NOT_FOUND'; END IF;
  IF a.status NOT IN ('active','frozen') OR NOT public.is_account_active(auth.uid()) THEN RAISE EXCEPTION 'TRAINER_ASSIGNMENT_NOT_AVAILABLE'; END IF;
  RETURN QUERY SELECT a.id,v.materialized_plan_id FROM public.trainer_assignment_versions v
    JOIN public.workout_plans p ON p.id=v.materialized_plan_id AND p.retired_at IS NULL AND p.superseded_at IS NULL
    WHERE v.id=a.active_version_id AND v.assignment_id=a.id AND v.status IN ('active','frozen');
  IF NOT FOUND THEN RAISE EXCEPTION 'TRAINER_ASSIGNMENT_NOT_AVAILABLE'; END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.activate_plan_version(p_plan_id uuid) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_plan public.workout_plans%ROWTYPE;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT public.is_account_active(v_user_id) THEN RAISE EXCEPTION 'PLAN_ACCOUNT_INACTIVE'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(v_user_id::TEXT, 0));
  PERFORM set_config('app.plan_lifecycle_actor', v_user_id::TEXT, TRUE);
  SELECT * INTO v_plan FROM public.workout_plans
  WHERE id = p_plan_id AND user_id = v_user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'PLAN_NOT_FOUND'; END IF;
  IF v_plan.retired_at IS NOT NULL THEN RAISE EXCEPTION 'PLAN_VERSION_RETIRED'; END IF;
  IF v_plan.superseded_at IS NOT NULL THEN RAISE EXCEPTION 'PLAN_VERSION_SUPERSEDED'; END IF;
  IF v_plan.library_slot='professional' AND NOT EXISTS (
    SELECT 1 FROM public.trainer_plan_assignments a JOIN public.trainer_assignment_versions v ON v.id=a.active_version_id AND v.assignment_id=a.id
    WHERE a.id=v_plan.trainer_assignment_id AND a.client_user_id=v_user_id AND a.relationship_id=v_plan.trainer_relationship_id
      AND a.status IN ('active','frozen') AND v.status IN ('active','frozen') AND v.id=v_plan.trainer_assignment_version_id AND v.materialized_plan_id=v_plan.id
  ) THEN RAISE EXCEPTION 'TRAINER_ASSIGNMENT_NOT_AVAILABLE'; END IF;
  IF v_plan.is_active THEN RETURN v_plan.id; END IF;
  PERFORM set_config('app.trainer_prescription_mutation','authorized',TRUE);
  UPDATE public.workout_plans SET is_active = FALSE WHERE user_id = v_user_id AND is_active = TRUE;
  UPDATE public.workout_plans SET is_active = TRUE
  WHERE id = v_plan.id AND user_id = v_user_id AND retired_at IS NULL AND superseded_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'PLAN_VERSION_UNAVAILABLE'; END IF;
  RETURN v_plan.id;
END;
$$;


-- Independent personal creation retains invoker RLS, validation, limits and
-- logging. Only the validated selection RPC changes the principal professional
-- copy; callers never gain authority to change its prescription.
CREATE OR REPLACE FUNCTION public.create_engine_plan_v2(p_plan jsonb, p_metadata jsonb, p_week_number integer, p_plan_context text, p_expected_parent_plan_id uuid, p_generation_request_id uuid, p_profile_updates jsonb DEFAULT '{}'::jsonb) RETURNS uuid
    LANGUAGE plpgsql SECURITY INVOKER
    SET search_path TO 'public'
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
  PERFORM set_config('app.plan_lifecycle_actor', v_user_id::TEXT, TRUE);
  IF p_plan_context IS DISTINCT FROM 'first_plan' THEN
    PERFORM public.assert_professional_plan_replaceable(v_user_id);
  END IF;

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
        AND library_slot = 'personal'
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
    generation_request_id,
    library_slot
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
    p_generation_request_id,
    'personal'
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
  END IF;

  -- Selecting a new personal family can deselect a locked professional copy.
  -- The existing RPC validates ownership and availability under its real role.
  PERFORM public.activate_plan_version(v_plan_id);

  PERFORM public.record_plan_generation_success(v_plan_id);

  RETURN v_plan_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_manual_plan_atomic(p_plan jsonb, p_workouts jsonb, p_make_active boolean DEFAULT true) RETURNS uuid
    LANGUAGE plpgsql SECURITY INVOKER
    SET search_path TO 'public'
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
  PERFORM set_config('app.plan_lifecycle_actor', v_user_id::TEXT, TRUE);

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
      AND library_slot = 'personal'
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
    family_id,
    library_slot
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
    v_family_id,
    'personal'
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
    PERFORM public.activate_plan_version(v_plan_id);
  END IF;

  RETURN v_plan_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.remove_trainer_assignment(p_plan_id uuid) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE
  actor uuid:=auth.uid();
  p public.workout_plans%ROWTYPE;
  a public.trainer_plan_assignments%ROWTYPE;
  was_principal boolean;
  fallback uuid;
BEGIN
  IF actor IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT public.is_account_active(actor) THEN RAISE EXCEPTION 'PLAN_ACCOUNT_INACTIVE'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(actor::TEXT,0));
  SELECT * INTO p FROM public.workout_plans WHERE id=p_plan_id AND user_id=actor;
  IF NOT FOUND THEN RAISE EXCEPTION 'PLAN_NOT_FOUND'; END IF;
  IF p.library_slot<>'professional' OR p.trainer_assignment_id IS NULL THEN RAISE EXCEPTION 'TRAINER_ASSIGNMENT_PLAN_INVALID'; END IF;
  SELECT * INTO a FROM public.trainer_plan_assignments WHERE id=p.trainer_assignment_id AND client_user_id=actor;
  IF NOT FOUND THEN RAISE EXCEPTION 'TRAINER_ASSIGNMENT_PLAN_INVALID'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(a.trainer_user_id::TEXT,0));
  -- End/revoke serialize on the relationship row before their freeze trigger
  -- locks versions and assignments. Join that protocol before holding either
  -- child row, including when removal is allowed after pause or termination.
  PERFORM 1 FROM public.coaching_relationships relationship
  WHERE relationship.id=a.relationship_id AND relationship.client_user_id=actor
    AND relationship.trainer_user_id=a.trainer_user_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'TRAINER_ASSIGNMENT_PLAN_INVALID'; END IF;
  SELECT * INTO a FROM public.trainer_plan_assignments assignment
  WHERE assignment.id=a.id AND assignment.client_user_id=actor
    AND assignment.relationship_id=a.relationship_id AND assignment.trainer_user_id=a.trainer_user_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'TRAINER_ASSIGNMENT_PLAN_INVALID'; END IF;
  SELECT EXISTS(SELECT 1 FROM public.workout_plans WHERE trainer_assignment_id=a.id AND is_active) INTO was_principal;
  PERFORM set_config('app.plan_lifecycle_actor',actor::TEXT,TRUE);
  PERFORM set_config('app.trainer_prescription_mutation','authorized',TRUE);
  UPDATE public.workout_plans SET is_active=FALSE,retired_at=COALESCE(retired_at,clock_timestamp()) WHERE trainer_assignment_id=a.id AND user_id=actor;
  UPDATE public.trainer_assignment_versions SET status='cancelled',effective_to=COALESCE(effective_to,GREATEST(clock_timestamp(),effective_from+INTERVAL '1 microsecond')) WHERE assignment_id=a.id AND status IN ('proposed','active','frozen');
  UPDATE public.trainer_plan_assignments SET status='cancelled' WHERE id=a.id AND status<>'cancelled';
  IF FOUND THEN
    INSERT INTO public.professional_audit_logs(actor_user_id,subject_user_id,entity_type,entity_id,action,metadata)
    VALUES(actor,actor,'trainer_plan_assignment',a.id,'removed',jsonb_build_object('relationship_id',a.relationship_id));
  END IF;
  IF was_principal THEN
    SELECT plan.id INTO fallback FROM public.workout_plans plan
    WHERE plan.user_id=actor AND plan.retired_at IS NULL AND plan.superseded_at IS NULL
      AND (plan.library_slot='personal' OR EXISTS(SELECT 1 FROM public.trainer_plan_assignments retained JOIN public.trainer_assignment_versions version ON version.id=retained.active_version_id AND version.assignment_id=retained.id WHERE retained.id=plan.trainer_assignment_id AND retained.status IN ('active','frozen') AND version.materialized_plan_id=plan.id AND version.status IN ('active','frozen')))
    ORDER BY plan.created_at DESC,plan.id DESC LIMIT 1;
    IF fallback IS NOT NULL THEN PERFORM public.activate_plan_version(fallback); END IF;
  END IF;
  RETURN p_plan_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.publish_trainer_assignment_revision(p_assignment_id uuid, p_template_id uuid, p_change_summary text, p_idempotency_key text) RETURNS TABLE(assignment_id uuid, assignment_version_id uuid, workout_plan_id uuid)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_trainer_user_id UUID := auth.uid();
  v_assignment public.trainer_plan_assignments%ROWTYPE;
  v_relationship public.coaching_relationships%ROWTYPE;
  v_template public.trainer_program_templates%ROWTYPE;
  v_previous_version public.trainer_assignment_versions%ROWTYPE;
  v_new_version_id UUID;
  v_new_plan_id UUID;
  v_target_client_id UUID;
  v_target_trainer_id UUID;
  v_target_relationship_id UUID;
  v_was_principal BOOLEAN;
  v_snapshot JSONB;
  v_snapshot_workouts JSONB;
  v_workout JSONB;
  v_exercise JSONB;
  v_materialized_workout_id UUID;
  v_workout_count INTEGER;
  v_exercise_count INTEGER;
  v_version_number INTEGER;
BEGIN
  IF v_trainer_user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF p_assignment_id IS NULL OR p_template_id IS NULL
    OR NULLIF(BTRIM(COALESCE(p_change_summary, '')), '') IS NULL
    OR NULLIF(BTRIM(COALESCE(p_idempotency_key, '')), '') IS NULL
    OR char_length(BTRIM(p_change_summary)) > 1000
    OR char_length(BTRIM(p_idempotency_key)) > 200 THEN
    RAISE EXCEPTION 'TRAINER_ASSIGNMENT_REVISION_INVALID';
  END IF;

  -- Discovery selects locks only. Every mutable row is re-read below.
  SELECT client_user_id, trainer_user_id, relationship_id
  INTO v_target_client_id, v_target_trainer_id, v_target_relationship_id
  FROM public.trainer_plan_assignments WHERE id = p_assignment_id;
  IF v_target_client_id IS NULL OR v_target_trainer_id <> v_trainer_user_id THEN
    RAISE EXCEPTION 'TRAINER_ASSIGNMENT_NOT_FOUND';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(v_target_client_id::TEXT, 0));
  PERFORM pg_advisory_xact_lock(hashtextextended(v_trainer_user_id::TEXT, 0));

  -- Canonical mutable-row order: client/trainer accounts, trainer profile,
  -- relationship, assignment, versions, then the source template and plan.
  PERFORM 1 FROM public.profiles WHERE id = v_target_client_id AND account_status = 'active' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'TRAINER_ASSIGNMENT_CLIENT_INACTIVE'; END IF;
  PERFORM 1 FROM public.profiles WHERE id = v_trainer_user_id AND account_status = 'active' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'TRAINER_ASSIGNMENT_TRAINER_INACTIVE'; END IF;
  PERFORM 1 FROM public.trainer_profiles WHERE user_id = v_trainer_user_id AND status = 'active' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'TRAINER_ASSIGNMENT_TRAINER_INACTIVE'; END IF;
  SELECT * INTO v_relationship FROM public.coaching_relationships
  WHERE id = v_target_relationship_id AND client_user_id = v_target_client_id AND trainer_user_id = v_trainer_user_id
  FOR UPDATE;
  IF NOT FOUND OR v_relationship.status <> 'active' THEN RAISE EXCEPTION 'COACHING_RELATIONSHIP_NOT_ACTIVE'; END IF;
  SELECT * INTO v_assignment FROM public.trainer_plan_assignments
  WHERE id = p_assignment_id AND client_user_id = v_target_client_id
    AND trainer_user_id = v_trainer_user_id AND relationship_id = v_target_relationship_id
  FOR UPDATE;
  IF NOT FOUND OR v_assignment.status <> 'active' OR v_assignment.active_version_id IS NULL THEN
    RAISE EXCEPTION 'TRAINER_ASSIGNMENT_NOT_ACTIVE';
  END IF;

  SELECT id, materialized_plan_id INTO v_new_version_id, v_new_plan_id
  FROM public.trainer_assignment_versions version
  WHERE version.assignment_id = v_assignment.id AND version.revision_idempotency_key = BTRIM(p_idempotency_key)
  FOR UPDATE;
  IF FOUND THEN
    RETURN QUERY SELECT v_assignment.id, v_new_version_id, v_new_plan_id;
    RETURN;
  END IF;

  SELECT * INTO v_previous_version FROM public.trainer_assignment_versions version
  WHERE version.id = v_assignment.active_version_id AND version.assignment_id = v_assignment.id
  FOR UPDATE;
  IF NOT FOUND OR v_previous_version.status <> 'active' OR v_previous_version.materialized_plan_id IS NULL THEN
    RAISE EXCEPTION 'TRAINER_ASSIGNMENT_VERSION_NOT_ACTIVE';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.coaching_consents c WHERE c.relationship_id=v_relationship.id AND c.scope='training_profile' AND c.revoked_at IS NULL) THEN RAISE EXCEPTION 'TRAINER_ASSIGNMENT_CONSENT_REQUIRED'; END IF;
  IF EXISTS (SELECT 1 FROM public.trainer_plan_assignments retained WHERE retained.id<>v_assignment.id AND retained.trainer_user_id=v_trainer_user_id AND retained.client_user_id=v_target_client_id AND retained.source_template_id=p_template_id AND retained.status IN ('proposed','active','frozen')) THEN RAISE EXCEPTION 'TRAINER_ASSIGNMENT_TEMPLATE_ALREADY_ASSIGNED'; END IF;
  SELECT is_active INTO v_was_principal FROM public.workout_plans WHERE id=v_previous_version.materialized_plan_id AND retired_at IS NULL AND superseded_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'TRAINER_ASSIGNMENT_PLAN_INVALID'; END IF;
  SELECT * INTO v_template FROM public.trainer_program_templates
  WHERE id = p_template_id AND trainer_user_id = v_trainer_user_id AND status <> 'archived'
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'TRAINER_ASSIGNMENT_TEMPLATE_NOT_AVAILABLE'; END IF;
  SELECT COUNT(*)::INTEGER INTO v_workout_count FROM public.trainer_template_workouts WHERE template_id = v_template.id;
  SELECT COUNT(*)::INTEGER INTO v_exercise_count
  FROM public.trainer_template_exercises exercise
  JOIN public.trainer_template_workouts workout ON workout.id = exercise.template_workout_id
  JOIN public.exercises catalog ON catalog.id = exercise.exercise_id AND catalog.is_public = TRUE
  WHERE workout.template_id = v_template.id;
  IF v_workout_count <> v_template.days_per_week OR v_exercise_count = 0
    OR EXISTS (SELECT 1 FROM public.trainer_template_workouts workout WHERE workout.template_id = v_template.id AND NOT EXISTS (SELECT 1 FROM public.trainer_template_exercises exercise WHERE exercise.template_workout_id = workout.id))
    OR EXISTS (SELECT 1 FROM public.trainer_template_exercises exercise JOIN public.trainer_template_workouts workout ON workout.id = exercise.template_workout_id LEFT JOIN public.exercises catalog ON catalog.id = exercise.exercise_id AND catalog.is_public = TRUE WHERE workout.template_id = v_template.id AND catalog.id IS NULL) THEN
    RAISE EXCEPTION 'TRAINER_ASSIGNMENT_TEMPLATE_INCOMPLETE';
  END IF;

  SELECT jsonb_agg(jsonb_build_object('sourceTemplateWorkoutId', row.id, 'name', row.name, 'dayOfWeek', row.day_of_week, 'orderInPlan', row.order_in_plan, 'exercises', row.exercises) ORDER BY row.day_of_week, row.order_in_plan, row.id)
  INTO v_snapshot_workouts
  FROM (
    SELECT workout.id, workout.name, workout.day_of_week, workout.order_in_plan,
      jsonb_agg(jsonb_build_object('sourceTemplateExerciseId', exercise.id, 'exerciseId', exercise.exercise_id, 'orderIndex', exercise.order_index, 'sets', exercise.sets, 'reps', exercise.reps, 'weightKg', exercise.weight_kg, 'targetRpe', exercise.target_rpe, 'restSeconds', exercise.rest_seconds, 'notes', exercise.notes) ORDER BY exercise.order_index, exercise.id) AS exercises
    FROM public.trainer_template_workouts workout
    JOIN public.trainer_template_exercises exercise ON exercise.template_workout_id = workout.id
    WHERE workout.template_id = v_template.id
    GROUP BY workout.id, workout.name, workout.day_of_week, workout.order_in_plan
  ) AS row;
  v_snapshot := jsonb_build_object('schemaVersion', 1, 'name', v_template.name, 'goal', v_template.goal, 'description', v_template.description, 'daysPerWeek', v_template.days_per_week, 'workouts', v_snapshot_workouts);
  SELECT MAX(version.version_number) + 1 INTO v_version_number FROM public.trainer_assignment_versions version WHERE version.assignment_id = v_assignment.id;

  INSERT INTO public.trainer_assignment_versions (assignment_id, version_number, snapshot, change_summary, status, revision_idempotency_key)
  VALUES (v_assignment.id, v_version_number, v_snapshot, BTRIM(p_change_summary), 'proposed', BTRIM(p_idempotency_key))
  RETURNING id INTO v_new_version_id;
  PERFORM set_config('app.plan_lifecycle_actor',v_target_client_id::TEXT,TRUE);
  PERFORM set_config('app.trainer_prescription_mutation','authorized',TRUE);
  INSERT INTO public.workout_plans (user_id, name, goal, duration_weeks, days_per_week, is_active, generated_by_ai, plan_context, source_type, family_id, library_slot, trainer_relationship_id, trainer_assignment_id, trainer_assignment_version_id, prescription_locked)
  VALUES (v_target_client_id, v_template.name, v_template.goal, 1, v_template.days_per_week, FALSE, FALSE, 'first_plan', 'trainer_assigned', gen_random_uuid(), 'professional', v_relationship.id, v_assignment.id, v_new_version_id, TRUE)
  RETURNING id INTO v_new_plan_id;
  PERFORM set_config('app.trainer_prescription_mutation', 'authorized', TRUE);
  FOR v_workout IN SELECT value FROM jsonb_array_elements(v_snapshot->'workouts') LOOP
    INSERT INTO public.workouts (user_id, plan_id, name, day_of_week, order_in_plan)
    VALUES (v_target_client_id, v_new_plan_id, v_workout->>'name', NULLIF(v_workout->>'dayOfWeek', '')::INTEGER, NULLIF(v_workout->>'orderInPlan', '')::INTEGER)
    RETURNING id INTO v_materialized_workout_id;
    FOR v_exercise IN SELECT value FROM jsonb_array_elements(v_workout->'exercises') LOOP
      INSERT INTO public.workout_exercises (workout_id, exercise_id, order_index, sets, reps, rest_seconds, weight_kg, target_rpe, notes)
      VALUES (v_materialized_workout_id, (v_exercise->>'exerciseId')::UUID, (v_exercise->>'orderIndex')::INTEGER, (v_exercise->>'sets')::INTEGER, (v_exercise->>'reps')::INTEGER, (v_exercise->>'restSeconds')::INTEGER, NULLIF(v_exercise->>'weightKg', '')::NUMERIC, NULLIF(v_exercise->>'targetRpe', '')::NUMERIC, NULLIF(v_exercise->>'notes', ''));
    END LOOP;
  END LOOP;
  UPDATE public.trainer_assignment_versions SET materialized_plan_id = v_new_plan_id WHERE id = v_new_version_id;

  -- Nothing becomes visible as current until the complete new materialization
  -- exists; any failure above rolls every insert back with this transaction.
  PERFORM set_config('app.plan_lifecycle_actor', v_target_client_id::TEXT, TRUE);
  PERFORM set_config('app.trainer_prescription_mutation', 'authorized', TRUE);
  UPDATE public.workout_plans
  SET is_active=FALSE, superseded_at = COALESCE(superseded_at, NOW())
  WHERE id = v_previous_version.materialized_plan_id
    AND user_id = v_target_client_id;
  UPDATE public.workout_plans SET is_active = v_was_principal WHERE id = v_new_plan_id;
  UPDATE public.trainer_assignment_versions
  SET status = 'superseded', effective_to = GREATEST(clock_timestamp(), v_previous_version.effective_from + INTERVAL '1 microsecond')
  WHERE id = v_previous_version.id;
  UPDATE public.trainer_assignment_versions SET status = 'active', effective_from = NOW() WHERE id = v_new_version_id;
  UPDATE public.trainer_plan_assignments SET active_version_id = v_new_version_id, source_template_id = v_template.id, updated_at = NOW() WHERE id = v_assignment.id;
  INSERT INTO public.professional_audit_logs (actor_user_id, subject_user_id, entity_type, entity_id, action, metadata)
  VALUES (v_trainer_user_id, v_target_client_id, 'trainer_plan_assignment', v_assignment.id, 'revision_published', jsonb_build_object('version_number', v_version_number, 'change_summary', BTRIM(p_change_summary)));
  PERFORM public.create_product_notification(v_target_client_id, 'coaching_assignment_status', 'Rutina profesional actualizada', BTRIM(p_change_summary), '/plan', 'coaching-assignment-revision:' || v_assignment.id::TEXT || ':' || v_version_number::TEXT, jsonb_build_object('assignment_id', v_assignment.id, 'version_number', v_version_number));
  RETURN QUERY SELECT v_assignment.id, v_new_version_id, v_new_plan_id;
END;
$$;


CREATE OR REPLACE FUNCTION public.resume_paused_coaching_relationship(p_relationship_id uuid, p_idempotency_key uuid) RETURNS TABLE(relationship_id uuid, changed boolean)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_client_user_id UUID := auth.uid();
  v_trainer_user_id UUID;
  v_relationship public.coaching_relationships%ROWTYPE;
  v_trainer_account public.profiles%ROWTYPE;
  v_trainer_profile public.trainer_profiles%ROWTYPE;
  v_service public.trainer_service_offerings%ROWTYPE;
  v_frozen_assignment public.trainer_plan_assignments%ROWTYPE;
  v_frozen_version public.trainer_assignment_versions%ROWTYPE;
  v_frozen_plan public.workout_plans%ROWTYPE;
  v_training_version TEXT;
BEGIN
  IF v_client_user_id IS NULL THEN RAISE EXCEPTION 'COACHING_AUTH_REQUIRED'; END IF;
  IF p_relationship_id IS NULL OR p_idempotency_key IS NULL THEN RAISE EXCEPTION 'COACHING_RELATIONSHIP_RESUME_INVALID'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(v_client_user_id::TEXT, 0));
  SELECT relationship.trainer_user_id INTO v_trainer_user_id FROM public.coaching_relationships relationship
  WHERE relationship.id = p_relationship_id AND relationship.client_user_id = v_client_user_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'COACHING_RELATIONSHIP_NOT_FOUND'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(v_trainer_user_id::TEXT, 0));
  IF NOT public.is_account_active(v_client_user_id) THEN RAISE EXCEPTION 'COACHING_TRAINER_NOT_ACTIVE'; END IF;
  SELECT * INTO v_trainer_account FROM public.profiles account WHERE account.id = v_trainer_user_id FOR UPDATE;
  IF NOT FOUND OR v_trainer_account.account_status <> 'active' THEN RAISE EXCEPTION 'COACHING_TRAINER_NOT_ACTIVE'; END IF;
  SELECT * INTO v_trainer_profile FROM public.trainer_profiles trainer_profile WHERE trainer_profile.user_id = v_trainer_user_id FOR UPDATE;
  IF NOT FOUND OR v_trainer_profile.status <> 'active' THEN RAISE EXCEPTION 'COACHING_TRAINER_NOT_ACTIVE'; END IF;
  SELECT * INTO v_relationship FROM public.coaching_relationships relationship
  WHERE relationship.id = p_relationship_id AND relationship.client_user_id = v_client_user_id AND relationship.trainer_user_id = v_trainer_user_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'COACHING_RELATIONSHIP_NOT_FOUND'; END IF;
  IF v_relationship.status <> 'paused_by_platform' THEN
    IF v_relationship.status = 'active' THEN RETURN QUERY SELECT v_relationship.id, FALSE; RETURN; END IF;
    RAISE EXCEPTION 'COACHING_RELATIONSHIP_NOT_PAUSED';
  END IF;
  SELECT * INTO v_service FROM public.trainer_service_offerings service WHERE service.id = v_relationship.service_id AND service.trainer_profile_id = v_trainer_profile.id FOR UPDATE;
  IF NOT FOUND OR v_service.is_active <> TRUE THEN RAISE EXCEPTION 'COACHING_TRAINER_NOT_ACTIVE'; END IF;
  IF EXISTS (SELECT 1 FROM public.coaching_relationships relationship WHERE relationship.client_user_id = v_client_user_id AND relationship.status = 'active' AND relationship.id <> v_relationship.id) THEN RAISE EXCEPTION 'COACHING_ACTIVE_RELATIONSHIP_EXISTS'; END IF;
  SELECT consent.text_version INTO v_training_version FROM public.coaching_consents consent
  WHERE consent.relationship_id = v_relationship.id AND consent.scope = 'training_profile' ORDER BY consent.granted_at DESC, consent.id DESC LIMIT 1;
  IF v_training_version IS NULL THEN RAISE EXCEPTION 'COACHING_TRAINING_CONSENT_REQUIRED'; END IF;

  FOR v_frozen_assignment IN SELECT * FROM public.trainer_plan_assignments assignment
  WHERE assignment.relationship_id = v_relationship.id AND assignment.status = 'frozen'
  ORDER BY assignment.created_at, assignment.id FOR UPDATE LOOP
    SELECT * INTO v_frozen_version FROM public.trainer_assignment_versions version
    WHERE version.id = v_frozen_assignment.active_version_id
      AND version.assignment_id = v_frozen_assignment.id AND version.status = 'frozen'
    FOR UPDATE;
    IF NOT FOUND OR v_frozen_version.materialized_plan_id IS NULL THEN RAISE EXCEPTION 'TRAINER_ASSIGNMENT_VERSION_NOT_FROZEN'; END IF;
    SELECT * INTO v_frozen_plan FROM public.workout_plans plan
    WHERE plan.id = v_frozen_version.materialized_plan_id
      AND plan.user_id = v_client_user_id AND plan.source_type = 'trainer_assigned'
      AND plan.library_slot = 'professional' AND plan.prescription_locked = TRUE
      AND plan.trainer_relationship_id = v_relationship.id
      AND plan.trainer_assignment_id = v_frozen_assignment.id
      AND plan.trainer_assignment_version_id = v_frozen_version.id
    FOR UPDATE;
    IF NOT FOUND OR v_frozen_plan.retired_at IS NOT NULL OR v_frozen_plan.superseded_at IS NOT NULL THEN RAISE EXCEPTION 'TRAINER_ASSIGNMENT_PLAN_INVALID'; END IF;
  END LOOP;

  UPDATE public.coaching_relationships SET status = 'active', paused_at = NULL WHERE id = v_relationship.id;
  UPDATE public.trainer_assignment_versions version SET status='active'
  FROM public.trainer_plan_assignments assignment
  WHERE assignment.relationship_id=v_relationship.id AND assignment.status='frozen'
    AND version.id=assignment.active_version_id AND version.assignment_id=assignment.id AND version.status='frozen';
  UPDATE public.trainer_plan_assignments assignment SET status='active'
  WHERE assignment.relationship_id=v_relationship.id AND assignment.status='frozen';
  UPDATE public.coaching_consents consent
  SET revoked_at = NOW(), revoked_by = v_client_user_id
  WHERE consent.relationship_id = v_relationship.id
    AND consent.scope = 'training_profile'
    AND consent.revoked_at IS NULL;
  INSERT INTO public.coaching_consents (relationship_id, scope, text_version, granted_by)
  VALUES (v_relationship.id, 'training_profile', v_training_version, v_client_user_id);
  INSERT INTO public.professional_audit_logs (actor_user_id, subject_user_id, entity_type, entity_id, action, metadata)
  VALUES (v_client_user_id, v_relationship.trainer_user_id, 'coaching_relationship', v_relationship.id, 'resumed', jsonb_build_object('idempotency_key', p_idempotency_key));
  PERFORM public.create_product_notification(v_client_user_id, 'coaching_relationship_resumed', 'Acompañamiento reanudado', 'Confirmaste la reanudación del acompañamiento.', '/coaching', 'coaching-relationship-resumed:' || v_relationship.id::TEXT || ':' || v_client_user_id::TEXT, jsonb_build_object('relationship_id', v_relationship.id));
  PERFORM public.create_product_notification(v_relationship.trainer_user_id, 'coaching_relationship_resumed', 'Acompañamiento reanudado', 'La persona confirmó la reanudación del acompañamiento.', '/coach/requests', 'coaching-relationship-resumed:' || v_relationship.id::TEXT || ':' || v_relationship.trainer_user_id::TEXT, jsonb_build_object('relationship_id', v_relationship.id));
  RETURN QUERY SELECT v_relationship.id, TRUE;
END;
$$;


CREATE OR REPLACE FUNCTION public.retire_plan_family(p_plan_id uuid) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
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
  PERFORM set_config('app.plan_lifecycle_actor', v_user_id::TEXT, TRUE);

  SELECT * INTO v_target_plan
  FROM workout_plans
  WHERE id = p_plan_id
    AND user_id = v_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'PLAN_NOT_FOUND';
  END IF;

  IF NOT public.is_account_active(v_user_id) THEN RAISE EXCEPTION 'PLAN_ACCOUNT_INACTIVE'; END IF;
  IF v_target_plan.library_slot='professional' THEN RAISE EXCEPTION 'TRAINER_ASSIGNMENT_REMOVE_REQUIRED'; END IF;
  PERFORM set_config('app.trainer_prescription_mutation','authorized',TRUE);
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


CREATE OR REPLACE FUNCTION public.get_coach_client_insights(p_client_id uuid, p_from_date date, p_to_date date) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_trainer_id UUID := auth.uid();
  v_relationship_id UUID;
  v_client_timezone TEXT;
  v_result JSONB;
BEGIN
  IF v_trainer_id IS NULL
    OR p_client_id IS NULL
    OR p_from_date IS NULL
    OR p_to_date IS NULL
    OR p_to_date < p_from_date
    OR p_to_date - p_from_date >= 180 THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'COACH_CLIENT_INSIGHTS_UNAVAILABLE';
  END IF;

  -- One authorization statement validates and locks every row whose mutation
  -- can revoke this projection. Under READ COMMITTED, a concurrent revoker or
  -- account suspension must commit first; EvalPlanQual then rechecks these
  -- predicates before any client-owned evidence is read.
  SELECT
    relationship.id,
    CASE
      WHEN client_account.timezone IS NOT NULL
        AND EXISTS (SELECT 1 FROM pg_catalog.pg_timezone_names AS zone WHERE zone.name = client_account.timezone)
      THEN client_account.timezone
      ELSE 'America/Havana'
    END
  INTO v_relationship_id, v_client_timezone
  FROM public.coaching_relationships AS relationship
  JOIN public.trainer_profiles AS trainer_profile
    ON trainer_profile.user_id = relationship.trainer_user_id
  JOIN public.profiles AS trainer_account
    ON trainer_account.id = trainer_profile.user_id
  JOIN public.profiles AS client_account
    ON client_account.id = relationship.client_user_id
  JOIN public.coaching_consents AS training_consent
    ON training_consent.relationship_id = relationship.id
   AND training_consent.scope = 'training_profile'
   AND training_consent.revoked_at IS NULL
  WHERE relationship.trainer_user_id = v_trainer_id
    AND relationship.client_user_id = p_client_id
    AND relationship.status = 'active'
    AND trainer_profile.status = 'active'
    AND trainer_account.account_status = 'active'
    AND client_account.account_status = 'active'
  FOR SHARE OF relationship, trainer_profile, trainer_account, client_account, training_consent;

  IF v_relationship_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'COACH_CLIENT_INSIGHTS_UNAVAILABLE';
  END IF;

  WITH client_row AS (
    SELECT
      client.id,
      client.full_name,
      client.avatar_url,
      v_client_timezone AS timezone,
      client.fitness_level,
      client.primary_goal,
      client.days_per_week,
      client.session_duration_minutes,
      client.gym_type,
      COALESCE(client.available_equipment, ARRAY[]::TEXT[]) AS available_equipment,
      COALESCE(client.movement_limitations, '[]'::JSONB) AS movement_limitations
    FROM public.profiles AS client
    WHERE client.id = p_client_id
  ), relationship_row AS (
    SELECT relationship.id, relationship.started_at
    FROM public.coaching_relationships AS relationship
    WHERE relationship.id = v_relationship_id
  ), scope_rows AS (
    SELECT COALESCE(jsonb_agg(consent.scope ORDER BY consent.scope), '[]'::JSONB) AS active_scopes
    FROM public.coaching_consents AS consent
    WHERE consent.relationship_id = v_relationship_id
      AND consent.revoked_at IS NULL
      AND consent.scope IN ('training_profile', 'body_measurements')
  ), assignment_rows AS (
    SELECT assignment.id, assignment.active_version_id
    FROM public.trainer_plan_assignments AS assignment
    WHERE assignment.relationship_id = v_relationship_id
  ), selection_windows AS (
    SELECT * FROM private.trainer_assignment_selection_windows(v_relationship_id,p_from_date-2,p_to_date,v_client_timezone)
  ), prescribed_versions AS (
    SELECT DISTINCT version_id FROM selection_windows
  ), versions AS (
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'id', version.id,
      'assignmentId', version.assignment_id,
      'versionNumber', version.version_number,
      'status', version.status,
      'effectiveFrom', selection.effective_from,
      'effectiveTo', selection.effective_to,
      'changeSummary', version.change_summary
    ) ORDER BY selection.effective_from ASC, version.version_number ASC, version.id ASC), '[]'::JSONB) AS value
    FROM public.trainer_assignment_versions AS version
    JOIN selection_windows selection ON selection.version_id=version.id
  ), prescribed_workouts AS (
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'assignmentVersionId', version.id,
      'id', materialized_workout.id,
      'name', workout.value->>'name',
      'dayOfWeek', NULLIF(workout.value->>'dayOfWeek', '')::INTEGER,
      'orderInPlan', NULLIF(workout.value->>'orderInPlan', '')::INTEGER,
      'exercises', COALESCE(workout.value->'exercises', '[]'::JSONB)
    ) ORDER BY version.effective_from ASC, version.version_number ASC,
      NULLIF(workout.value->>'dayOfWeek', '')::INTEGER,
      NULLIF(workout.value->>'orderInPlan', '')::INTEGER), '[]'::JSONB) AS value
    FROM public.trainer_assignment_versions AS version
    JOIN prescribed_versions prescribed ON prescribed.version_id=version.id
    CROSS JOIN LATERAL jsonb_array_elements(COALESCE(version.snapshot->'workouts', '[]'::JSONB)) AS workout(value)
    LEFT JOIN LATERAL (
      SELECT indexed_workout.id
      FROM public.workouts AS indexed_workout
      WHERE indexed_workout.plan_id = version.materialized_plan_id
        AND indexed_workout.day_of_week = NULLIF(workout.value->>'dayOfWeek', '')::INTEGER
        AND indexed_workout.order_in_plan = NULLIF(workout.value->>'orderInPlan', '')::INTEGER
      ORDER BY indexed_workout.id
      LIMIT 1
    ) AS materialized_workout ON TRUE
  ), trusted_sessions AS (
    SELECT
      progress_log.id,
      progress_log.completed_at,
      progress_log.duration_minutes,
      progress_log.mood_rating,
      progress_log.notes,
      session_authorization.workout_id AS trusted_workout_id,
      session_authorization.session_context_snapshot AS authorization_snapshot,
      workout.name AS live_workout_name,
      version.id AS assignment_version_id
    FROM public.progress_logs AS progress_log
    JOIN public.session_authorizations AS session_authorization
      ON session_authorization.client_session_id = progress_log.client_session_id
     AND session_authorization.user_id = progress_log.user_id
     AND session_authorization.consumed_at IS NOT NULL
     AND session_authorization.released_at IS NULL
    JOIN public.workouts AS workout ON workout.id = session_authorization.workout_id
    JOIN public.workout_plans AS plan
      ON plan.id = session_authorization.plan_id
     AND workout.plan_id = plan.id
     AND plan.prescription_locked = TRUE
    JOIN public.trainer_assignment_versions AS version
      ON version.id = plan.trainer_assignment_version_id
     AND version.materialized_plan_id = plan.id
     AND version.status IN ('active', 'superseded', 'frozen', 'cancelled')
    JOIN assignment_rows AS assignment
      ON assignment.id = version.assignment_id
     AND assignment.id = plan.trainer_assignment_id
     AND plan.trainer_relationship_id = v_relationship_id
    WHERE progress_log.user_id = p_client_id
      AND (progress_log.workout_id IS NULL OR progress_log.workout_id = session_authorization.workout_id)
      AND (progress_log.completed_at AT TIME ZONE v_client_timezone)::DATE BETWEEN p_from_date AND p_to_date
  ), sessions AS (
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'id', trusted_session.id,
      'assignmentVersionId', trusted_session.assignment_version_id,
      'completedAt', trusted_session.completed_at,
      'durationMinutes', trusted_session.duration_minutes,
      'moodRating', trusted_session.mood_rating,
      'notes', trusted_session.notes,
      'workout', jsonb_build_object(
        'id', trusted_session.trusted_workout_id,
        'name', COALESCE(trusted_session.authorization_snapshot->'workout'->>'name', trusted_session.live_workout_name)
      ),
      'exerciseResults', COALESCE((
        SELECT COALESCE(jsonb_agg(jsonb_build_object(
          'exerciseId', exercise_log.exercise_id,
          'name', COALESCE(captured_exercise.value->>'name', catalog.name),
          'setsCompleted', exercise_log.sets_completed,
          'repsCompleted', exercise_log.reps_completed,
          'weightsKg', exercise_log.weights_kg,
          'rpeValues', exercise_log.rpe_values,
          'durationSeconds', exercise_log.duration_seconds,
          'notes', exercise_log.notes
        ) ORDER BY exercise_log.id), '[]'::JSONB)
        FROM public.exercise_logs AS exercise_log
        LEFT JOIN public.exercises AS catalog ON catalog.id = exercise_log.exercise_id
        LEFT JOIN LATERAL (
          SELECT snapshot_exercise.value
          FROM jsonb_array_elements(COALESCE(trusted_session.authorization_snapshot->'exercises', '[]'::JSONB)) AS snapshot_exercise(value)
          WHERE snapshot_exercise.value->>'exerciseId' = exercise_log.exercise_id::TEXT
          LIMIT 1
        ) AS captured_exercise ON TRUE
        WHERE exercise_log.progress_log_id = trusted_session.id
      ), '[]'::JSONB)
    ) ORDER BY trusted_session.completed_at DESC, trusted_session.id DESC), '[]'::JSONB) AS value
    FROM trusted_sessions AS trusted_session
  )
  SELECT jsonb_build_object(
    'schemaVersion', 1,
    'client', jsonb_build_object(
      'id', client.id,
      'fullName', client.full_name,
      'avatarUrl', client.avatar_url,
      'timezone', client.timezone,
      'fitnessLevel', client.fitness_level,
      'primaryGoal', client.primary_goal,
      'daysPerWeek', client.days_per_week,
      'sessionDurationMinutes', client.session_duration_minutes,
      'gymType', client.gym_type,
      'availableEquipment', client.available_equipment,
      'movementLimitations', client.movement_limitations
    ),
    'relationship', jsonb_build_object(
      'id', relationship.id,
      'startedAt', relationship.started_at,
      'activeScopes', scope.active_scopes
    ),
    'versions', versions.value,
    'prescribedWorkouts', prescribed_workouts.value,
    'sessions', sessions.value,
    'measurements', NULL
  ) INTO v_result
  FROM client_row AS client
  CROSS JOIN relationship_row AS relationship
  CROSS JOIN scope_rows AS scope
  CROSS JOIN versions
  CROSS JOIN prescribed_workouts
  CROSS JOIN sessions;

  IF v_result IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'COACH_CLIENT_INSIGHTS_UNAVAILABLE';
  END IF;

  RETURN v_result;
END;
$$;


CREATE OR REPLACE FUNCTION public.get_coach_clients_summary() RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_trainer_id UUID := auth.uid();
  v_authorized_trainer_profile_id UUID;
  v_locked_scope_count BIGINT;
  v_result JSONB;
BEGIN
  IF v_trainer_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'COACH_CLIENT_INSIGHTS_UNAVAILABLE';
  END IF;

  -- Lock authority in the same account -> professional -> client account ->
  -- relationship -> consent order used by administrative suspension and
  -- consent revocation. Only this trainer's active training scopes participate;
  -- unrelated coaching relationships remain fully concurrent.
  WITH locked_trainer_account AS MATERIALIZED (
    SELECT trainer_account.id
    FROM public.profiles AS trainer_account
    WHERE trainer_account.id = v_trainer_id
      AND trainer_account.account_status = 'active'
    FOR SHARE OF trainer_account
  ), locked_trainer_authority AS MATERIALIZED (
    SELECT trainer_profile.id, trainer_profile.user_id
    FROM locked_trainer_account AS trainer_account
    JOIN public.trainer_profiles AS trainer_profile
      ON trainer_profile.user_id = trainer_account.id
    WHERE trainer_profile.status = 'active'
    FOR SHARE OF trainer_profile
  ), scope_candidates AS MATERIALIZED (
    SELECT relationship.id AS relationship_id, relationship.client_user_id,
      training_consent.id AS consent_id
    FROM locked_trainer_authority AS trainer_authority
    JOIN public.coaching_relationships AS relationship
      ON relationship.trainer_user_id = trainer_authority.user_id
     AND relationship.status = 'active'
    JOIN public.coaching_consents AS training_consent
      ON training_consent.relationship_id = relationship.id
     AND training_consent.scope = 'training_profile'
     AND training_consent.revoked_at IS NULL
  ), locked_client_accounts AS MATERIALIZED (
    SELECT scope.relationship_id, client_account.id
    FROM scope_candidates AS scope
    JOIN LATERAL (
      SELECT client_account.id
      FROM public.profiles AS client_account
      WHERE client_account.id = scope.client_user_id
        AND client_account.account_status = 'active'
      LIMIT 1
      FOR SHARE OF client_account
    ) AS client_account ON TRUE
  ), locked_client_scopes AS MATERIALIZED (
    SELECT relationship.id, training_consent.id AS consent_id
    FROM scope_candidates AS scope
    JOIN locked_client_accounts AS client_account
      ON client_account.relationship_id = scope.relationship_id
     AND client_account.id = scope.client_user_id
    JOIN public.coaching_relationships AS relationship
      ON relationship.id = scope.relationship_id
     AND relationship.trainer_user_id = v_trainer_id
     AND relationship.client_user_id = client_account.id
     AND relationship.status = 'active'
    JOIN public.coaching_consents AS training_consent
      ON training_consent.id = scope.consent_id
     AND training_consent.relationship_id = relationship.id
     AND training_consent.scope = 'training_profile'
     AND training_consent.revoked_at IS NULL
    FOR SHARE OF relationship, training_consent
  )
  SELECT trainer_authority.id, scope_locks.locked_scope_count
  INTO v_authorized_trainer_profile_id, v_locked_scope_count
  FROM locked_trainer_authority AS trainer_authority
  CROSS JOIN (
    SELECT COUNT(*) AS locked_scope_count FROM locked_client_scopes
  ) AS scope_locks;

  IF v_authorized_trainer_profile_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'COACH_CLIENT_INSIGHTS_UNAVAILABLE';
  END IF;

  WITH scoped_relationships AS MATERIALIZED (
    SELECT
      relationship.id,
      relationship.client_user_id,
      relationship.started_at,
      client_account.full_name,
      client_account.avatar_url,
      client_account.timezone AS declared_timezone
    FROM public.coaching_relationships AS relationship
    JOIN LATERAL (
      SELECT client.full_name, client.avatar_url, client.timezone
      FROM public.profiles AS client
      WHERE client.id = relationship.client_user_id
        AND client.account_status = 'active'
      LIMIT 1
    ) AS client_account ON TRUE
    JOIN LATERAL (
      SELECT training_consent.id
      FROM public.coaching_consents AS training_consent
      WHERE training_consent.relationship_id = relationship.id
        AND training_consent.scope = 'training_profile'
        AND training_consent.revoked_at IS NULL
      ORDER BY training_consent.granted_at DESC, training_consent.id DESC
      LIMIT 1
    ) AS training_consent ON TRUE
    WHERE relationship.trainer_user_id = v_trainer_id
      AND relationship.status = 'active'
  ), summary_counts AS (
    SELECT
      (SELECT COUNT(*)
       FROM public.coaching_requests AS request
       WHERE request.trainer_user_id = v_trainer_id
         AND request.status = 'pending') AS pending_requests,
      (SELECT COUNT(*) FROM scoped_relationships) AS active_clients,
      (SELECT COUNT(*)
       FROM public.coaching_relationships AS relationship
       WHERE relationship.trainer_user_id = v_trainer_id
         AND relationship.status = 'paused_by_platform') AS paused_relationships
  ), normalized_client_timezones AS MATERIALIZED (
    SELECT
      relationship.id AS relationship_id,
      CASE
        WHEN relationship.declared_timezone IS NOT NULL
          AND EXISTS (SELECT 1 FROM pg_catalog.pg_timezone_names AS zone WHERE zone.name = relationship.declared_timezone)
        THEN relationship.declared_timezone
        ELSE 'America/Havana'
      END AS timezone
    FROM scoped_relationships AS relationship
  ), client_rows AS (
    SELECT
      relationship.id AS relationship_id,
      relationship.started_at,
      relationship.client_user_id AS client_id,
      relationship.full_name,
      relationship.avatar_url,
      client_timezone.timezone AS timezone,
      (
        SELECT version.id
        FROM public.trainer_plan_assignments AS assignment
        JOIN public.trainer_assignment_versions AS version
          ON version.id = assignment.active_version_id
         AND version.status = 'active'
        WHERE assignment.relationship_id = relationship.id
          AND assignment.status='active'
          AND EXISTS (SELECT 1 FROM public.workout_plans selected WHERE selected.id=version.materialized_plan_id AND selected.is_active AND selected.retired_at IS NULL AND selected.superseded_at IS NULL)
        LIMIT 1
      ) AS active_version_id,
      (
        SELECT MAX(progress_log.completed_at)
        FROM public.progress_logs AS progress_log
        JOIN public.session_authorizations AS session_authorization
          ON session_authorization.client_session_id = progress_log.client_session_id
         AND session_authorization.user_id = progress_log.user_id
         AND session_authorization.consumed_at IS NOT NULL
         AND session_authorization.released_at IS NULL
        JOIN public.workouts AS workout ON workout.id = session_authorization.workout_id
        JOIN public.workout_plans AS plan
          ON plan.id = session_authorization.plan_id
         AND workout.plan_id = plan.id
         AND plan.prescription_locked = TRUE
        JOIN public.trainer_assignment_versions AS version
          ON version.id = plan.trainer_assignment_version_id
         AND version.materialized_plan_id = plan.id
         AND version.status IN ('active', 'superseded', 'frozen', 'cancelled')
        JOIN public.trainer_plan_assignments AS assignment
          ON assignment.id = version.assignment_id
         AND assignment.id = plan.trainer_assignment_id
         AND assignment.relationship_id = plan.trainer_relationship_id
        WHERE progress_log.user_id = relationship.client_user_id
          AND assignment.relationship_id = relationship.id
          AND (progress_log.workout_id IS NULL OR progress_log.workout_id = session_authorization.workout_id)
      ) AS last_professional_evidence_at,
       (
         SELECT jsonb_build_object(
           'rangeStart', week_window.start_date,
           'rangeEnd', week_window.end_date,
           'versions', (
             SELECT COALESCE(jsonb_agg(jsonb_build_object(
               'id', version.id,
               'effectiveFrom', selection.effective_from,
               'effectiveTo', selection.effective_to,
               -- The adapter flattens workouts across windows. Emit each
               -- version's workout list once even when it was selected twice.
               'workouts', CASE WHEN selection.first_for_version THEN (
                 SELECT COALESCE(jsonb_agg(jsonb_build_object(
                   'id', materialized_workout.id,
                   'isoDay', NULLIF(prescribed.value->>'dayOfWeek', '')::INTEGER
                  ) ORDER BY NULLIF(prescribed.value->>'orderInPlan', '')::INTEGER), '[]'::JSONB)
                 FROM jsonb_array_elements(COALESCE(version.snapshot->'workouts', '[]'::JSONB)) AS prescribed(value)
                 LEFT JOIN public.workouts AS materialized_workout
                   ON materialized_workout.plan_id = version.materialized_plan_id
                  AND materialized_workout.day_of_week = NULLIF(prescribed.value->>'dayOfWeek', '')::INTEGER
                  AND materialized_workout.order_in_plan = NULLIF(prescribed.value->>'orderInPlan', '')::INTEGER
                 ) ELSE '[]'::JSONB END
              ) ORDER BY selection.effective_from ASC, version.version_number ASC), '[]'::JSONB)
             FROM private.trainer_assignment_selection_windows(
               relationship.id,week_window.alert_start_date-2,week_window.end_date,client_timezone.timezone
             ) selection
             JOIN public.trainer_assignment_versions version ON version.id=selection.version_id
            ),
           'sessions', COALESCE(jsonb_agg(session_row.payload ORDER BY session_row.completed_at ASC, session_row.id ASC)
             FILTER (WHERE session_row.id IS NOT NULL AND session_row.completed_date >= week_window.start_date), '[]'::JSONB),
           'alertSessions', COALESCE(jsonb_agg(session_row.payload ORDER BY session_row.completed_at ASC, session_row.id ASC)
             FILTER (WHERE session_row.id IS NOT NULL), '[]'::JSONB)
         )
         FROM LATERAL (
           SELECT
             date_trunc('week', NOW() AT TIME ZONE client_timezone.timezone)::DATE AS start_date,
             (NOW() AT TIME ZONE client_timezone.timezone)::DATE AS end_date,
             (NOW() AT TIME ZONE client_timezone.timezone)::DATE - 7 AS alert_start_date
         ) AS week_window
         LEFT JOIN LATERAL (
           SELECT
             progress_log.id,
             progress_log.completed_at,
             (progress_log.completed_at AT TIME ZONE client_timezone.timezone)::DATE AS completed_date,
             jsonb_build_object(
               'id', progress_log.id,
               'assignmentVersionId', version.id,
               'workoutId', session_authorization.workout_id,
               'completedAt', progress_log.completed_at,
               'averageRpe', (
                 SELECT AVG(rpe.value::NUMERIC)
                 FROM public.exercise_logs AS exercise_log
                 CROSS JOIN LATERAL unnest(exercise_log.rpe_values) AS rpe(value)
                 WHERE exercise_log.progress_log_id = progress_log.id
                   AND rpe.value IS NOT NULL
               )
             ) AS payload
           FROM public.progress_logs AS progress_log
           JOIN public.session_authorizations AS session_authorization
             ON session_authorization.client_session_id = progress_log.client_session_id
            AND session_authorization.user_id = progress_log.user_id
            AND session_authorization.consumed_at IS NOT NULL
            AND session_authorization.released_at IS NULL
           JOIN public.workouts AS workout ON workout.id = session_authorization.workout_id
           JOIN public.workout_plans AS plan
             ON plan.id = session_authorization.plan_id
            AND workout.plan_id = plan.id
            AND plan.prescription_locked = TRUE
           JOIN public.trainer_assignment_versions AS version
             ON version.id = plan.trainer_assignment_version_id
            AND version.materialized_plan_id = plan.id
            AND version.status IN ('active', 'superseded', 'frozen', 'cancelled')
           JOIN public.trainer_plan_assignments AS assignment
             ON assignment.id = version.assignment_id
            AND assignment.id = plan.trainer_assignment_id
            AND assignment.relationship_id = plan.trainer_relationship_id
              WHERE progress_log.user_id = relationship.client_user_id
             AND assignment.relationship_id = relationship.id
             AND (progress_log.workout_id IS NULL OR progress_log.workout_id = session_authorization.workout_id)
             AND (progress_log.completed_at AT TIME ZONE client_timezone.timezone)::DATE BETWEEN week_window.alert_start_date AND week_window.end_date
         ) AS session_row ON TRUE
         GROUP BY week_window.start_date, week_window.end_date, week_window.alert_start_date
       ) AS adherence_input
    FROM scoped_relationships AS relationship
    JOIN normalized_client_timezones AS client_timezone
      ON client_timezone.relationship_id = relationship.id
  )
  SELECT jsonb_build_object(
    'schemaVersion', 1,
    'counts', jsonb_build_object(
      'pendingRequests', counts.pending_requests,
      'activeClients', counts.active_clients,
      'pausedRelationships', counts.paused_relationships
    ),
    'clients', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'relationshipId', row.relationship_id,
        'startedAt', row.started_at,
        'client', jsonb_build_object(
          'id', row.client_id,
          'fullName', row.full_name,
          'avatarUrl', row.avatar_url,
          'timezone', row.timezone
        ),
        'activeAssignmentVersionId', row.active_version_id,
        'lastProfessionalEvidenceAt', row.last_professional_evidence_at,
         'adherenceInput', row.adherence_input
      ) ORDER BY row.last_professional_evidence_at DESC NULLS LAST, row.started_at DESC, row.client_id), '[]'::JSONB)
      FROM client_rows AS row
    )
  ) INTO v_result
  FROM summary_counts AS counts;

  RETURN v_result;
END;
$$;


CREATE OR REPLACE FUNCTION public.is_professional_audit_event_allowed(p_entity_type text, p_action text) RETURNS boolean
    LANGUAGE sql IMMUTABLE
    SET search_path TO 'public', 'pg_temp'
    AS $$
  SELECT COALESCE(CASE p_entity_type
    WHEN 'professional_audit' THEN p_action IN ('legacy_event_redacted')
    WHEN 'trainer_application' THEN p_action IN (
      'application_draft_saved', 'application_submitted', 'application_withdrawn',
      'trainer_application_under_review', 'trainer_application_changes_requested',
      'trainer_application_interview_required', 'trainer_application_approved',
      'trainer_application_rejected', 'trainer_interview_scheduled'
    )
    WHEN 'trainer_interview' THEN p_action IN ('trainer_interview_outcome_recorded')
    WHEN 'coaching_request' THEN p_action IN (
      'created', 'cancelled', 'accepted', 'declined', 'cancelled_after_acceptance'
    )
    WHEN 'coaching_relationship' THEN p_action IN (
      'relationship_created', 'training_profile_consent_granted',
      'body_measurements_consent_granted', 'body_measurements_consent_revoked',
      'training_profile_consent_revoked', 'ended', 'resumed',
      'paused_due_to_account_suspension'
    )
    WHEN 'trainer_account' THEN p_action IN ('suspended')
    WHEN 'trainer_profile' THEN p_action IN (
      'profile_created', 'profile_updated', 'profile_deleted',
      'profile_status_changed', 'reinstated'
    )
    WHEN 'trainer_service' THEN p_action IN (
      'service_created', 'service_updated', 'service_deleted',
      'service_activated', 'service_deactivated'
    )
    WHEN 'trainer_program_template' THEN p_action IN (
      'template_created', 'template_updated', 'template_deleted', 'template_archived'
    )
    WHEN 'trainer_template_workout' THEN p_action IN (
      'template_workout_insert', 'template_workout_update', 'template_workout_delete'
    )
    WHEN 'trainer_template_exercise' THEN p_action IN (
      'template_exercise_insert', 'template_exercise_update', 'template_exercise_delete'
    )
    WHEN 'trainer_application_credential' THEN p_action IN (
      'credential_added', 'credential_removed', 'credential_removal_prepared',
      'credential_removal_retried', 'credential_cleanup_failed'
    )
    WHEN 'trainer_plan_assignment' THEN p_action IN (
      'proposed', 'accepted', 'revision_published', 'assignment_frozen', 'declined', 'assigned', 'removed'
    )
    ELSE FALSE
  END, FALSE)
$$;


CREATE OR REPLACE FUNCTION public.cleanup_trainer_security_e2e_fixture(p_run_id text, p_user_ids uuid[]) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_target_ids UUID[];
  v_existing INTEGER;
  v_matched INTEGER;
  v_deleted INTEGER;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'TRAINER_SECURITY_CLEANUP_SERVICE_REQUIRED';
  END IF;
  IF p_run_id IS NULL OR btrim(p_run_id) = '' OR cardinality(p_user_ids) IS NULL OR cardinality(p_user_ids) = 0 THEN
    RAISE EXCEPTION 'TRAINER_SECURITY_CLEANUP_SCOPE_REQUIRED';
  END IF;
  IF array_position(p_user_ids, NULL) IS NOT NULL THEN
    RAISE EXCEPTION 'TRAINER_SECURITY_CLEANUP_SCOPE_MISMATCH';
  END IF;

  SELECT array_agg(target.id ORDER BY target.id), count(*),
    count(*) FILTER (WHERE target.raw_user_meta_data ->> 'e2e_run_id' = p_run_id)
  INTO v_target_ids, v_existing, v_matched
  FROM (
    SELECT target.id, target.raw_user_meta_data
    FROM auth.users target
    WHERE target.id = ANY(p_user_ids)
    FOR UPDATE
  ) target;
  IF v_existing = 0 THEN
    RETURN 0;
  END IF;
  IF v_matched <> v_existing THEN
    RAISE EXCEPTION 'TRAINER_SECURITY_CLEANUP_SCOPE_MISMATCH';
  END IF;

  SET CONSTRAINTS ALL DEFERRED;
  PERFORM set_config('app.trainer_prescription_mutation', 'authorized', TRUE);

  -- Scope was validated and the auth.users rows locked above. Clear private
  -- references only for materialized plans owned by those exact fixture users;
  -- a shared/unrelated participant does not expand the validated user set.
  DELETE FROM private.trainer_assignment_requests request
  USING public.workout_plans plan, public.trainer_plan_assignments assignment
  WHERE request.workout_plan_id=plan.id AND request.assignment_id=assignment.id
    AND plan.trainer_assignment_id=assignment.id AND plan.user_id=assignment.client_user_id
    AND plan.user_id=ANY(v_target_ids);
  DELETE FROM private.trainer_plan_selection_periods period
  USING public.workout_plans plan
  WHERE period.plan_id=plan.id AND period.client_user_id=plan.user_id
    AND plan.user_id=ANY(v_target_ids);

  DELETE FROM public.session_authorizations lease WHERE lease.user_id = ANY(v_target_ids);
  DELETE FROM public.exercise_logs log USING public.progress_logs progress
    WHERE log.progress_log_id = progress.id AND progress.user_id = ANY(v_target_ids);
  DELETE FROM public.progress_logs progress WHERE progress.user_id = ANY(v_target_ids);
  DELETE FROM public.measurements measurement WHERE measurement.user_id = ANY(v_target_ids);

  UPDATE public.trainer_plan_assignments assignment
  SET active_version_id = NULL
  WHERE assignment.client_user_id = ANY(v_target_ids) OR assignment.trainer_user_id = ANY(v_target_ids);
  UPDATE public.trainer_assignment_versions version
  SET materialized_plan_id = NULL
  WHERE version.assignment_id IN (
    SELECT assignment.id FROM public.trainer_plan_assignments assignment
    WHERE assignment.client_user_id = ANY(v_target_ids) OR assignment.trainer_user_id = ANY(v_target_ids)
  );
  DELETE FROM public.workout_exercises exercise
  WHERE exercise.workout_id IN (
    SELECT workout.id FROM public.workouts workout WHERE workout.user_id = ANY(v_target_ids)
  );
  DELETE FROM public.workouts workout WHERE workout.user_id = ANY(v_target_ids);
  DELETE FROM public.workout_plans plan WHERE plan.user_id = ANY(v_target_ids);
  DELETE FROM public.trainer_assignment_versions version
  WHERE version.assignment_id IN (
    SELECT assignment.id FROM public.trainer_plan_assignments assignment
    WHERE assignment.client_user_id = ANY(v_target_ids) OR assignment.trainer_user_id = ANY(v_target_ids)
  );
  DELETE FROM public.trainer_plan_assignments assignment
  WHERE assignment.client_user_id = ANY(v_target_ids) OR assignment.trainer_user_id = ANY(v_target_ids);
  DELETE FROM public.trainer_program_templates template WHERE template.trainer_user_id = ANY(v_target_ids);

  DELETE FROM public.coaching_consents consent
  WHERE consent.relationship_id IN (
    SELECT relationship.id FROM public.coaching_relationships relationship
    WHERE relationship.client_user_id = ANY(v_target_ids) OR relationship.trainer_user_id = ANY(v_target_ids)
  );
  DELETE FROM public.coaching_relationships relationship
  WHERE relationship.client_user_id = ANY(v_target_ids) OR relationship.trainer_user_id = ANY(v_target_ids);
  DELETE FROM public.coaching_requests request
  WHERE request.client_user_id = ANY(v_target_ids) OR request.trainer_user_id = ANY(v_target_ids);

  DELETE FROM public.trainer_service_offerings service
  WHERE service.trainer_profile_id IN (
    SELECT profile.id FROM public.trainer_profiles profile WHERE profile.user_id = ANY(v_target_ids)
  );
  DELETE FROM public.trainer_profiles profile WHERE profile.user_id = ANY(v_target_ids);
  DELETE FROM public.trainer_applications application WHERE application.user_id = ANY(v_target_ids);

  DELETE FROM public.product_notifications notification WHERE notification.user_id = ANY(v_target_ids);
  DELETE FROM public.product_push_tokens token WHERE token.user_id = ANY(v_target_ids);
  DELETE FROM public.product_notification_preferences preference WHERE preference.user_id = ANY(v_target_ids);

  DELETE FROM auth.users target WHERE target.id = ANY(v_target_ids);
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  IF v_deleted <> v_existing THEN RAISE EXCEPTION 'TRAINER_SECURITY_CLEANUP_INCOMPLETE'; END IF;
  RETURN v_deleted;
END;
$$;

ALTER FUNCTION public.cleanup_trainer_security_e2e_fixture(TEXT,UUID[]) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.cleanup_trainer_security_e2e_fixture(TEXT,UUID[]) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.cleanup_trainer_security_e2e_fixture(TEXT,UUID[]) TO service_role;

CREATE OR REPLACE FUNCTION public.trainer_security_preflight() RETURNS integer
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $_$
BEGIN
  IF to_regprocedure('public.prepare_trainer_credential_removal(uuid,uuid)') IS NULL
    OR to_regprocedure('public.accept_coaching_request(uuid,uuid)') IS NULL
    OR to_regprocedure('public.end_coaching_relationship(uuid,text,uuid)') IS NULL
    OR to_regprocedure('public.propose_trainer_assignment(uuid,uuid,text,text)') IS NULL
    OR to_regprocedure('public.accept_trainer_assignment(uuid,text)') IS NULL
    OR to_regprocedure('public.publish_trainer_assignment_revision(uuid,uuid,text,text)') IS NULL
    OR to_regprocedure('public.decline_trainer_assignment(uuid,text,text)') IS NULL
    OR to_regprocedure('public.grant_training_profile_consent(uuid,text,uuid)') IS NULL
    OR to_regprocedure('public.get_coach_clients_summary()') IS NULL
    OR to_regprocedure('public.get_coach_client_insights(uuid,date,date)') IS NULL
    OR to_regprocedure('public.snapshot_admin_audit_identity()') IS NULL
    OR to_regprocedure('public.reactivate_and_reinstate_trainer(uuid,uuid)') IS NULL
    OR to_regprocedure('public.cleanup_trainer_security_e2e_fixture(text,uuid[])') IS NULL
    OR to_regprocedure('public.release_session_authorization(uuid,uuid)') IS NULL
    OR to_regprocedure('public.enforce_trainer_workout_iso_schedule()') IS NULL
    OR NOT EXISTS (
      SELECT 1
      FROM pg_trigger trigger_row
      WHERE trigger_row.tgrelid = 'public.workouts'::regclass
        AND trigger_row.tgname = 'trg_enforce_trainer_workout_iso_schedule'
        AND trigger_row.tgenabled = 'O'
        AND NOT trigger_row.tgisinternal
    ) THEN
    RAISE EXCEPTION 'TRAINER_SECURITY_SCHEMA_INCOMPLETE';
  END IF;

  IF to_regprocedure('public.append_trainer_template_exercises(uuid,jsonb)') IS NULL
    OR has_function_privilege('anon', 'public.propose_trainer_assignment(uuid,uuid,text,text)', 'EXECUTE')
    OR NOT has_function_privilege('authenticated', 'public.propose_trainer_assignment(uuid,uuid,text,text)', 'EXECUTE')
    OR NOT has_function_privilege('service_role', 'public.propose_trainer_assignment(uuid,uuid,text,text)', 'EXECUTE')
    OR has_function_privilege('anon', 'public.append_trainer_template_exercises(uuid,jsonb)', 'EXECUTE')
    OR NOT has_function_privilege('authenticated', 'public.append_trainer_template_exercises(uuid,jsonb)', 'EXECUTE')
    OR NOT has_function_privilege('service_role', 'public.append_trainer_template_exercises(uuid,jsonb)', 'EXECUTE')
    OR has_function_privilege('anon', 'public.decline_trainer_assignment(uuid,text,text)', 'EXECUTE')
    OR NOT has_function_privilege('authenticated', 'public.decline_trainer_assignment(uuid,text,text)', 'EXECUTE')
    OR NOT has_function_privilege('service_role', 'public.decline_trainer_assignment(uuid,text,text)', 'EXECUTE')
    OR has_function_privilege('anon', 'public.grant_training_profile_consent(uuid,text,uuid)', 'EXECUTE')
    OR NOT has_function_privilege('authenticated', 'public.grant_training_profile_consent(uuid,text,uuid)', 'EXECUTE')
    OR NOT has_function_privilege('service_role', 'public.grant_training_profile_consent(uuid,text,uuid)', 'EXECUTE')
    OR has_function_privilege('anon', 'public.trainer_security_preflight()', 'EXECUTE')
    OR NOT has_function_privilege('authenticated', 'public.trainer_security_preflight()', 'EXECUTE')
    OR NOT has_function_privilege('service_role', 'public.trainer_security_preflight()', 'EXECUTE')
    OR NOT public.is_professional_audit_event_allowed('trainer_plan_assignment', 'declined')
    OR NOT EXISTS (
      SELECT 1
      FROM pg_proc procedure
      JOIN pg_language procedure_language ON procedure_language.oid = procedure.prolang
      JOIN pg_roles owner_role ON owner_role.oid = procedure.proowner
      WHERE procedure.oid = 'public.is_professional_audit_event_allowed(text,text)'::REGPROCEDURE
        AND procedure_language.lanname = 'sql'
        AND procedure.prokind = 'f'
        AND procedure.provolatile = 'i'
        AND NOT procedure.prosecdef
        AND procedure.proconfig = ARRAY['search_path=public, pg_temp']::TEXT[]
        AND owner_role.rolname = 'postgres'
        AND btrim(procedure.prosrc) = btrim($audit_event_allowlist$
  SELECT COALESCE(CASE p_entity_type
    WHEN 'professional_audit' THEN p_action IN ('legacy_event_redacted')
    WHEN 'trainer_application' THEN p_action IN (
      'application_draft_saved', 'application_submitted', 'application_withdrawn',
      'trainer_application_under_review', 'trainer_application_changes_requested',
      'trainer_application_interview_required', 'trainer_application_approved',
      'trainer_application_rejected', 'trainer_interview_scheduled'
    )
    WHEN 'trainer_interview' THEN p_action IN ('trainer_interview_outcome_recorded')
    WHEN 'coaching_request' THEN p_action IN (
      'created', 'cancelled', 'accepted', 'declined', 'cancelled_after_acceptance'
    )
    WHEN 'coaching_relationship' THEN p_action IN (
      'relationship_created', 'training_profile_consent_granted',
      'body_measurements_consent_granted', 'body_measurements_consent_revoked',
      'training_profile_consent_revoked', 'ended', 'resumed',
      'paused_due_to_account_suspension'
    )
    WHEN 'trainer_account' THEN p_action IN ('suspended')
    WHEN 'trainer_profile' THEN p_action IN (
      'profile_created', 'profile_updated', 'profile_deleted',
      'profile_status_changed', 'reinstated'
    )
    WHEN 'trainer_service' THEN p_action IN (
      'service_created', 'service_updated', 'service_deleted',
      'service_activated', 'service_deactivated'
    )
    WHEN 'trainer_program_template' THEN p_action IN (
      'template_created', 'template_updated', 'template_deleted', 'template_archived'
    )
    WHEN 'trainer_template_workout' THEN p_action IN (
      'template_workout_insert', 'template_workout_update', 'template_workout_delete'
    )
    WHEN 'trainer_template_exercise' THEN p_action IN (
      'template_exercise_insert', 'template_exercise_update', 'template_exercise_delete'
    )
    WHEN 'trainer_application_credential' THEN p_action IN (
      'credential_added', 'credential_removed', 'credential_removal_prepared',
      'credential_removal_retried', 'credential_cleanup_failed'
    )
    WHEN 'trainer_plan_assignment' THEN p_action IN (
      'proposed', 'accepted', 'revision_published', 'assignment_frozen', 'declined', 'assigned', 'removed'
    )
    ELSE FALSE
  END, FALSE)
        $audit_event_allowlist$)
    )
    OR NOT EXISTS (
      SELECT 1
      FROM pg_proc procedure
      JOIN pg_language procedure_language ON procedure_language.oid = procedure.prolang
      JOIN pg_roles owner_role ON owner_role.oid = procedure.proowner
      WHERE procedure.oid = 'public.propose_trainer_assignment(uuid,uuid,text,text)'::REGPROCEDURE
        AND procedure_language.lanname = 'plpgsql'
        AND procedure.prokind = 'f'
        AND procedure.provolatile = 'v'
        AND procedure.prorettype = 'record'::REGTYPE
        AND procedure.prosecdef
        AND procedure.proconfig = ARRAY['search_path=public, pg_temp']::TEXT[]
        AND owner_role.rolname = 'postgres'
        AND procedure.proallargtypes = ARRAY[
          'uuid'::REGTYPE::OID,
          'uuid'::REGTYPE::OID,
          'text'::REGTYPE::OID,
          'text'::REGTYPE::OID,
          'uuid'::REGTYPE::OID,
          'uuid'::REGTYPE::OID,
          'uuid'::REGTYPE::OID
        ]
        AND procedure.proargmodes = ARRAY[
          'i'::"char",
          'i'::"char",
          'i'::"char",
          'i'::"char",
          't'::"char",
          't'::"char",
          't'::"char"
        ]
        AND procedure.proargnames = ARRAY[
          'p_relationship_id',
          'p_template_id',
          'p_change_summary',
          'p_idempotency_key',
          'assignment_id',
          'assignment_version_id',
          'workout_plan_id'
        ]::TEXT[]
    )
    OR NOT EXISTS (
      SELECT 1
      FROM pg_proc procedure
      JOIN pg_language procedure_language ON procedure_language.oid = procedure.prolang
      JOIN pg_roles owner_role ON owner_role.oid = procedure.proowner
      WHERE procedure.oid = 'public.append_trainer_template_exercises(uuid,jsonb)'::REGPROCEDURE
        AND procedure_language.lanname = 'plpgsql'
        AND procedure.prokind = 'f'
        AND procedure.provolatile = 'v'
        AND procedure.prorettype = 'jsonb'::REGTYPE
        AND procedure.prosecdef
        AND procedure.proconfig = ARRAY['search_path=public, pg_temp']::TEXT[]
        AND owner_role.rolname = 'postgres'
    )
    OR NOT EXISTS (
      SELECT 1
      FROM pg_proc procedure
      JOIN pg_roles owner_role ON owner_role.oid = procedure.proowner
      WHERE procedure.oid = 'public.decline_trainer_assignment(uuid,text,text)'::REGPROCEDURE
        AND procedure.prosecdef
        AND procedure.proconfig = ARRAY['search_path=public, pg_temp']::TEXT[]
        AND owner_role.rolname = 'postgres'
    )
    OR NOT EXISTS (
      SELECT 1
      FROM pg_proc procedure
      JOIN pg_language procedure_language ON procedure_language.oid = procedure.prolang
      JOIN pg_roles owner_role ON owner_role.oid = procedure.proowner
      WHERE procedure.oid = 'public.grant_training_profile_consent(uuid,text,uuid)'::REGPROCEDURE
        AND procedure_language.lanname = 'plpgsql'
        AND procedure.prokind = 'f'
        AND procedure.provolatile = 'v'
        AND procedure.prorettype = 'record'::REGTYPE
        AND procedure.prosecdef
        AND procedure.proconfig = ARRAY['search_path=public, pg_temp']::TEXT[]
        AND owner_role.rolname = 'postgres'
        AND procedure.proallargtypes = ARRAY[
          'uuid'::REGTYPE::OID,
          'text'::REGTYPE::OID,
          'uuid'::REGTYPE::OID,
          'uuid'::REGTYPE::OID,
          'boolean'::REGTYPE::OID
        ]
        AND procedure.proargmodes = ARRAY[
          'i'::"char",
          'i'::"char",
          'i'::"char",
          't'::"char",
          't'::"char"
        ]
        AND procedure.proargnames = ARRAY[
          'p_relationship_id',
          'p_consent_version',
          'p_idempotency_key',
          'relationship_id',
          'changed'
        ]::TEXT[]
    )
    OR NOT EXISTS (
      SELECT 1
      FROM pg_proc procedure
      JOIN pg_roles owner_role ON owner_role.oid = procedure.proowner
      WHERE procedure.oid = 'public.trainer_security_preflight()'::REGPROCEDURE
        AND procedure.prosecdef
        AND procedure.proconfig = ARRAY['search_path=public, pg_temp']::TEXT[]
        AND owner_role.rolname = 'postgres'
    )
    OR EXISTS (
      SELECT 1
      FROM pg_proc procedure
      CROSS JOIN LATERAL aclexplode(
        COALESCE(procedure.proacl, acldefault('f', procedure.proowner))
      ) expanded_acl
      LEFT JOIN pg_roles grantee_role ON grantee_role.oid = expanded_acl.grantee
      WHERE procedure.oid IN (
          'public.is_professional_audit_event_allowed(text,text)'::REGPROCEDURE,
          'public.propose_trainer_assignment(uuid,uuid,text,text)'::REGPROCEDURE,
          'public.append_trainer_template_exercises(uuid,jsonb)'::REGPROCEDURE,
          'public.decline_trainer_assignment(uuid,text,text)'::REGPROCEDURE,
          'public.grant_training_profile_consent(uuid,text,uuid)'::REGPROCEDURE,
          'public.trainer_security_preflight()'::REGPROCEDURE
        )
        AND expanded_acl.privilege_type = 'EXECUTE'
        AND expanded_acl.grantee <> procedure.proowner
        AND (
          procedure.oid = 'public.is_professional_audit_event_allowed(text,text)'::REGPROCEDURE
          OR (
            procedure.oid IN (
              'public.propose_trainer_assignment(uuid,uuid,text,text)'::REGPROCEDURE,
              'public.append_trainer_template_exercises(uuid,jsonb)'::REGPROCEDURE,
              'public.decline_trainer_assignment(uuid,text,text)'::REGPROCEDURE,
              'public.grant_training_profile_consent(uuid,text,uuid)'::REGPROCEDURE,
              'public.trainer_security_preflight()'::REGPROCEDURE
            )
            AND (
              expanded_acl.is_grantable
              OR expanded_acl.grantee = 0
              OR grantee_role.rolname IS NULL
              OR grantee_role.rolname NOT IN ('authenticated', 'service_role')
            )
          )
        )
    )
    OR NOT EXISTS (
      SELECT 1
      FROM pg_attribute column_row
      WHERE column_row.attrelid = 'public.trainer_plan_assignments'::REGCLASS
        AND column_row.attname = 'decline_idempotency_key'
        AND column_row.atttypid = 'text'::REGTYPE
        AND NOT column_row.attnotnull
        AND NOT column_row.atthasdef
        AND column_row.attidentity = ''
        AND column_row.attgenerated = ''
        AND NOT column_row.attisdropped
    )
    OR NOT EXISTS (
      SELECT 1
      FROM pg_constraint constraint_row
      WHERE constraint_row.conrelid = 'public.trainer_plan_assignments'::REGCLASS
        AND constraint_row.conname = 'trainer_plan_assignments_decline_idempotency_key_check'
        AND constraint_row.contype = 'c'
        AND constraint_row.convalidated
        AND pg_get_expr(constraint_row.conbin, constraint_row.conrelid) =
          '((decline_idempotency_key IS NULL) OR ((char_length(btrim(decline_idempotency_key)) >= 1) AND (char_length(btrim(decline_idempotency_key)) <= 200)))'
    )
    OR NOT EXISTS (
      SELECT 1
      FROM pg_class index_row
      JOIN pg_namespace namespace_row ON namespace_row.oid = index_row.relnamespace
      JOIN pg_index index_definition ON index_definition.indexrelid = index_row.oid
      JOIN pg_attribute client_column
        ON client_column.attrelid = index_definition.indrelid
       AND client_column.attname = 'client_user_id'
       AND NOT client_column.attisdropped
      JOIN pg_attribute decline_column
        ON decline_column.attrelid = index_definition.indrelid
       AND decline_column.attname = 'decline_idempotency_key'
       AND NOT decline_column.attisdropped
      WHERE namespace_row.nspname = 'public'
        AND index_row.relname = 'trainer_plan_assignments_decline_idempotency_unique'
        AND index_definition.indrelid = 'public.trainer_plan_assignments'::REGCLASS
        AND index_definition.indnkeyatts = 2
        AND index_definition.indnatts = 2
        AND index_definition.indexprs IS NULL
        AND index_definition.indkey[0] = client_column.attnum
        AND index_definition.indkey[1] = decline_column.attnum
        AND index_definition.indisunique
        AND index_definition.indisvalid
        AND index_definition.indisready
        AND index_definition.indislive
        AND index_definition.indpred IS NOT NULL
        AND pg_get_expr(index_definition.indpred, index_definition.indrelid) = '(decline_idempotency_key IS NOT NULL)'
    )
  THEN
    RAISE EXCEPTION 'TRAINER_SECURITY_PREFLIGHT_FAILED';
  END IF;

  IF to_regprocedure('public.assign_trainer_program(uuid,uuid,text,text)') IS NULL
    OR to_regprocedure('public.remove_trainer_assignment(uuid)') IS NULL
    OR to_regprocedure('public.create_manual_plan_atomic(jsonb,jsonb,boolean)') IS NULL
    OR to_regprocedure('public.create_engine_plan_v2(jsonb,jsonb,integer,text,uuid,uuid,jsonb)') IS NULL
    OR EXISTS (
      SELECT 1 FROM pg_proc procedure JOIN pg_roles owner_role ON owner_role.oid=procedure.proowner
      WHERE procedure.oid IN (
        'public.create_manual_plan_atomic(jsonb,jsonb,boolean)'::regprocedure,
        'public.create_engine_plan_v2(jsonb,jsonb,integer,text,uuid,uuid,jsonb)'::regprocedure
      ) AND (procedure.prosecdef OR owner_role.rolname<>'postgres'
        OR procedure.proconfig IS DISTINCT FROM ARRAY['search_path=public']::TEXT[])
    )
    OR has_function_privilege('anon','public.assign_trainer_program(uuid,uuid,text,text)','EXECUTE')
    OR has_function_privilege('anon','public.remove_trainer_assignment(uuid)','EXECUTE')
    OR NOT has_function_privilege('authenticated','public.assign_trainer_program(uuid,uuid,text,text)','EXECUTE')
    OR NOT has_function_privilege('authenticated','public.remove_trainer_assignment(uuid)','EXECUTE')
    OR EXISTS (
      SELECT 1 FROM pg_proc procedure JOIN pg_roles owner_role ON owner_role.oid=procedure.proowner
      WHERE procedure.oid IN ('public.assign_trainer_program(uuid,uuid,text,text)'::regprocedure,'public.remove_trainer_assignment(uuid)'::regprocedure)
        AND (NOT procedure.prosecdef OR owner_role.rolname<>'postgres' OR procedure.proconfig IS DISTINCT FROM ARRAY['search_path=public, pg_temp']::TEXT[])
    )
    OR EXISTS (
      SELECT 1 FROM pg_proc procedure
      CROSS JOIN LATERAL aclexplode(COALESCE(procedure.proacl,acldefault('f',procedure.proowner))) permission
      LEFT JOIN pg_roles grantee ON grantee.oid=permission.grantee
      WHERE procedure.oid IN ('public.assign_trainer_program(uuid,uuid,text,text)'::regprocedure,'public.remove_trainer_assignment(uuid)'::regprocedure)
        AND permission.grantee<>procedure.proowner
        AND (permission.is_grantable OR permission.grantee=0 OR grantee.rolname IS NULL OR grantee.rolname NOT IN ('authenticated','service_role'))
    )
    OR has_table_privilege('authenticated','private.trainer_assignment_requests','SELECT,INSERT,UPDATE,DELETE')
    OR has_table_privilege('anon','private.trainer_assignment_requests','SELECT,INSERT,UPDATE,DELETE')
    OR has_table_privilege('authenticated','private.trainer_plan_selection_periods','SELECT,INSERT,UPDATE,DELETE')
    OR has_table_privilege('anon','private.trainer_plan_selection_periods','SELECT,INSERT,UPDATE,DELETE')
    OR has_function_privilege('authenticated','private.trainer_assignment_selection_windows(uuid,date,date,text)','EXECUTE')
    OR NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid='public.workout_plans'::regclass AND tgname='trg_track_trainer_plan_selection' AND tgenabled='O' AND NOT tgisinternal)
    OR EXISTS(SELECT 1 FROM pg_proc WHERE oid IN ('public.guard_plan_lifecycle_mutation()'::regprocedure,'public.enforce_plan_family_limit()'::regprocedure) AND prosecdef)
    OR to_regclass('public.trainer_assignments_retained_template_unique') IS NULL
    OR to_regclass('public.trainer_plan_assignments_one_active_client') IS NOT NULL THEN
    RAISE EXCEPTION 'TRAINER_SECURITY_PREFLIGHT_FAILED';
  END IF;
  RETURN 60;
END;
$_$;


ALTER FUNCTION public.assign_trainer_program(uuid,uuid,text,text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.assign_trainer_program(uuid,uuid,text,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.assign_trainer_program(uuid,uuid,text,text) TO authenticated,service_role;
ALTER FUNCTION public.propose_trainer_assignment(uuid,uuid,text,text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.propose_trainer_assignment(uuid,uuid,text,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.propose_trainer_assignment(uuid,uuid,text,text) TO authenticated,service_role;
ALTER FUNCTION public.remove_trainer_assignment(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.remove_trainer_assignment(uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.remove_trainer_assignment(uuid) TO authenticated,service_role;
ALTER FUNCTION public.accept_trainer_assignment(uuid,text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.accept_trainer_assignment(uuid,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.accept_trainer_assignment(uuid,text) TO authenticated,service_role;
ALTER FUNCTION public.activate_plan_version(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.activate_plan_version(uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.activate_plan_version(uuid) TO authenticated,service_role;
ALTER FUNCTION public.retire_plan_family(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.retire_plan_family(uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.retire_plan_family(uuid) TO authenticated,service_role;
ALTER FUNCTION public.publish_trainer_assignment_revision(uuid,uuid,text,text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.publish_trainer_assignment_revision(uuid,uuid,text,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.publish_trainer_assignment_revision(uuid,uuid,text,text) TO authenticated,service_role;
ALTER FUNCTION public.resume_paused_coaching_relationship(uuid,uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.resume_paused_coaching_relationship(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.resume_paused_coaching_relationship(uuid,uuid) TO authenticated,service_role;
ALTER FUNCTION public.get_coach_client_insights(uuid,date,date) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.get_coach_client_insights(uuid,date,date) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.get_coach_client_insights(uuid,date,date) TO authenticated,service_role;
ALTER FUNCTION public.get_coach_clients_summary() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.get_coach_clients_summary() FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.get_coach_clients_summary() TO authenticated,service_role;
ALTER FUNCTION public.trainer_security_preflight() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.trainer_security_preflight() FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.trainer_security_preflight() TO authenticated,service_role;

COMMIT;
