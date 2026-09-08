-- Classify missing structure separately from unavailable catalog references.
-- Full RPC bodies preserve existing authorization, materialization and idempotency.
BEGIN;


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
  IF v_workout_count <> v_template.days_per_week OR EXISTS (
    SELECT 1 FROM public.trainer_template_workouts workout
    WHERE workout.template_id = v_template.id
      AND NOT EXISTS (SELECT 1 FROM public.trainer_template_exercises exercise WHERE exercise.template_workout_id = workout.id)
  ) THEN
    RAISE EXCEPTION 'TRAINER_ASSIGNMENT_TEMPLATE_INCOMPLETE';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.trainer_template_exercises exercise
    JOIN public.trainer_template_workouts workout ON workout.id = exercise.template_workout_id
    LEFT JOIN public.exercises catalog ON catalog.id = exercise.exercise_id AND catalog.is_public = TRUE
    WHERE workout.template_id = v_template.id AND catalog.id IS NULL
  ) THEN
    RAISE EXCEPTION 'TRAINER_ASSIGNMENT_TEMPLATE_EXERCISE_UNAVAILABLE';
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

ALTER FUNCTION public.assign_trainer_program(uuid,uuid,text,text) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.assign_trainer_program(uuid,uuid,text,text) FROM PUBLIC,anon,authenticated,service_role;

GRANT EXECUTE ON FUNCTION public.assign_trainer_program(uuid,uuid,text,text) TO authenticated,service_role;

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
  IF v_workout_count <> v_template.days_per_week OR EXISTS (
    SELECT 1 FROM public.trainer_template_workouts workout
    WHERE workout.template_id = v_template.id
      AND NOT EXISTS (SELECT 1 FROM public.trainer_template_exercises exercise WHERE exercise.template_workout_id = workout.id)
  ) THEN
    RAISE EXCEPTION 'TRAINER_ASSIGNMENT_TEMPLATE_INCOMPLETE';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.trainer_template_exercises exercise
    JOIN public.trainer_template_workouts workout ON workout.id = exercise.template_workout_id
    LEFT JOIN public.exercises catalog ON catalog.id = exercise.exercise_id AND catalog.is_public = TRUE
    WHERE workout.template_id = v_template.id AND catalog.id IS NULL
  ) THEN
    RAISE EXCEPTION 'TRAINER_ASSIGNMENT_TEMPLATE_EXERCISE_UNAVAILABLE';
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

ALTER FUNCTION public.publish_trainer_assignment_revision(uuid,uuid,text,text) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.publish_trainer_assignment_revision(uuid,uuid,text,text) FROM PUBLIC,anon,authenticated,service_role;

GRANT EXECUTE ON FUNCTION public.publish_trainer_assignment_revision(uuid,uuid,text,text) TO authenticated,service_role;

COMMIT;
