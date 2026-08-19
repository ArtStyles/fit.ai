BEGIN;
SET LOCAL lock_timeout = '15s';

LOCK TABLE
  public.trainer_plan_assignments,
  public.trainer_assignment_versions,
  public.workout_plans,
  public.workouts
IN SHARE ROW EXCLUSIVE MODE;

DO $$
DECLARE
  v_invalid_count BIGINT;
BEGIN
  SELECT count(*) INTO v_invalid_count
  FROM public.workout_plans plan
  LEFT JOIN public.trainer_assignment_versions version
    ON version.id = plan.trainer_assignment_version_id
   AND version.materialized_plan_id = plan.id
  WHERE plan.source_type = 'trainer_assigned'
    AND version.id IS NULL;

  IF v_invalid_count > 0 THEN
    RAISE EXCEPTION 'TRAINER_ISO_WEEKDAY_REPAIR_PREFLIGHT_FAILED: invalid_plan_version_links=%', v_invalid_count;
  END IF;

  SELECT count(*) INTO v_invalid_count
  FROM public.trainer_assignment_versions version
  LEFT JOIN public.workout_plans plan
    ON plan.id = version.materialized_plan_id
   AND plan.trainer_assignment_version_id = version.id
   AND plan.source_type = 'trainer_assigned'
  WHERE version.materialized_plan_id IS NOT NULL
    AND plan.id IS NULL;

  IF v_invalid_count > 0 THEN
    RAISE EXCEPTION 'TRAINER_ISO_WEEKDAY_REPAIR_PREFLIGHT_FAILED: invalid_reverse_version_links=%', v_invalid_count;
  END IF;
END;
$$;

DO $$
DECLARE
  v_invalid_count BIGINT;
BEGIN
  SELECT count(*) INTO v_invalid_count
  FROM public.workout_plans plan
  JOIN public.trainer_assignment_versions version
    ON version.id = plan.trainer_assignment_version_id
   AND version.materialized_plan_id = plan.id
  WHERE plan.source_type = 'trainer_assigned'
    AND (
      version.snapshot->>'schemaVersion' IS DISTINCT FROM '1'
      OR CASE
        WHEN jsonb_typeof(version.snapshot->'workouts') = 'array'
          THEN jsonb_array_length(version.snapshot->'workouts') = 0
        ELSE TRUE
      END
    );

  IF v_invalid_count > 0 THEN
    RAISE EXCEPTION 'TRAINER_ISO_WEEKDAY_REPAIR_PREFLIGHT_FAILED: snapshot_shape=%', v_invalid_count;
  END IF;
END;
$$;

CREATE TEMP TABLE trainer_iso_weekday_snapshot_rows ON COMMIT DROP AS
SELECT
  plan.id AS plan_id,
  snapshot_workout.value AS snapshot_workout
FROM public.workout_plans plan
JOIN public.trainer_assignment_versions version
  ON version.id = plan.trainer_assignment_version_id
 AND version.materialized_plan_id = plan.id
CROSS JOIN LATERAL jsonb_array_elements(version.snapshot->'workouts') AS snapshot_workout(value)
WHERE plan.source_type = 'trainer_assigned';

DO $$
DECLARE
  v_invalid_count BIGINT;
BEGIN
  SELECT count(*) INTO v_invalid_count
  FROM trainer_iso_weekday_snapshot_rows
  WHERE jsonb_typeof(snapshot_workout) IS DISTINCT FROM 'object'
    OR COALESCE(snapshot_workout->>'dayOfWeek', '') !~ '^[1-7]$'
    OR COALESCE(snapshot_workout->>'orderInPlan', '') !~ '^[1-7]$';

  IF v_invalid_count > 0 THEN
    RAISE EXCEPTION 'TRAINER_ISO_WEEKDAY_REPAIR_PREFLIGHT_FAILED: snapshot_value=%', v_invalid_count;
  END IF;

  SELECT count(*) INTO v_invalid_count
  FROM (
    SELECT plan_id, snapshot_workout->>'dayOfWeek'
    FROM trainer_iso_weekday_snapshot_rows
    GROUP BY plan_id, snapshot_workout->>'dayOfWeek'
    HAVING count(*) > 1
  ) duplicate_days;

  IF v_invalid_count > 0 THEN
    RAISE EXCEPTION 'TRAINER_ISO_WEEKDAY_REPAIR_PREFLIGHT_FAILED: duplicate_day=%', v_invalid_count;
  END IF;

  SELECT count(*) INTO v_invalid_count
  FROM (
    SELECT plan_id, snapshot_workout->>'orderInPlan'
    FROM trainer_iso_weekday_snapshot_rows
    GROUP BY plan_id, snapshot_workout->>'orderInPlan'
    HAVING count(*) > 1
  ) duplicate_orders;

  IF v_invalid_count > 0 THEN
    RAISE EXCEPTION 'TRAINER_ISO_WEEKDAY_REPAIR_PREFLIGHT_FAILED: duplicate_order=%', v_invalid_count;
  END IF;

  SELECT count(*) INTO v_invalid_count
  FROM (
    SELECT plan_id, order_in_plan
    FROM public.workouts
    WHERE plan_id IN (
      SELECT id FROM public.workout_plans WHERE source_type = 'trainer_assigned'
    )
    GROUP BY plan_id, order_in_plan
    HAVING count(*) > 1
  ) duplicate_materialized_orders;

  IF v_invalid_count > 0 THEN
    RAISE EXCEPTION 'TRAINER_ISO_WEEKDAY_REPAIR_PREFLIGHT_FAILED: duplicate_materialized_order=%', v_invalid_count;
  END IF;

  SELECT count(*) INTO v_invalid_count
  FROM trainer_iso_weekday_snapshot_rows snapshot_row
  FULL JOIN public.workouts workout
    ON workout.plan_id = snapshot_row.plan_id
   AND workout.order_in_plan = (snapshot_row.snapshot_workout->>'orderInPlan')::INTEGER
  JOIN public.workout_plans plan
    ON plan.id = COALESCE(snapshot_row.plan_id, workout.plan_id)
   AND plan.source_type = 'trainer_assigned'
  WHERE snapshot_row.plan_id IS NULL OR workout.id IS NULL;

  IF v_invalid_count > 0 THEN
    RAISE EXCEPTION 'TRAINER_ISO_WEEKDAY_REPAIR_PREFLIGHT_FAILED: unmatched_materialization=%', v_invalid_count;
  END IF;

  SELECT count(*) INTO v_invalid_count
  FROM (
    SELECT plan.id
    FROM public.workout_plans plan
    JOIN public.trainer_assignment_versions version
      ON version.id = plan.trainer_assignment_version_id
    LEFT JOIN public.workouts workout ON workout.plan_id = plan.id
    WHERE plan.source_type = 'trainer_assigned'
    GROUP BY plan.id, version.snapshot
    HAVING count(workout.id) <> jsonb_array_length(version.snapshot->'workouts')
  ) cardinality_mismatches;

  IF v_invalid_count > 0 THEN
    RAISE EXCEPTION 'TRAINER_ISO_WEEKDAY_REPAIR_PREFLIGHT_FAILED: cardinality=%', v_invalid_count;
  END IF;
END;
$$;

CREATE TEMP TABLE trainer_iso_weekday_expected ON COMMIT DROP AS
SELECT
  workout.id AS workout_id,
  plan.id AS plan_id,
  (snapshot_workout.value->>'dayOfWeek')::INTEGER AS expected_day_of_week
FROM public.workout_plans plan
JOIN public.trainer_assignment_versions version
  ON version.id = plan.trainer_assignment_version_id
 AND version.materialized_plan_id = plan.id
CROSS JOIN LATERAL jsonb_array_elements(version.snapshot->'workouts') AS snapshot_workout(value)
JOIN public.workouts workout
  ON workout.plan_id = plan.id
 AND workout.order_in_plan = (snapshot_workout.value->>'orderInPlan')::INTEGER
WHERE plan.source_type = 'trainer_assigned';

ALTER TABLE trainer_iso_weekday_expected ADD PRIMARY KEY (workout_id);
GRANT SELECT ON trainer_iso_weekday_expected TO postgres;

CREATE TEMP TABLE trainer_iso_weekday_updated (
  workout_id UUID PRIMARY KEY,
  plan_id UUID NOT NULL
) ON COMMIT DROP;
GRANT INSERT ON trainer_iso_weekday_updated TO postgres;

SET LOCAL ROLE postgres;
SELECT set_config('app.trainer_prescription_mutation', 'authorized', TRUE);

WITH updated AS (
  UPDATE public.workouts workout
  SET day_of_week = expected.expected_day_of_week
  FROM trainer_iso_weekday_expected expected
  WHERE workout.id = expected.workout_id
    AND workout.day_of_week IS DISTINCT FROM expected.expected_day_of_week
  RETURNING workout.id, workout.plan_id
)
INSERT INTO trainer_iso_weekday_updated (workout_id, plan_id)
SELECT id, plan_id FROM updated;

RESET ROLE;

DO $$
DECLARE
  v_invalid_count BIGINT;
  v_expected_count BIGINT;
  v_materialized_count BIGINT;
  v_updated_count BIGINT;
BEGIN
  SELECT count(*) INTO v_invalid_count
  FROM trainer_iso_weekday_expected expected
  JOIN public.workouts workout ON workout.id = expected.workout_id
  WHERE workout.day_of_week IS DISTINCT FROM expected.expected_day_of_week;

  IF v_invalid_count > 0 THEN
    RAISE EXCEPTION 'TRAINER_ISO_WEEKDAY_REPAIR_POSTCONDITION_FAILED: divergent_days=%', v_invalid_count;
  END IF;

  SELECT count(*) INTO v_invalid_count
  FROM trainer_iso_weekday_updated updated
  LEFT JOIN public.workout_plans plan
    ON plan.id = updated.plan_id
   AND plan.source_type = 'trainer_assigned'
  WHERE plan.id IS NULL;

  IF v_invalid_count > 0 THEN
    RAISE EXCEPTION 'TRAINER_ISO_WEEKDAY_REPAIR_POSTCONDITION_FAILED: non_professional_updates=%', v_invalid_count;
  END IF;

  SELECT count(*) INTO v_invalid_count
  FROM trainer_iso_weekday_expected expected
  JOIN public.workouts workout ON workout.id = expected.workout_id
  WHERE workout.day_of_week NOT BETWEEN 1 AND 7;

  IF v_invalid_count > 0 THEN
    RAISE EXCEPTION 'TRAINER_ISO_WEEKDAY_REPAIR_POSTCONDITION_FAILED: invalid_iso_days=%', v_invalid_count;
  END IF;

  SELECT count(*) INTO v_expected_count FROM trainer_iso_weekday_expected;
  SELECT count(*) INTO v_materialized_count
  FROM public.workouts workout
  JOIN public.workout_plans plan ON plan.id = workout.plan_id
  WHERE plan.source_type = 'trainer_assigned';

  IF v_expected_count <> v_materialized_count THEN
    RAISE EXCEPTION 'TRAINER_ISO_WEEKDAY_REPAIR_POSTCONDITION_FAILED: cardinality=%',
      abs(v_expected_count - v_materialized_count);
  END IF;

  SELECT count(*) INTO v_updated_count FROM trainer_iso_weekday_updated;
  RAISE NOTICE 'trainer ISO weekday repair examined=% updated=%', v_expected_count, v_updated_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.propose_trainer_assignment(
  p_relationship_id UUID,
  p_template_id UUID,
  p_change_summary TEXT,
  p_idempotency_key TEXT
)
RETURNS TABLE (assignment_id UUID, assignment_version_id UUID, workout_plan_id UUID)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_trainer_user_id UUID := auth.uid();
  v_client_user_id UUID;
  v_relationship public.coaching_relationships%ROWTYPE;
  v_template public.trainer_program_templates%ROWTYPE;
  v_assignment_id UUID;
  v_assignment_version_id UUID;
  v_workout_plan_id UUID;
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

  -- Return the original complete materialization for a retried request.
  SELECT assignment.id, version.id, version.materialized_plan_id
  INTO v_assignment_id, v_assignment_version_id, v_workout_plan_id
  FROM public.trainer_plan_assignments assignment
  JOIN public.trainer_assignment_versions version
    ON version.assignment_id = assignment.id AND version.version_number = 1
  WHERE assignment.trainer_user_id = v_trainer_user_id
    AND assignment.proposal_idempotency_key = BTRIM(p_idempotency_key)
  FOR UPDATE OF assignment, version;
  IF FOUND THEN
    RETURN QUERY SELECT v_assignment_id, v_assignment_version_id, v_workout_plan_id;
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
  IF EXISTS (
    SELECT 1 FROM public.trainer_plan_assignments assignment
    WHERE assignment.client_user_id = v_client_user_id AND assignment.status = 'active'
  ) THEN
    RAISE EXCEPTION 'TRAINER_ASSIGNMENT_ACTIVE_EXISTS';
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
    v_relationship.id, v_trainer_user_id, v_client_user_id, v_template.id, 'proposed', BTRIM(p_idempotency_key)
  ) RETURNING id INTO v_assignment_id;
  INSERT INTO public.trainer_assignment_versions (
    assignment_id, version_number, snapshot, change_summary, status
  ) VALUES (
    v_assignment_id, 1, v_snapshot, NULLIF(BTRIM(p_change_summary), ''), 'proposed'
  ) RETURNING id INTO v_assignment_version_id;
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

  INSERT INTO public.professional_audit_logs (
    actor_user_id, subject_user_id, entity_type, entity_id, action, metadata
  ) VALUES (
    v_trainer_user_id, v_client_user_id, 'trainer_plan_assignment', v_assignment_id,
    'proposed', jsonb_build_object('relationship_id', v_relationship.id, 'version_number', 1)
  );
  PERFORM public.create_product_notification(
    v_client_user_id, 'coaching_assignment_status', 'Nueva rutina profesional',
    'Tu entrenador te envió una rutina para revisar.', '/coaching',
    'coaching-assignment-proposed:' || v_assignment_id::TEXT,
    jsonb_build_object('assignment_id', v_assignment_id, 'version_number', 1)
  );

  RETURN QUERY SELECT v_assignment_id, v_assignment_version_id, v_workout_plan_id;
END;
$$;
ALTER FUNCTION public.propose_trainer_assignment(UUID, UUID, TEXT, TEXT) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.propose_trainer_assignment(UUID, UUID, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.propose_trainer_assignment(UUID, UUID, TEXT, TEXT) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.publish_trainer_assignment_revision(
  p_assignment_id UUID,
  p_template_id UUID,
  p_change_summary TEXT,
  p_idempotency_key TEXT
)
RETURNS TABLE (assignment_id UUID, assignment_version_id UUID, workout_plan_id UUID)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
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
  UPDATE public.workout_plans SET is_active = FALSE WHERE user_id = v_target_client_id AND is_active = TRUE;
  UPDATE public.workout_plans
  SET superseded_at = COALESCE(superseded_at, NOW())
  WHERE id = v_previous_version.materialized_plan_id
    AND user_id = v_target_client_id;
  UPDATE public.workout_plans SET is_active = TRUE WHERE id = v_new_plan_id;
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
ALTER FUNCTION public.publish_trainer_assignment_revision(UUID, UUID, TEXT, TEXT) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.publish_trainer_assignment_revision(UUID, UUID, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.publish_trainer_assignment_revision(UUID, UUID, TEXT, TEXT) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_coach_clients_summary()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
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
          AND assignment.status = 'active'
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
         AND version.status IN ('active', 'superseded')
        JOIN public.trainer_plan_assignments AS assignment
          ON assignment.id = version.assignment_id
         AND assignment.id = plan.trainer_assignment_id
         AND assignment.relationship_id = plan.trainer_relationship_id
         AND assignment.status = 'active'
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
               'effectiveFrom', version.effective_from,
               'effectiveTo', version.effective_to,
               'workouts', (
                 SELECT COALESCE(jsonb_agg(jsonb_build_object(
                   'id', materialized_workout.id,
                   'isoDay', NULLIF(prescribed.value->>'dayOfWeek', '')::INTEGER
                  ) ORDER BY NULLIF(prescribed.value->>'orderInPlan', '')::INTEGER), '[]'::JSONB)
                 FROM jsonb_array_elements(COALESCE(version.snapshot->'workouts', '[]'::JSONB)) AS prescribed(value)
                 LEFT JOIN public.workouts AS materialized_workout
                   ON materialized_workout.plan_id = version.materialized_plan_id
                  AND materialized_workout.day_of_week = NULLIF(prescribed.value->>'dayOfWeek', '')::INTEGER
                  AND materialized_workout.order_in_plan = NULLIF(prescribed.value->>'orderInPlan', '')::INTEGER
                 )
              ) ORDER BY version.effective_from ASC, version.version_number ASC), '[]'::JSONB)
             FROM public.trainer_plan_assignments AS assignment
             JOIN public.trainer_assignment_versions AS version ON version.assignment_id = assignment.id
             WHERE assignment.relationship_id = relationship.id
               AND assignment.status = 'active'
               AND version.status IN ('active', 'superseded')
               AND version.effective_from < ((week_window.end_date + 1)::TIMESTAMP AT TIME ZONE client_timezone.timezone)
               AND COALESCE(version.effective_to, 'infinity'::TIMESTAMPTZ) > ((week_window.alert_start_date - 2)::TIMESTAMP AT TIME ZONE client_timezone.timezone)
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
            AND version.status IN ('active', 'superseded')
           JOIN public.trainer_plan_assignments AS assignment
             ON assignment.id = version.assignment_id
            AND assignment.id = plan.trainer_assignment_id
            AND assignment.relationship_id = plan.trainer_relationship_id
            AND assignment.status = 'active'
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

ALTER FUNCTION public.get_coach_clients_summary() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.get_coach_clients_summary() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_coach_clients_summary() TO authenticated;

CREATE OR REPLACE FUNCTION public.get_coach_client_insights(
  p_client_id UUID,
  p_from_date DATE,
  p_to_date DATE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
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
      AND assignment.status = 'active'
  ), versions AS (
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'id', version.id,
      'assignmentId', version.assignment_id,
      'versionNumber', version.version_number,
      'status', version.status,
      'effectiveFrom', version.effective_from,
      'effectiveTo', version.effective_to,
      'changeSummary', version.change_summary
    ) ORDER BY version.effective_from ASC, version.version_number ASC, version.id ASC), '[]'::JSONB) AS value
    FROM public.trainer_assignment_versions AS version
    JOIN assignment_rows AS assignment ON assignment.id = version.assignment_id
    WHERE version.status IN ('active', 'superseded')
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
    JOIN assignment_rows AS assignment ON assignment.id = version.assignment_id
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
    WHERE version.status IN ('active', 'superseded')
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
     AND version.status IN ('active', 'superseded')
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

ALTER FUNCTION public.get_coach_client_insights(UUID, DATE, DATE) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.get_coach_client_insights(UUID, DATE, DATE) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_coach_client_insights(UUID, DATE, DATE) TO authenticated;

CREATE OR REPLACE FUNCTION public.enforce_trainer_workout_iso_schedule()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_source_type TEXT;
  v_prescription_locked BOOLEAN;
  v_snapshot JSONB;
  v_match_count INTEGER;
  v_expected_day INTEGER;
BEGIN
  SELECT plan.source_type, plan.prescription_locked, version.snapshot
  INTO v_source_type, v_prescription_locked, v_snapshot
  FROM public.workout_plans plan
  LEFT JOIN public.trainer_assignment_versions version
    ON version.id = plan.trainer_assignment_version_id
  WHERE plan.id = NEW.plan_id;

  IF v_source_type IS DISTINCT FROM 'trainer_assigned' THEN
    RETURN NEW;
  END IF;

  IF v_prescription_locked
    AND NOT (
      (current_user = 'postgres' OR (auth.role() = 'service_role' AND session_user IN ('postgres', 'supabase_admin')))
      AND current_setting('app.trainer_prescription_mutation', TRUE) = 'authorized'
    ) THEN
    RAISE EXCEPTION 'TRAINER_PRESCRIPTION_LOCKED';
  END IF;

  IF jsonb_typeof(v_snapshot->'workouts') IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'TRAINER_PRESCRIPTION_SCHEDULE_MISMATCH';
  END IF;

  SELECT
    count(*),
    min(
      CASE WHEN item.value->>'dayOfWeek' ~ '^[1-7]$'
        THEN (item.value->>'dayOfWeek')::INTEGER
      END
    )
  INTO v_match_count, v_expected_day
  FROM jsonb_array_elements(v_snapshot->'workouts') AS item(value)
  WHERE CASE
    WHEN item.value->>'orderInPlan' ~ '^[1-7]$'
      THEN (item.value->>'orderInPlan')::INTEGER = NEW.order_in_plan
    ELSE FALSE
  END;

  IF v_match_count <> 1
    OR v_expected_day IS NULL
    OR v_expected_day NOT BETWEEN 1 AND 7
    OR NEW.day_of_week IS DISTINCT FROM v_expected_day THEN
    RAISE EXCEPTION 'TRAINER_PRESCRIPTION_SCHEDULE_MISMATCH';
  END IF;

  RETURN NEW;
END;
$$;

ALTER FUNCTION public.enforce_trainer_workout_iso_schedule() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.enforce_trainer_workout_iso_schedule() FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS trg_enforce_trainer_workout_iso_schedule ON public.workouts;
CREATE TRIGGER trg_enforce_trainer_workout_iso_schedule
  BEFORE INSERT OR UPDATE OF plan_id, day_of_week, order_in_plan ON public.workouts
  FOR EACH ROW EXECUTE FUNCTION public.enforce_trainer_workout_iso_schedule();

-- CREATE OR REPLACE preserves an existing function's owner and ACL. Normalize
-- the 046 entry point after legacy owner-boundary deployments so its effective
-- contract remains authenticated-only.
ALTER FUNCTION public.release_session_authorization(UUID, UUID) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.release_session_authorization(UUID, UUID) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.release_session_authorization(UUID, UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.trainer_security_preflight()
RETURNS INTEGER
LANGUAGE plpgsql
STABLE
SET search_path = public, pg_temp
AS $$
BEGIN
  IF to_regprocedure('public.prepare_trainer_credential_removal(uuid,uuid)') IS NULL
    OR to_regprocedure('public.accept_coaching_request(uuid,uuid)') IS NULL
    OR to_regprocedure('public.end_coaching_relationship(uuid,text,uuid)') IS NULL
    OR to_regprocedure('public.propose_trainer_assignment(uuid,uuid,text,text)') IS NULL
    OR to_regprocedure('public.accept_trainer_assignment(uuid,text)') IS NULL
    OR to_regprocedure('public.publish_trainer_assignment_revision(uuid,uuid,text,text)') IS NULL
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
  RETURN 47;
END;
$$;

REVOKE ALL ON FUNCTION public.trainer_security_preflight() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.trainer_security_preflight() TO authenticated, service_role;

COMMIT;
