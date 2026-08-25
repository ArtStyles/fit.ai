BEGIN;

CREATE OR REPLACE FUNCTION public.append_trainer_template_exercises(
  p_template_workout_id UUID,
  p_exercises JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_trainer_user_id UUID;
  v_existing_count INTEGER;
  v_requested_count INTEGER;
  v_result JSONB;
BEGIN
  SELECT template.trainer_user_id
  INTO v_trainer_user_id
  FROM public.trainer_template_workouts workout
  JOIN public.trainer_program_templates template ON template.id = workout.template_id
  WHERE workout.id = p_template_workout_id;

  IF auth.uid() IS NULL OR auth.role() <> 'authenticated'
    OR v_trainer_user_id IS NULL OR v_trainer_user_id <> auth.uid() THEN
    RAISE EXCEPTION 'TRAINER_TEMPLATE_OWNER_REQUIRED';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(v_trainer_user_id::TEXT, 0));
  PERFORM 1 FROM public.profiles
    WHERE id = v_trainer_user_id AND account_status = 'active' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'TRAINER_TEMPLATE_OWNER_REQUIRED'; END IF;
  PERFORM 1 FROM public.trainer_profiles
    WHERE user_id = v_trainer_user_id AND status = 'active' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'TRAINER_TEMPLATE_OWNER_REQUIRED'; END IF;
  PERFORM 1 FROM public.trainer_template_workouts
    WHERE id = p_template_workout_id FOR UPDATE;

  IF jsonb_typeof(p_exercises) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'TRAINER_TEMPLATE_BATCH_INVALID';
  END IF;
  v_requested_count := jsonb_array_length(p_exercises);
  IF v_requested_count NOT BETWEEN 1 AND 30 THEN
    RAISE EXCEPTION 'TRAINER_TEMPLATE_BATCH_INVALID';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_exercises) request(item)
    WHERE jsonb_typeof(request.item) <> 'object'
      OR (SELECT count(*) FROM jsonb_object_keys(request.item)) <> 7
      OR NOT (request.item ?& ARRAY[
        'exerciseId', 'sets', 'reps', 'weightKg', 'targetRpe', 'restSeconds', 'notes'
      ])
      OR jsonb_typeof(request.item->'exerciseId') <> 'string'
      OR jsonb_typeof(request.item->'sets') <> 'number'
      OR jsonb_typeof(request.item->'reps') <> 'number'
      OR jsonb_typeof(request.item->'weightKg') NOT IN ('number', 'null')
      OR jsonb_typeof(request.item->'targetRpe') NOT IN ('number', 'null')
      OR jsonb_typeof(request.item->'restSeconds') <> 'number'
      OR jsonb_typeof(request.item->'notes') NOT IN ('string', 'null')
  ) THEN
    RAISE EXCEPTION 'TRAINER_TEMPLATE_BATCH_INVALID';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_exercises) request(item)
    WHERE request.item->>'exerciseId' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      OR request.item->>'sets' !~ '^[0-9]+$'
      OR request.item->>'reps' !~ '^[0-9]+$'
      OR request.item->>'restSeconds' !~ '^[0-9]+$'
      OR request.item->>'weightKg' IS NOT NULL
        AND request.item->>'weightKg' !~ '^[0-9]+(?:\.[0-9]+)?$'
      OR request.item->>'targetRpe' IS NOT NULL
        AND request.item->>'targetRpe' !~ '^[0-9]+(?:\.[05])?$'
  ) THEN
    RAISE EXCEPTION 'TRAINER_TEMPLATE_BATCH_INVALID';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_to_recordset(p_exercises) AS request(
      "exerciseId" TEXT,
      sets NUMERIC,
      reps NUMERIC,
      "weightKg" NUMERIC,
      "targetRpe" NUMERIC,
      "restSeconds" NUMERIC,
      notes TEXT
    )
    WHERE request.sets NOT BETWEEN 1 AND 20
      OR request.reps NOT BETWEEN 1 AND 100
      OR request."weightKg" IS NOT NULL AND request."weightKg" NOT BETWEEN 0 AND 1000
      OR request."targetRpe" IS NOT NULL AND request."targetRpe" NOT BETWEEN 1 AND 10
      OR request."restSeconds" NOT BETWEEN 0 AND 3600
      OR char_length(COALESCE(request.notes, '')) > 1000
  ) THEN
    RAISE EXCEPTION 'TRAINER_TEMPLATE_BATCH_INVALID';
  END IF;

  IF (
    SELECT count(DISTINCT (request.item->>'exerciseId')::UUID)
    FROM jsonb_array_elements(p_exercises) request(item)
  ) <> v_requested_count THEN
    RAISE EXCEPTION 'TRAINER_TEMPLATE_BATCH_INVALID';
  END IF;

  IF (
    SELECT count(*)
    FROM public.exercises exercise
    WHERE exercise.is_public = TRUE
      AND exercise.id IN (
        SELECT (request.item->>'exerciseId')::UUID
        FROM jsonb_array_elements(p_exercises) request(item)
      )
  ) <> v_requested_count THEN
    RAISE EXCEPTION 'TRAINER_TEMPLATE_BATCH_EXERCISE_UNAVAILABLE';
  END IF;

  SET CONSTRAINTS trainer_template_exercises_workout_order_unique DEFERRED;
  PERFORM exercise.id
  FROM public.trainer_template_exercises exercise
  WHERE exercise.template_workout_id = p_template_workout_id
  ORDER BY exercise.order_index, exercise.id
  FOR UPDATE;

  WITH ranked AS (
    SELECT exercise.id,
           row_number() OVER (ORDER BY exercise.order_index, exercise.id)::INTEGER AS next_order
    FROM public.trainer_template_exercises exercise
    WHERE exercise.template_workout_id = p_template_workout_id
  )
  UPDATE public.trainer_template_exercises exercise
  SET order_index = ranked.next_order
  FROM ranked
  WHERE exercise.id = ranked.id;

  SELECT count(*) INTO v_existing_count
  FROM public.trainer_template_exercises
  WHERE template_workout_id = p_template_workout_id;
  IF v_existing_count + v_requested_count > 30 THEN
    RAISE EXCEPTION 'TRAINER_TEMPLATE_BATCH_LIMIT';
  END IF;

  WITH requested AS (
    SELECT request.item, request.position
    FROM jsonb_array_elements(p_exercises) WITH ORDINALITY AS request(item, position)
  ), inserted AS (
    INSERT INTO public.trainer_template_exercises (
      template_workout_id,
      exercise_id,
      order_index,
      sets,
      reps,
      weight_kg,
      target_rpe,
      rest_seconds,
      notes
    )
    SELECT
      p_template_workout_id,
      (requested.item->>'exerciseId')::UUID,
      v_existing_count + requested.position::INTEGER,
      (requested.item->>'sets')::INTEGER,
      (requested.item->>'reps')::INTEGER,
      (requested.item->>'weightKg')::NUMERIC,
      (requested.item->>'targetRpe')::NUMERIC,
      (requested.item->>'restSeconds')::INTEGER,
      NULLIF(btrim(requested.item->>'notes'), '')
    FROM requested
    ORDER BY requested.position
    RETURNING id, exercise_id, order_index
  )
  SELECT jsonb_agg(
    jsonb_build_object(
      'id', inserted.id,
      'exerciseId', inserted.exercise_id,
      'orderIndex', inserted.order_index
    )
    ORDER BY inserted.order_index
  )
  INTO v_result
  FROM inserted;

  RETURN jsonb_build_object(
    'templateWorkoutId', p_template_workout_id,
    'exercises', COALESCE(v_result, '[]'::JSONB)
  );
END;
$$;

ALTER FUNCTION public.append_trainer_template_exercises(UUID, JSONB) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.append_trainer_template_exercises(UUID, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.append_trainer_template_exercises(UUID, JSONB) TO authenticated, service_role;

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

  IF to_regprocedure('public.append_trainer_template_exercises(uuid,jsonb)') IS NULL
    OR has_function_privilege('anon', 'public.append_trainer_template_exercises(uuid,jsonb)', 'EXECUTE')
    OR NOT has_function_privilege('authenticated', 'public.append_trainer_template_exercises(uuid,jsonb)', 'EXECUTE')
    OR NOT has_function_privilege('service_role', 'public.append_trainer_template_exercises(uuid,jsonb)', 'EXECUTE')
  THEN
    RAISE EXCEPTION 'TRAINER_SECURITY_PREFLIGHT_FAILED';
  END IF;

  RETURN 56;
END;
$$;

ALTER FUNCTION public.trainer_security_preflight() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.trainer_security_preflight() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.trainer_security_preflight() TO authenticated, service_role;

COMMIT;
