-- Provenance: schema-only pg_dump 17.6 of the linked remote database (schemas public/private), captured 2026-09-06; psql restrict wrappers removed.

--
-- PostgreSQL database dump
--


-- Dumped from database version 17.6
-- Dumped by pg_dump version 17.6

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: private; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA private;


--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA IF NOT EXISTS public;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated, service_role;


--
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON SCHEMA public IS 'standard public schema';


--
-- Name: BadgeCategory; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."BadgeCategory" AS ENUM (
    'consistency',
    'performance',
    'milestone',
    'special'
);


--
-- Name: Equipment; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."Equipment" AS ENUM (
    'none',
    'dumbbells',
    'barbell',
    'gym',
    'resistance_bands',
    'pull_up_bar'
);


--
-- Name: ExerciseCategory; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."ExerciseCategory" AS ENUM (
    'Fuerza',
    'Cardio',
    'Core',
    'Pliometria',
    'Funcional'
);


--
-- Name: FitnessGoal; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."FitnessGoal" AS ENUM (
    'lose_weight',
    'build_muscle',
    'improve_endurance',
    'stay_healthy',
    'increase_strength'
);


--
-- Name: FitnessLevel; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."FitnessLevel" AS ENUM (
    'beginner',
    'intermediate',
    'advanced'
);


--
-- Name: MealType; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."MealType" AS ENUM (
    'breakfast',
    'lunch',
    'dinner',
    'snack'
);


--
-- Name: MuscleGroup; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."MuscleGroup" AS ENUM (
    'chest',
    'back',
    'shoulders',
    'biceps',
    'triceps',
    'core',
    'glutes',
    'quads',
    'hamstrings',
    'calves'
);


--
-- Name: NotificationType; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."NotificationType" AS ENUM (
    'achievement',
    'streak',
    'challenge',
    'recommendation',
    'system'
);


--
-- Name: Role; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."Role" AS ENUM (
    'user',
    'admin'
);


--
-- Name: SubscriptionTier; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."SubscriptionTier" AS ENUM (
    'basic',
    'premium',
    'vip'
);


--
-- Name: capture_session_completion_milestone(); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.capture_session_completion_milestone() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'private', 'pg_temp'
    AS $$
DECLARE
  v_completed_count BIGINT;
  v_duration_bucket TEXT;
  v_event_name TEXT;
BEGIN
  INSERT INTO private.session_completion_analytics_state AS milestone_state (
    user_id, completed_count, updated_at
  ) VALUES (
    NEW.user_id, 1, NOW()
  )
  ON CONFLICT (user_id) DO UPDATE
  SET completed_count = milestone_state.completed_count + 1,
      updated_at = NOW()
  RETURNING completed_count INTO v_completed_count;

  IF v_completed_count = 1 THEN
    v_event_name := 'first_session_completed';
  ELSIF v_completed_count = 2 THEN
    v_event_name := 'second_session_completed';
  ELSE
    RETURN NEW;
  END IF;

  v_duration_bucket := CASE
    WHEN COALESCE(NEW.duration_minutes, 0) < 30 THEN 'short'
    WHEN NEW.duration_minutes <= 75 THEN 'medium'
    ELSE 'long'
  END;

  INSERT INTO public.product_events (
    event_name, anonymous_id, user_id, path, properties
  ) VALUES (
    v_event_name,
    gen_random_uuid(),
    NEW.user_id,
    '/session',
    jsonb_build_object(
      'path', '/session',
      'authenticated', TRUE,
      'duration_bucket', v_duration_bucket
    )
  );

  RETURN NEW;
END;
$$;


--
-- Name: accept_coaching_request(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.accept_coaching_request(request_id uuid, idempotency_key uuid) RETURNS TABLE(relationship_id uuid, accepted_request_id uuid, cancelled_request_ids uuid[])
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $_$
DECLARE
  v_trainer_user_id UUID := auth.uid();
  v_client_user_id UUID;
  v_request public.coaching_requests%ROWTYPE;
  v_service public.trainer_service_offerings%ROWTYPE;
  v_trainer_account public.profiles%ROWTYPE;
  v_trainer_profile public.trainer_profiles%ROWTYPE;
  v_relationship public.coaching_relationships%ROWTYPE;
  v_cancelled_request_ids UUID[] := '{}'::UUID[];
BEGIN
  IF v_trainer_user_id IS NULL THEN
    RAISE EXCEPTION 'COACHING_AUTH_REQUIRED';
  END IF;
  IF $1 IS NULL OR $2 IS NULL THEN
    RAISE EXCEPTION 'COACHING_REQUEST_INVALID';
  END IF;

  -- This read intentionally reveals only the lock key; ownership is checked after locking.
  SELECT request.client_user_id INTO v_client_user_id
  FROM public.coaching_requests request
  WHERE request.id = $1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'COACHING_REQUEST_NOT_PENDING';
  END IF;

  -- All acceptors for a client serialize here before they can lock a request row.
  PERFORM pg_advisory_xact_lock(hashtextextended(v_client_user_id::TEXT, 0));

  SELECT * INTO v_request
  FROM public.coaching_requests request
  WHERE request.id = $1
    AND request.trainer_user_id = v_trainer_user_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'COACHING_REQUEST_NOT_PENDING';
  END IF;

  IF v_request.status = 'accepted'
    AND v_request.acceptance_idempotency_key = $2 THEN
    SELECT * INTO v_relationship
    FROM public.coaching_relationships relationship
    WHERE relationship.source_request_id = v_request.id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'COACHING_REQUEST_NOT_PENDING';
    END IF;
    RETURN QUERY SELECT v_relationship.id, v_request.id, v_request.acceptance_cancelled_request_ids;
    RETURN;
  END IF;
  IF v_request.status <> 'pending' THEN
    IF EXISTS (
      SELECT 1 FROM public.coaching_relationships relationship
      WHERE relationship.client_user_id = v_request.client_user_id
        AND relationship.status = 'active'
    ) THEN
      RAISE EXCEPTION 'COACHING_ACTIVE_RELATIONSHIP_EXISTS';
    END IF;
    RAISE EXCEPTION 'COACHING_REQUEST_NOT_PENDING';
  END IF;

  SELECT service.* INTO v_service
  FROM public.trainer_service_offerings service
  WHERE service.id = v_request.service_id
    AND service.is_active = TRUE
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'COACHING_SERVICE_NOT_AVAILABLE';
  END IF;
  -- Keep the account -> professional-profile lock order used by administrative
  -- suspension. If an admin wins this lock race, the accept revalidates and fails.
  SELECT * INTO v_trainer_account
  FROM public.profiles account
  WHERE account.id = v_trainer_user_id
  FOR UPDATE;
  IF NOT FOUND OR v_trainer_account.account_status <> 'active' THEN
    RAISE EXCEPTION 'COACHING_TRAINER_NOT_ACTIVE';
  END IF;
  SELECT * INTO v_trainer_profile
  FROM public.trainer_profiles trainer_profile
  WHERE trainer_profile.id = v_service.trainer_profile_id
    AND trainer_profile.user_id = v_trainer_user_id
  FOR UPDATE;
  IF NOT FOUND OR v_trainer_profile.status <> 'active' THEN
    RAISE EXCEPTION 'COACHING_TRAINER_NOT_ACTIVE';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles client_account
    WHERE client_account.id = v_request.client_user_id
      AND client_account.account_status = 'active'
  ) THEN
    RAISE EXCEPTION 'COACHING_CLIENT_NOT_ACTIVE';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.coaching_relationships relationship
    WHERE relationship.client_user_id = v_request.client_user_id
      AND relationship.status = 'active'
  ) THEN
    RAISE EXCEPTION 'COACHING_ACTIVE_RELATIONSHIP_EXISTS';
  END IF;

  INSERT INTO public.coaching_relationships (
    source_request_id, service_id, trainer_user_id, client_user_id, status
  ) VALUES (
    v_request.id, v_request.service_id, v_trainer_user_id, v_request.client_user_id, 'active'
  ) RETURNING * INTO v_relationship;

  UPDATE public.coaching_requests
  SET status = 'accepted', decided_at = NOW(), acceptance_idempotency_key = $2
  WHERE id = v_request.id;

  WITH cancelled AS (
    UPDATE public.coaching_requests request
    SET status = 'cancelled', decided_at = NOW()
    WHERE request.client_user_id = v_request.client_user_id
      AND request.id <> v_request.id
      AND request.status = 'pending'
    RETURNING request.id, request.trainer_user_id, request.service_id
  ), captured AS (
    SELECT COALESCE(array_agg(id ORDER BY id), '{}'::UUID[]) AS ids FROM cancelled
  )
  SELECT ids INTO v_cancelled_request_ids FROM captured;

  UPDATE public.coaching_requests
  SET acceptance_cancelled_request_ids = v_cancelled_request_ids
  WHERE id = v_request.id;

  INSERT INTO public.coaching_consents (relationship_id, scope, text_version, granted_by)
  VALUES (v_relationship.id, 'training_profile', v_request.training_profile_consent_version, v_request.client_user_id);

  INSERT INTO public.professional_audit_logs (
    actor_user_id, subject_user_id, entity_type, entity_id, action, metadata
  ) VALUES (
    v_trainer_user_id, v_request.client_user_id, 'coaching_request', v_request.id,
    'accepted', jsonb_build_object('relationship_id', v_relationship.id, 'service_id', v_request.service_id, 'cancelled_request_ids', v_cancelled_request_ids)
  );
  INSERT INTO public.professional_audit_logs (
    actor_user_id, subject_user_id, entity_type, entity_id, action, metadata
  )
  SELECT v_trainer_user_id, cancelled.trainer_user_id, 'coaching_request', cancelled.id,
    'cancelled_after_acceptance', jsonb_build_object('accepted_request_id', v_request.id, 'service_id', cancelled.service_id)
  FROM public.coaching_requests cancelled
  WHERE cancelled.id = ANY(v_cancelled_request_ids);

  PERFORM public.create_product_notification(
    v_request.client_user_id, 'coaching_request_accepted', 'Solicitud aceptada',
    'Tu solicitud de acompañamiento fue aceptada.', '/coaching',
    'coaching-request-accepted:' || v_request.id::TEXT,
    jsonb_build_object('request_id', v_request.id, 'relationship_id', v_relationship.id)
  );
  PERFORM public.create_product_notification(
    cancelled.trainer_user_id, 'coaching_request_cancelled_after_acceptance', 'Solicitud cancelada',
    'La persona ya inició otro acompañamiento.', '/coach/requests',
    'coaching-request-cancelled-after-acceptance:' || cancelled.id::TEXT,
    jsonb_build_object('request_id', cancelled.id)
  )
  FROM public.coaching_requests cancelled
  WHERE cancelled.id = ANY(v_cancelled_request_ids);

  RETURN QUERY SELECT v_relationship.id, v_request.id, v_cancelled_request_ids;
END;
$_$;


--
-- Name: accept_trainer_assignment(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.accept_trainer_assignment(p_assignment_id uuid, p_idempotency_key text) RETURNS TABLE(assignment_id uuid, workout_plan_id uuid)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_client_user_id UUID := auth.uid();
  v_assignment public.trainer_plan_assignments%ROWTYPE;
  v_version public.trainer_assignment_versions%ROWTYPE;
  v_relationship public.coaching_relationships%ROWTYPE;
  v_plan public.workout_plans%ROWTYPE;
  v_target_client_id UUID;
  v_target_trainer_id UUID;
  v_target_relationship_id UUID;
  v_existing_assignment_id UUID;
  v_existing_plan_id UUID;
BEGIN
  IF v_client_user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF p_assignment_id IS NULL OR NULLIF(BTRIM(COALESCE(p_idempotency_key, '')), '') IS NULL
    OR char_length(BTRIM(p_idempotency_key)) > 200 THEN
    RAISE EXCEPTION 'TRAINER_ASSIGNMENT_ACCEPTANCE_INVALID';
  END IF;

  -- This non-locking discovery is used only to select the advisory namespaces.
  -- All rows are re-read and locked below before any decision or mutation.
  SELECT client_user_id, trainer_user_id, relationship_id
  INTO v_target_client_id, v_target_trainer_id, v_target_relationship_id
  FROM public.trainer_plan_assignments WHERE id = p_assignment_id;
  IF v_target_client_id IS NULL OR v_target_client_id <> v_client_user_id THEN
    RAISE EXCEPTION 'TRAINER_ASSIGNMENT_NOT_FOUND';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(v_client_user_id::TEXT, 0));
  PERFORM pg_advisory_xact_lock(hashtextextended(v_target_trainer_id::TEXT, 0));

  -- Canonical mutable-row order after client -> trainer advisory locks.
  PERFORM 1 FROM public.profiles WHERE id = v_client_user_id AND account_status = 'active' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'TRAINER_ASSIGNMENT_CLIENT_INACTIVE'; END IF;
  PERFORM 1 FROM public.profiles WHERE id = v_target_trainer_id AND account_status = 'active' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'TRAINER_ASSIGNMENT_TRAINER_INACTIVE'; END IF;
  PERFORM 1 FROM public.trainer_profiles WHERE user_id = v_target_trainer_id AND status = 'active' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'TRAINER_ASSIGNMENT_TRAINER_INACTIVE'; END IF;
  SELECT * INTO v_relationship FROM public.coaching_relationships relationship
  WHERE relationship.id = v_target_relationship_id
    AND relationship.client_user_id = v_client_user_id
    AND relationship.trainer_user_id = v_target_trainer_id FOR UPDATE;
  IF NOT FOUND OR v_relationship.status <> 'active' THEN RAISE EXCEPTION 'COACHING_RELATIONSHIP_NOT_ACTIVE'; END IF;
  SELECT * INTO v_assignment FROM public.trainer_plan_assignments assignment
  WHERE assignment.id = p_assignment_id
    AND assignment.client_user_id = v_client_user_id
    AND assignment.trainer_user_id = v_target_trainer_id
    AND assignment.relationship_id = v_target_relationship_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'TRAINER_ASSIGNMENT_NOT_FOUND'; END IF;

  SELECT assignment.id, version.materialized_plan_id
  INTO v_existing_assignment_id, v_existing_plan_id
  FROM public.trainer_plan_assignments assignment
  JOIN public.trainer_assignment_versions version ON version.assignment_id = assignment.id AND version.version_number = 1
  WHERE assignment.client_user_id = v_client_user_id
    AND assignment.acceptance_idempotency_key = BTRIM(p_idempotency_key)
  FOR UPDATE OF assignment, version;
  IF FOUND THEN
    RETURN QUERY SELECT v_existing_assignment_id, v_existing_plan_id;
    RETURN;
  END IF;

  IF v_assignment.status <> 'proposed' THEN RAISE EXCEPTION 'TRAINER_ASSIGNMENT_NOT_PROPOSED'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.coaching_consents consent WHERE consent.relationship_id = v_relationship.id AND consent.scope = 'training_profile' AND consent.revoked_at IS NULL) THEN
    RAISE EXCEPTION 'TRAINER_ASSIGNMENT_CONSENT_REQUIRED';
  END IF;
  SELECT * INTO v_version FROM public.trainer_assignment_versions version
  WHERE version.assignment_id = v_assignment.id AND version.version_number = 1 FOR UPDATE;
  IF NOT FOUND OR v_version.status <> 'proposed' OR v_version.materialized_plan_id IS NULL THEN
    RAISE EXCEPTION 'TRAINER_ASSIGNMENT_VERSION_NOT_PROPOSED';
  END IF;
  SELECT * INTO v_plan FROM public.workout_plans plan
  WHERE plan.id = v_version.materialized_plan_id
    AND plan.user_id = v_client_user_id
    AND plan.trainer_assignment_id = v_assignment.id
    AND plan.trainer_assignment_version_id = v_version.id
    AND plan.source_type = 'trainer_assigned'
    AND plan.library_slot = 'professional'
    AND plan.prescription_locked = TRUE
    AND plan.is_active = FALSE
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'TRAINER_ASSIGNMENT_PLAN_INVALID'; END IF;
  IF EXISTS (SELECT 1 FROM public.trainer_plan_assignments assignment WHERE assignment.client_user_id = v_client_user_id AND assignment.status = 'active') THEN
    RAISE EXCEPTION 'TRAINER_ASSIGNMENT_ACTIVE_EXISTS';
  END IF;

  PERFORM set_config('app.plan_lifecycle_actor', v_client_user_id::TEXT, TRUE);
  PERFORM set_config('app.trainer_prescription_mutation', 'authorized', TRUE);
  UPDATE public.workout_plans SET is_active = FALSE
  WHERE user_id = v_client_user_id AND is_active = TRUE;
  UPDATE public.workout_plans SET is_active = TRUE WHERE id = v_plan.id;
  UPDATE public.trainer_plan_assignments
  SET status = 'cancelled', updated_at = NOW()
  WHERE client_user_id = v_client_user_id AND status = 'proposed' AND id <> v_assignment.id;
  UPDATE public.trainer_plan_assignments
  SET status = 'active', accepted_at = NOW(), active_version_id = v_version.id,
      acceptance_idempotency_key = BTRIM(p_idempotency_key), updated_at = NOW()
  WHERE id = v_assignment.id;
  UPDATE public.trainer_assignment_versions SET status = 'active', effective_from = NOW() WHERE id = v_version.id;
  INSERT INTO public.professional_audit_logs (actor_user_id, subject_user_id, entity_type, entity_id, action, metadata)
  VALUES (v_client_user_id, v_client_user_id, 'trainer_plan_assignment', v_assignment.id, 'accepted', jsonb_build_object('relationship_id', v_relationship.id, 'version_number', 1));
  PERFORM public.create_product_notification(v_assignment.trainer_user_id, 'coaching_assignment_status', 'Rutina profesional aceptada', 'Tu cliente aceptó la rutina profesional.', '/coach/programs', 'coaching-assignment-accepted:' || v_assignment.id::TEXT, jsonb_build_object('assignment_id', v_assignment.id));
  RETURN QUERY SELECT v_assignment.id, v_plan.id;
END;
$$;


--
-- Name: activate_plan_version(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.activate_plan_version(p_plan_id uuid) RETURNS uuid
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_plan public.workout_plans%ROWTYPE;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(v_user_id::TEXT, 0));
  PERFORM set_config('app.plan_lifecycle_actor', v_user_id::TEXT, TRUE);
  SELECT * INTO v_plan FROM public.workout_plans
  WHERE id = p_plan_id AND user_id = v_user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'PLAN_NOT_FOUND'; END IF;
  IF v_plan.library_slot = 'professional' OR v_plan.prescription_locked THEN
    RAISE EXCEPTION 'PROFESSIONAL_PLAN_MANUAL_ACTIVATION_FORBIDDEN';
  END IF;
  PERFORM public.assert_professional_plan_replaceable(v_user_id);
  IF v_plan.retired_at IS NOT NULL THEN RAISE EXCEPTION 'PLAN_VERSION_RETIRED'; END IF;
  IF v_plan.superseded_at IS NOT NULL THEN RAISE EXCEPTION 'PLAN_VERSION_SUPERSEDED'; END IF;
  UPDATE public.workout_plans SET is_active = FALSE WHERE user_id = v_user_id AND is_active = TRUE;
  UPDATE public.workout_plans SET is_active = TRUE
  WHERE id = v_plan.id AND user_id = v_user_id AND retired_at IS NULL AND superseded_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'PLAN_VERSION_UNAVAILABLE'; END IF;
  RETURN v_plan.id;
END;
$$;


--
-- Name: append_trainer_template_exercises(uuid, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.append_trainer_template_exercises(p_template_workout_id uuid, p_exercises jsonb) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $_$
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
$_$;


--
-- Name: apply_workout_adjustment_atomic(uuid, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.apply_workout_adjustment_atomic(p_workout_id uuid, p_changes jsonb) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_plan_id UUID;
  v_change JSONB;
  v_change_type TEXT;
  v_row_id UUID;
  v_seen_ids UUID[] := ARRAY[]::UUID[];
  v_removal_count INTEGER := 0;
  v_exercise_count INTEGER;
  v_numeric NUMERIC;
  v_applied_count INTEGER := 0;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'WORKOUT_ADJUSTMENT_NOT_AUTHENTICATED';
  END IF;

  SELECT workout.plan_id
  INTO v_plan_id
  FROM public.workouts AS workout
  JOIN public.workout_plans AS plan ON plan.id = workout.plan_id
  WHERE workout.id = p_workout_id
    AND workout.user_id = v_user_id
    AND plan.user_id = v_user_id
    AND plan.is_active = TRUE
    AND plan.prescription_locked = FALSE
  FOR UPDATE OF workout, plan;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'WORKOUT_ADJUSTMENT_NOT_EDITABLE';
  END IF;

  IF p_changes IS NULL
    OR jsonb_typeof(p_changes) IS DISTINCT FROM 'array'
    OR jsonb_array_length(p_changes) < 1
    OR jsonb_array_length(p_changes) > 30 THEN
    RAISE EXCEPTION 'WORKOUT_ADJUSTMENT_INVALID_PAYLOAD';
  END IF;

  PERFORM 1
  FROM public.workout_exercises AS exercise
  WHERE exercise.workout_id = p_workout_id
  FOR UPDATE;
  GET DIAGNOSTICS v_exercise_count = ROW_COUNT;

  FOR v_change IN SELECT value FROM jsonb_array_elements(p_changes)
  LOOP
    IF jsonb_typeof(v_change) IS DISTINCT FROM 'object'
      OR jsonb_typeof(v_change -> 'workoutExerciseId') IS DISTINCT FROM 'string'
      OR jsonb_typeof(v_change -> 'type') IS DISTINCT FROM 'string' THEN
      RAISE EXCEPTION 'WORKOUT_ADJUSTMENT_INVALID_PAYLOAD';
    END IF;

    BEGIN
      v_row_id := (v_change ->> 'workoutExerciseId')::UUID;
    EXCEPTION WHEN invalid_text_representation THEN
      RAISE EXCEPTION 'WORKOUT_ADJUSTMENT_INVALID_PAYLOAD';
    END;

    IF array_position(v_seen_ids, v_row_id) IS NOT NULL THEN
      RAISE EXCEPTION 'WORKOUT_ADJUSTMENT_DUPLICATE_EXERCISE';
    END IF;
    v_seen_ids := array_append(v_seen_ids, v_row_id);

    PERFORM 1
    FROM public.workout_exercises AS exercise
    WHERE exercise.id = v_row_id
      AND exercise.workout_id = p_workout_id
    FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'WORKOUT_ADJUSTMENT_UNKNOWN_EXERCISE';
    END IF;

    v_change_type := v_change ->> 'type';
    IF v_change_type = 'remove_exercise' THEN
      v_removal_count := v_removal_count + 1;
      CONTINUE;
    END IF;
    IF v_change_type <> 'update_exercise' THEN
      RAISE EXCEPTION 'WORKOUT_ADJUSTMENT_INVALID_OPERATION';
    END IF;
    IF NOT (v_change ?| ARRAY['sets', 'reps', 'targetRpe', 'restSeconds']) THEN
      RAISE EXCEPTION 'WORKOUT_ADJUSTMENT_EMPTY_UPDATE';
    END IF;

    IF v_change ? 'sets' THEN
      IF jsonb_typeof(v_change -> 'sets') IS DISTINCT FROM 'number' THEN
        RAISE EXCEPTION 'WORKOUT_ADJUSTMENT_INVALID_VALUE';
      END IF;
      v_numeric := (v_change ->> 'sets')::NUMERIC;
      IF v_numeric <> trunc(v_numeric) OR v_numeric NOT BETWEEN 1 AND 10 THEN
        RAISE EXCEPTION 'WORKOUT_ADJUSTMENT_INVALID_VALUE';
      END IF;
    END IF;
    IF v_change ? 'reps' THEN
      IF jsonb_typeof(v_change -> 'reps') IS DISTINCT FROM 'number' THEN
        RAISE EXCEPTION 'WORKOUT_ADJUSTMENT_INVALID_VALUE';
      END IF;
      v_numeric := (v_change ->> 'reps')::NUMERIC;
      IF v_numeric <> trunc(v_numeric) OR v_numeric NOT BETWEEN 1 AND 100 THEN
        RAISE EXCEPTION 'WORKOUT_ADJUSTMENT_INVALID_VALUE';
      END IF;
    END IF;
    IF v_change ? 'targetRpe' THEN
      IF jsonb_typeof(v_change -> 'targetRpe') IS DISTINCT FROM 'number' THEN
        RAISE EXCEPTION 'WORKOUT_ADJUSTMENT_INVALID_VALUE';
      END IF;
      v_numeric := (v_change ->> 'targetRpe')::NUMERIC;
      IF v_numeric <> trunc(v_numeric) OR v_numeric NOT BETWEEN 1 AND 10 THEN
        RAISE EXCEPTION 'WORKOUT_ADJUSTMENT_INVALID_VALUE';
      END IF;
    END IF;
    IF v_change ? 'restSeconds' THEN
      IF jsonb_typeof(v_change -> 'restSeconds') IS DISTINCT FROM 'number' THEN
        RAISE EXCEPTION 'WORKOUT_ADJUSTMENT_INVALID_VALUE';
      END IF;
      v_numeric := (v_change ->> 'restSeconds')::NUMERIC;
      IF v_numeric <> trunc(v_numeric) OR v_numeric NOT BETWEEN 15 AND 600 THEN
        RAISE EXCEPTION 'WORKOUT_ADJUSTMENT_INVALID_VALUE';
      END IF;
    END IF;
  END LOOP;

  IF v_exercise_count - v_removal_count < 1 THEN
    RAISE EXCEPTION 'WORKOUT_ADJUSTMENT_EMPTY_WORKOUT';
  END IF;

  FOR v_change IN SELECT value FROM jsonb_array_elements(p_changes)
  LOOP
    v_row_id := (v_change ->> 'workoutExerciseId')::UUID;
    IF v_change ->> 'type' = 'remove_exercise' THEN
      DELETE FROM public.workout_exercises
      WHERE id = v_row_id AND workout_id = p_workout_id;
    ELSE
      UPDATE public.workout_exercises
      SET
        sets = CASE WHEN v_change ? 'sets' THEN (v_change ->> 'sets')::INTEGER ELSE sets END,
        reps = CASE WHEN v_change ? 'reps' THEN (v_change ->> 'reps')::INTEGER ELSE reps END,
        target_rpe = CASE WHEN v_change ? 'targetRpe' THEN (v_change ->> 'targetRpe')::INTEGER ELSE target_rpe END,
        rest_seconds = CASE WHEN v_change ? 'restSeconds' THEN (v_change ->> 'restSeconds')::INTEGER ELSE rest_seconds END
      WHERE id = v_row_id AND workout_id = p_workout_id;
    END IF;
    v_applied_count := v_applied_count + 1;
  END LOOP;

  IF v_removal_count > 0 THEN
    WITH compact_order AS (
      SELECT id, row_number() OVER (ORDER BY order_index, id)::INTEGER AS next_order
      FROM public.workout_exercises
      WHERE workout_id = p_workout_id
    )
    UPDATE public.workout_exercises AS exercise
    SET order_index = compact_order.next_order
    FROM compact_order
    WHERE exercise.id = compact_order.id;
  END IF;

  UPDATE public.workout_plans
  SET plan_context = 'manual_update', manually_updated_at = NOW()
  WHERE id = v_plan_id AND user_id = v_user_id;

  RETURN v_applied_count;
END;
$$;


--
-- Name: FUNCTION apply_workout_adjustment_atomic(p_workout_id uuid, p_changes jsonb); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.apply_workout_adjustment_atomic(p_workout_id uuid, p_changes jsonb) IS 'Validates and applies workout exercise updates/removals, compacts order, and marks the active editable plan in one transaction.';


--
-- Name: assert_professional_plan_replaceable(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.assert_professional_plan_replaceable(p_user_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_actor_id UUID := auth.uid();
  v_actor_role TEXT := COALESCE(auth.role(), '');
BEGIN
  IF p_user_id IS NULL OR (v_actor_role <> 'service_role' AND v_actor_id IS DISTINCT FROM p_user_id) THEN
    RAISE EXCEPTION 'PROFESSIONAL_PLAN_REPLACEMENT_FORBIDDEN';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM public.workout_plans plan
    JOIN public.trainer_plan_assignments assignment ON assignment.id = plan.trainer_assignment_id
    JOIN public.coaching_relationships relationship ON relationship.id = assignment.relationship_id
    WHERE plan.user_id = p_user_id
      AND plan.library_slot = 'professional'
      AND plan.is_active = TRUE
      AND plan.prescription_locked = TRUE
      AND assignment.status = 'active'
      AND relationship.status = 'active'
  ) THEN
    RAISE EXCEPTION 'PROFESSIONAL_PLAN_REPLACEMENT_FORBIDDEN';
  END IF;
END;
$$;


--
-- Name: audit_applicant_trainer_application_event(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.audit_applicant_trainer_application_event() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_subject_user_id UUID;
  v_application_kind TEXT;
  v_profile_id UUID;
BEGIN
  SELECT application.user_id, application.application_kind
  INTO v_subject_user_id, v_application_kind
  FROM public.trainer_applications application
  WHERE application.id = NEW.application_id;

  IF NEW.actor_role = 'applicant'
    AND auth.role() IS NOT DISTINCT FROM 'authenticated'
    AND auth.uid() IS NOT NULL
    AND NEW.actor_user_id = auth.uid()
    AND v_subject_user_id = auth.uid()
  THEN
    INSERT INTO public.professional_audit_logs (
      actor_user_id, subject_user_id, entity_type, entity_id, action, metadata
    ) VALUES (
      NEW.actor_user_id, v_subject_user_id, 'trainer_application', NEW.application_id,
      'application_' || NEW.to_status,
      jsonb_strip_nulls(jsonb_build_object(
        'event_id', NEW.id,
        'fromStatus', NEW.from_status,
        'toStatus', NEW.to_status
      ))
    );
  ELSIF NEW.actor_role = 'admin'
    AND NEW.to_status = 'approved'
    AND NEW.actor_user_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.profiles admin_profile
      WHERE admin_profile.id = NEW.actor_user_id
        AND admin_profile.is_admin = TRUE
        AND admin_profile.account_status = 'active'
    )
  THEN
    SELECT profile.id INTO v_profile_id
    FROM public.trainer_profiles profile
    WHERE profile.user_id = v_subject_user_id
      AND profile.source_application_id = NEW.application_id;

    IF v_profile_id IS NOT NULL THEN
      INSERT INTO public.professional_audit_logs (
        actor_user_id, subject_user_id, entity_type, entity_id, action,
        metadata
      ) VALUES (
        NEW.actor_user_id, v_subject_user_id, 'trainer_profile', v_profile_id,
        CASE WHEN v_application_kind = 'initial' THEN 'profile_created' ELSE 'profile_updated' END,
        jsonb_build_object('applicationId', NEW.application_id)
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: audit_coaching_materialization(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.audit_coaching_materialization() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_trainer_user_id UUID;
BEGIN
  IF auth.role() <> 'authenticated' OR auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  IF TG_TABLE_NAME = 'coaching_relationships' THEN
    INSERT INTO public.professional_audit_logs (
      actor_user_id, subject_user_id, entity_type, entity_id, action, metadata
    ) VALUES (
      auth.uid(), NEW.client_user_id, 'coaching_relationship', NEW.id,
      'relationship_created', jsonb_build_object('service_id', NEW.service_id)
    );
  ELSIF TG_TABLE_NAME = 'coaching_consents' AND NEW.scope = 'training_profile' THEN
    SELECT relationship.trainer_user_id INTO v_trainer_user_id
    FROM public.coaching_relationships relationship
    WHERE relationship.id = NEW.relationship_id;
    INSERT INTO public.professional_audit_logs (
      actor_user_id, subject_user_id, entity_type, entity_id, action, metadata
    ) VALUES (
      NEW.granted_by, v_trainer_user_id, 'coaching_relationship', NEW.relationship_id,
      'training_profile_consent_granted',
      jsonb_build_object('text_version', NEW.text_version, 'scope', NEW.scope)
    );
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: audit_trainer_application_draft_change(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.audit_trainer_application_draft_change() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
BEGIN
  IF auth.role() <> 'authenticated'
    OR auth.uid() IS NULL
    OR NEW.user_id <> auth.uid()
    OR NEW.status NOT IN ('draft', 'changes_requested')
    OR (TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status)
  THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.professional_audit_logs (
    actor_user_id, subject_user_id, entity_type, entity_id, action
  ) VALUES (
    auth.uid(), NEW.user_id, 'trainer_application', NEW.id, 'application_draft_saved'
  );
  RETURN NEW;
END;
$$;


--
-- Name: audit_trainer_assignment_freeze(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.audit_trainer_assignment_freeze() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM 'frozen' AND NEW.status = 'frozen' THEN
    INSERT INTO public.professional_audit_logs (
      actor_user_id, subject_user_id, entity_type, entity_id, action,
      metadata
    ) VALUES (
      auth.uid(), NEW.client_user_id, 'trainer_plan_assignment', NEW.id,
      'assignment_frozen', jsonb_build_object('relationship_id', NEW.relationship_id)
    );
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: audit_trainer_owned_change(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.audit_trainer_owned_change() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_actor_user_id UUID := auth.uid();
  v_subject_user_id UUID;
  v_entity_id UUID;
  v_entity_type TEXT;
  v_action TEXT;
  v_row JSONB;
  v_old JSONB;
BEGIN
  IF auth.role() <> 'authenticated' OR v_actor_user_id IS NULL THEN
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END IF;

  v_row := CASE WHEN TG_OP = 'DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END;
  v_old := CASE WHEN TG_OP = 'UPDATE' THEN to_jsonb(OLD) ELSE '{}'::JSONB END;

  IF TG_TABLE_NAME = 'trainer_profiles' THEN
    v_entity_id := (v_row ->> 'id')::UUID;
    v_subject_user_id := (v_row ->> 'user_id')::UUID;
    v_entity_type := 'trainer_profile';
    v_action := CASE
      WHEN TG_OP = 'INSERT' THEN 'profile_created'
      WHEN TG_OP = 'DELETE' THEN 'profile_deleted'
      WHEN v_old ->> 'status' IS DISTINCT FROM v_row ->> 'status' THEN 'profile_status_changed'
      ELSE 'profile_updated'
    END;
  ELSIF TG_TABLE_NAME = 'trainer_service_offerings' THEN
    v_entity_id := (v_row ->> 'id')::UUID;
    SELECT profile.user_id INTO v_subject_user_id
    FROM public.trainer_profiles profile
    WHERE profile.id = (v_row ->> 'trainer_profile_id')::UUID;
    v_entity_type := 'trainer_service';
    v_action := CASE
      WHEN TG_OP = 'INSERT' THEN 'service_created'
      WHEN TG_OP = 'DELETE' THEN 'service_deleted'
      WHEN v_old ->> 'is_active' IS DISTINCT FROM v_row ->> 'is_active'
        THEN CASE WHEN (v_row ->> 'is_active')::BOOLEAN THEN 'service_activated' ELSE 'service_deactivated' END
      ELSE 'service_updated'
    END;
  ELSIF TG_TABLE_NAME = 'trainer_program_templates' THEN
    v_entity_id := (v_row ->> 'id')::UUID;
    v_subject_user_id := (v_row ->> 'trainer_user_id')::UUID;
    v_entity_type := 'trainer_program_template';
    v_action := CASE
      WHEN TG_OP = 'INSERT' THEN 'template_created'
      WHEN TG_OP = 'DELETE' THEN 'template_deleted'
      WHEN v_old ->> 'status' IS DISTINCT FROM v_row ->> 'status' AND v_row ->> 'status' = 'archived'
        THEN 'template_archived'
      ELSE 'template_updated'
    END;
  ELSIF TG_TABLE_NAME = 'trainer_template_workouts' THEN
    v_entity_id := (v_row ->> 'id')::UUID;
    v_subject_user_id := v_actor_user_id;
    v_entity_type := 'trainer_template_workout';
    v_action := 'template_workout_' || lower(TG_OP);
  ELSIF TG_TABLE_NAME = 'trainer_template_exercises' THEN
    v_entity_id := (v_row ->> 'id')::UUID;
    v_subject_user_id := v_actor_user_id;
    v_entity_type := 'trainer_template_exercise';
    v_action := 'template_exercise_' || lower(TG_OP);
  ELSIF TG_TABLE_NAME = 'trainer_application_credentials' THEN
    IF TG_OP NOT IN ('INSERT', 'DELETE')
      OR (TG_OP = 'DELETE' AND v_row ->> 'credential_type' <> 'link')
    THEN
      RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
    END IF;
    v_entity_id := (v_row ->> 'id')::UUID;
    SELECT application.user_id INTO v_subject_user_id
    FROM public.trainer_applications application
    WHERE application.id = (v_row ->> 'application_id')::UUID;
    v_entity_type := 'trainer_application_credential';
    v_action := CASE WHEN TG_OP = 'INSERT' THEN 'credential_added' ELSE 'credential_removed' END;
  ELSIF TG_TABLE_NAME = 'trainer_credential_storage_cleanup' THEN
    IF v_row ->> 'reason' <> 'user_removal' THEN
      RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
    END IF;
    v_entity_id := (v_row ->> 'credential_id')::UUID;
    v_subject_user_id := (v_row ->> 'user_id')::UUID;
    v_entity_type := 'trainer_application_credential';
    v_action := CASE
      WHEN TG_OP = 'INSERT' THEN 'credential_removal_prepared'
      WHEN TG_OP = 'UPDATE'
        AND (
          v_old ->> 'attempt_count' IS DISTINCT FROM v_row ->> 'attempt_count'
          OR v_old ->> 'last_error' IS DISTINCT FROM v_row ->> 'last_error'
        )
        THEN 'credential_cleanup_failed'
      WHEN TG_OP = 'UPDATE' THEN 'credential_removal_retried'
      ELSE 'credential_removed'
    END;
  ELSE
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END IF;

  IF v_subject_user_id = v_actor_user_id AND v_entity_id IS NOT NULL THEN
    INSERT INTO public.professional_audit_logs (
      actor_user_id, subject_user_id, entity_type, entity_id, action
    ) VALUES (
      v_actor_user_id, v_subject_user_id, v_entity_type, v_entity_id, v_action
    );
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;


--
-- Name: authorize_session_start(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.authorize_session_start(p_client_session_id uuid, p_workout_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
      DECLARE
        v_context JSONB;
        v_plan public.workout_plans%ROWTYPE;
      BEGIN
        v_context := public.authorize_session_start_legacy_v1(p_client_session_id, p_workout_id);
        IF v_context->'plan' = 'null'::JSONB THEN RETURN v_context; END IF;
        SELECT * INTO v_plan FROM public.workout_plans
        WHERE id = (v_context->'plan'->>'id')::UUID;
        IF NOT FOUND THEN RAISE EXCEPTION 'SESSION_PLAN_INACTIVE'; END IF;
        v_context := jsonb_set(v_context, '{plan}', (v_context->'plan') || jsonb_build_object(
          'prescriptionLocked', COALESCE(v_plan.prescription_locked, FALSE),
          'trainerAssignmentId', v_plan.trainer_assignment_id,
          'trainerAssignmentVersionId', v_plan.trainer_assignment_version_id
        ));
        UPDATE public.session_authorizations
        SET session_context_snapshot = v_context
        WHERE client_session_id = p_client_session_id
          AND workout_id = p_workout_id;
        RETURN v_context;
      END;
      $$;


--
-- Name: authorize_session_start_legacy_v1(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.authorize_session_start_legacy_v1(p_client_session_id uuid, p_workout_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_created_at TIMESTAMPTZ := NOW();
  v_time_zone TEXT;
  v_today_start TIMESTAMPTZ;
  v_today_end TIMESTAMPTZ;
  v_window_start TIMESTAMPTZ;
  v_days_late INTEGER;
  v_workout public.workouts%ROWTYPE;
  v_plan public.workout_plans%ROWTYPE;
  v_existing public.session_authorizations%ROWTYPE;
  v_context JSONB;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'SESSION_AUTHENTICATION_REQUIRED';
  END IF;

  IF p_client_session_id IS NULL OR p_workout_id IS NULL THEN
    RAISE EXCEPTION 'SESSION_AUTHORIZATION_INVALID_ID';
  END IF;

  -- Uses the same per-user key as plan lifecycle RPCs. Either the workout is
  -- authorized against the current active plan, or the plan switch wins first.
  PERFORM pg_advisory_xact_lock(hashtextextended(v_user_id::TEXT, 0));

  SELECT * INTO v_existing
  FROM public.session_authorizations
  WHERE client_session_id = p_client_session_id
  FOR UPDATE;

  IF FOUND THEN
    IF v_existing.user_id IS DISTINCT FROM v_user_id
      OR v_existing.workout_id IS DISTINCT FROM p_workout_id THEN
      RAISE EXCEPTION 'SESSION_AUTHORIZATION_MISMATCH';
    END IF;
    IF v_existing.consumed_at IS NOT NULL THEN
      IF EXISTS (
        SELECT 1
        FROM public.progress_logs
        WHERE user_id = v_user_id
          AND workout_id = p_workout_id
          AND client_session_id = p_client_session_id
      ) THEN
        RETURN v_existing.session_context_snapshot;
      END IF;
      RAISE EXCEPTION 'SESSION_AUTHORIZATION_CONSUMED';
    END IF;
    IF v_existing.released_at IS NOT NULL OR v_existing.expires_at <= v_created_at THEN
      RAISE EXCEPTION 'SESSION_AUTHORIZATION_EXPIRED';
    END IF;
    RETURN v_existing.session_context_snapshot;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.progress_logs
    WHERE user_id = v_user_id
      AND client_session_id = p_client_session_id
  ) THEN
    RAISE EXCEPTION 'SESSION_ALREADY_SAVED';
  END IF;

  SELECT * INTO v_workout
  FROM public.workouts
  WHERE id = p_workout_id
    AND user_id = v_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'SESSION_WORKOUT_NOT_FOUND';
  END IF;

  IF v_workout.plan_id IS NULL OR v_workout.day_of_week IS NULL THEN
    RAISE EXCEPTION 'SESSION_WORKOUT_UNAVAILABLE';
  END IF;

  SELECT * INTO v_plan
  FROM public.workout_plans
  WHERE id = v_workout.plan_id
    AND user_id = v_user_id
    AND is_active = TRUE
    AND retired_at IS NULL
    AND superseded_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'SESSION_PLAN_INACTIVE';
  END IF;

  SELECT CASE
    WHEN profile.timezone IS NOT NULL
      AND EXISTS (SELECT 1 FROM pg_timezone_names zone WHERE zone.name = profile.timezone)
      THEN profile.timezone
    ELSE 'America/Havana'
  END
  INTO v_time_zone
  FROM public.profiles AS profile
  WHERE profile.id = v_user_id;

  v_time_zone := COALESCE(v_time_zone, 'America/Havana');
  v_days_late := (
    EXTRACT(ISODOW FROM (v_created_at AT TIME ZONE v_time_zone))::INTEGER
    - v_workout.day_of_week + 7
  ) % 7;

  IF v_days_late > 2 THEN
    RAISE EXCEPTION 'SESSION_WORKOUT_UNAVAILABLE';
  END IF;

  v_today_start := date_trunc('day', v_created_at AT TIME ZONE v_time_zone)
    AT TIME ZONE v_time_zone;
  v_today_end := (date_trunc('day', v_created_at AT TIME ZONE v_time_zone) + INTERVAL '1 day')
    AT TIME ZONE v_time_zone;
  v_window_start := (
    date_trunc('day', v_created_at AT TIME ZONE v_time_zone)
    - make_interval(days => v_days_late)
  ) AT TIME ZONE v_time_zone;

  IF EXISTS (
    SELECT 1
    FROM public.progress_logs
    WHERE user_id = v_user_id
      AND workout_id = p_workout_id
      AND completed_at >= v_window_start
      AND completed_at < v_today_end
  ) THEN
    RAISE EXCEPTION 'SESSION_WORKOUT_ALREADY_COMPLETED';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.progress_logs
    WHERE user_id = v_user_id
      AND completed_at >= v_today_start
      AND completed_at < v_today_end
  ) THEN
    RAISE EXCEPTION 'SESSION_DAILY_LIMIT_REACHED';
  END IF;

  -- Release expired reservations under the same per-user lock, then reserve
  -- the date before returning authorization A. Authorization B cannot displace
  -- A while A remains live, even if the active plan changes in between.
  UPDATE public.session_authorizations
  SET released_at = v_created_at
  WHERE user_id = v_user_id
    AND policy_date = (v_created_at AT TIME ZONE v_time_zone)::DATE
    AND consumed_at IS NULL
    AND released_at IS NULL
    AND expires_at <= v_created_at;

  -- A consumed claim remains authoritative daily evidence even when a legacy
  -- client stored its completion timestamp outside the frozen calendar day.
  -- Reject here so we never issue an authorization that the atomic save must
  -- deterministically refuse later.
  IF EXISTS (
    SELECT 1
    FROM public.session_authorizations
    WHERE user_id = v_user_id
      AND policy_date = (v_created_at AT TIME ZONE v_time_zone)::DATE
      AND consumed_at IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'SESSION_DAILY_LIMIT_REACHED';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.session_authorizations
    WHERE user_id = v_user_id
      AND policy_date = (v_created_at AT TIME ZONE v_time_zone)::DATE
      AND consumed_at IS NULL
      AND released_at IS NULL
  ) THEN
    RAISE EXCEPTION 'SESSION_DAILY_LIMIT_REACHED';
  END IF;

  v_context := jsonb_build_object(
    'version', 1,
    'workout', jsonb_build_object(
      'id', v_workout.id,
      'name', v_workout.name,
      'focus', v_workout.focus,
      'dayOfWeek', v_workout.day_of_week
    ),
    'plan', jsonb_build_object(
      'id', v_plan.id,
      'familyId', v_plan.family_id,
      'name', v_plan.name,
      'weekNumber', v_plan.week_number
    ),
    'exercises', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'exerciseId', exercise.id,
          'name', exercise.name,
          'nameEs', exercise.name_es,
          'muscleGroups', COALESCE(exercise.muscle_groups, ARRAY[]::TEXT[]),
          'muscleGroupsEs', COALESCE(exercise.muscle_groups_es, ARRAY[]::TEXT[]),
          'isCompound', COALESCE(exercise.is_compound, FALSE)
        )
        ORDER BY workout_exercise.order_index
      )
      FROM public.workout_exercises AS workout_exercise
      JOIN public.exercises AS exercise ON exercise.id = workout_exercise.exercise_id
      WHERE workout_exercise.workout_id = v_workout.id
    ), '[]'::JSONB)
  );

  INSERT INTO public.session_authorizations (
    client_session_id,
    user_id,
    workout_id,
    plan_id,
    session_context_snapshot,
    policy_timezone,
    policy_date,
    policy_day_start,
    policy_day_end,
    workout_window_start,
    created_at,
    expires_at
  ) VALUES (
    p_client_session_id,
    v_user_id,
    p_workout_id,
    v_plan.id,
    v_context,
    v_time_zone,
    (v_created_at AT TIME ZONE v_time_zone)::DATE,
    v_today_start,
    v_today_end,
    v_window_start,
    v_created_at,
    v_created_at + INTERVAL '12 hours'
  );

  RETURN v_context;
END;
$$;


--
-- Name: bump_post_comment_count(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.bump_post_comment_count() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF (TG_OP = 'INSERT') THEN
    UPDATE posts SET comment_count = comment_count + 1 WHERE id = NEW.post_id;
  ELSIF (TG_OP = 'DELETE') THEN
    UPDATE posts SET comment_count = GREATEST(comment_count - 1, 0) WHERE id = OLD.post_id;
  END IF;
  RETURN NULL;
END; $$;


--
-- Name: bump_post_like_count(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.bump_post_like_count() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF (TG_OP = 'INSERT') THEN
    UPDATE posts SET like_count = like_count + 1 WHERE id = NEW.post_id;
  ELSIF (TG_OP = 'DELETE') THEN
    UPDATE posts SET like_count = GREATEST(like_count - 1, 0) WHERE id = OLD.post_id;
  END IF;
  RETURN NULL;
END; $$;


--
-- Name: bump_profile_post_count(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.bump_profile_post_count() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF (TG_OP = 'INSERT') THEN
    UPDATE profiles SET post_count = post_count + 1 WHERE id = NEW.user_id;
  ELSIF (TG_OP = 'DELETE') THEN
    UPDATE profiles SET post_count = GREATEST(post_count - 1, 0) WHERE id = OLD.user_id;
  END IF;
  RETURN NULL;
END; $$;


--
-- Name: cancel_coaching_request(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.cancel_coaching_request(p_request_id uuid) RETURNS TABLE(request_id uuid)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_client_user_id UUID := auth.uid();
  v_request public.coaching_requests%ROWTYPE;
BEGIN
  IF v_client_user_id IS NULL THEN
    RAISE EXCEPTION 'COACHING_AUTH_REQUIRED';
  END IF;

  SELECT * INTO v_request
  FROM public.coaching_requests request
  WHERE request.id = cancel_coaching_request.p_request_id
    AND request.client_user_id = v_client_user_id
  FOR UPDATE;
  IF NOT FOUND OR v_request.status <> 'pending' THEN
    RAISE EXCEPTION 'COACHING_REQUEST_NOT_CANCELLABLE';
  END IF;

  UPDATE public.coaching_requests
  SET status = 'cancelled', decided_at = NOW()
  WHERE id = v_request.id;

  INSERT INTO public.professional_audit_logs (
    actor_user_id, subject_user_id, entity_type, entity_id, action, metadata
  ) VALUES (
    v_client_user_id, v_request.trainer_user_id, 'coaching_request', v_request.id,
    'cancelled', jsonb_build_object('service_id', v_request.service_id)
  );
  PERFORM public.create_product_notification(
    v_request.trainer_user_id,
    'coaching_request_cancelled',
    'Solicitud cancelada',
    'La persona retiró su solicitud de acompañamiento.',
    '/coach/requests',
    'coaching-request-cancelled:' || v_request.id::TEXT,
    jsonb_build_object('request_id', v_request.id, 'service_id', v_request.service_id)
  );

  RETURN QUERY SELECT v_request.id;
END;
$$;


--
-- Name: cleanup_trainer_security_e2e_fixture(text, uuid[]); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.cleanup_trainer_security_e2e_fixture(p_run_id text, p_user_ids uuid[]) RETURNS integer
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


--
-- Name: clone_plan_from_post_atomic(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.clone_plan_from_post_atomic(p_post_id uuid) RETURNS uuid
    LANGUAGE plpgsql
    SET search_path TO 'public'
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
  PERFORM set_config('app.plan_lifecycle_actor', v_user_id::TEXT, TRUE);
  PERFORM public.assert_professional_plan_replaceable(v_user_id);

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
    source_post_id,
    source_user_id,
    family_id,
    library_slot
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
    v_family_id,
    'personal'
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


--
-- Name: create_coaching_request(uuid, text, text, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.create_coaching_request(service_id uuid, message text, consent_version text, idempotency_key uuid) RETURNS TABLE(request_id uuid, created boolean)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $_$
DECLARE
  v_client_user_id UUID := auth.uid();
  v_requested_service_id UUID := $1;
  v_message TEXT := $2;
  v_consent_version TEXT := $3;
  v_idempotency_key UUID := $4;
  v_service public.trainer_service_offerings%ROWTYPE;
  v_trainer_profile public.trainer_profiles%ROWTYPE;
  v_existing_request public.coaching_requests%ROWTYPE;
BEGIN
  IF v_client_user_id IS NULL THEN
    RAISE EXCEPTION 'COACHING_AUTH_REQUIRED';
  END IF;
  IF v_requested_service_id IS NULL OR v_idempotency_key IS NULL OR v_message IS NULL OR char_length(v_message) > 1000 THEN
    RAISE EXCEPTION 'COACHING_REQUEST_INVALID';
  END IF;
  IF v_consent_version <> 'training-profile-v1' THEN
    RAISE EXCEPTION 'COACHING_CONSENT_VERSION_INVALID';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(v_client_user_id::TEXT, 0));

  SELECT * INTO v_existing_request
  FROM public.coaching_requests request
  WHERE request.client_user_id = v_client_user_id
    AND request.idempotency_key = v_idempotency_key;
  IF FOUND THEN
    RETURN QUERY SELECT v_existing_request.id, FALSE;
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.profiles client_profile
    WHERE client_profile.id = v_client_user_id
      AND client_profile.account_status = 'active'
  ) THEN
    RAISE EXCEPTION 'COACHING_CLIENT_NOT_ACTIVE';
  END IF;

  SELECT service.* INTO v_service
  FROM public.trainer_service_offerings service
  WHERE service.id = v_requested_service_id
    AND service.is_active = TRUE
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'COACHING_SERVICE_NOT_AVAILABLE';
  END IF;

  SELECT * INTO v_trainer_profile
  FROM public.trainer_profiles trainer_profile
  WHERE trainer_profile.id = v_service.trainer_profile_id
    AND trainer_profile.status = 'active';
  IF NOT FOUND OR NOT EXISTS (
    SELECT 1 FROM public.profiles trainer_account
    WHERE trainer_account.id = v_trainer_profile.user_id
      AND trainer_account.account_status = 'active'
  ) THEN
    RAISE EXCEPTION 'COACHING_TRAINER_NOT_ACTIVE';
  END IF;
  IF v_client_user_id = v_trainer_profile.user_id THEN
    RAISE EXCEPTION 'COACHING_SELF_REQUEST_FORBIDDEN';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.coaching_relationships relationship
    WHERE relationship.client_user_id = v_client_user_id
      AND relationship.status = 'active'
  ) THEN
    RAISE EXCEPTION 'COACHING_ACTIVE_RELATIONSHIP_EXISTS';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.coaching_requests request
    WHERE request.client_user_id = v_client_user_id
      AND request.trainer_user_id = v_trainer_profile.user_id
      AND request.service_id = v_service.id
      AND request.status = 'pending'
  ) THEN
    RAISE EXCEPTION 'COACHING_PENDING_REQUEST_EXISTS';
  END IF;

  INSERT INTO public.coaching_requests (
    service_id, trainer_user_id, client_user_id, message,
    training_profile_consent_version, idempotency_key, status
  ) VALUES (
    v_service.id, v_trainer_profile.user_id, v_client_user_id, v_message,
    v_consent_version, v_idempotency_key, 'pending'
  ) RETURNING * INTO v_existing_request;

  INSERT INTO public.professional_audit_logs (
    actor_user_id, subject_user_id, entity_type, entity_id, action, metadata
  ) VALUES (
    v_client_user_id, v_trainer_profile.user_id, 'coaching_request', v_existing_request.id,
    'created', jsonb_build_object('service_id', v_service.id, 'consent_version', v_consent_version, 'idempotency_key', v_idempotency_key)
  );
  PERFORM public.create_product_notification(
    v_trainer_profile.user_id,
    'coaching_request_created',
    'Nueva solicitud de acompañamiento',
    'Tienes una nueva solicitud para uno de tus servicios.',
    '/coach/requests',
    'coaching-request-created:' || v_existing_request.id::TEXT,
    jsonb_build_object('request_id', v_existing_request.id, 'service_id', v_service.id)
  );

  RETURN QUERY SELECT v_existing_request.id, TRUE;
END;
$_$;


--
-- Name: create_engine_plan(jsonb, jsonb, integer, text, uuid, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.create_engine_plan(p_plan jsonb, p_metadata jsonb, p_week_number integer, p_plan_context text, p_parent_plan_id uuid DEFAULT NULL::uuid, p_profile_updates jsonb DEFAULT '{}'::jsonb) RETURNS uuid
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_recent_plan_id UUID;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(v_user_id::TEXT, 0));

  SELECT id INTO v_recent_plan_id
  FROM public.workout_plans
  WHERE user_id = v_user_id
    AND plan_context = p_plan_context
    AND parent_plan_id IS NOT DISTINCT FROM p_parent_plan_id
    AND source_type = 'engine'
    AND created_at >= NOW() - INTERVAL '30 seconds'
  ORDER BY created_at DESC, id DESC
  LIMIT 1;

  IF v_recent_plan_id IS NOT NULL THEN
    RETURN v_recent_plan_id;
  END IF;

  RETURN public.create_engine_plan_v2(
    p_plan,
    p_metadata,
    p_week_number,
    p_plan_context,
    p_parent_plan_id,
    gen_random_uuid(),
    p_profile_updates
  );
END;
$$;


--
-- Name: FUNCTION create_engine_plan(p_plan jsonb, p_metadata jsonb, p_week_number integer, p_plan_context text, p_parent_plan_id uuid, p_profile_updates jsonb); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.create_engine_plan(p_plan jsonb, p_metadata jsonb, p_week_number integer, p_plan_context text, p_parent_plan_id uuid, p_profile_updates jsonb) IS 'DB-first compatibility wrapper that delegates legacy callers to atomic versioned lifecycle v2.';


--
-- Name: create_engine_plan_v2(jsonb, jsonb, integer, text, uuid, uuid, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.create_engine_plan_v2(p_plan jsonb, p_metadata jsonb, p_week_number integer, p_plan_context text, p_expected_parent_plan_id uuid, p_generation_request_id uuid, p_profile_updates jsonb DEFAULT '{}'::jsonb) RETURNS uuid
    LANGUAGE plpgsql
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
  PERFORM public.assert_professional_plan_replaceable(v_user_id);

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


--
-- Name: FUNCTION create_engine_plan_v2(p_plan jsonb, p_metadata jsonb, p_week_number integer, p_plan_context text, p_expected_parent_plan_id uuid, p_generation_request_id uuid, p_profile_updates jsonb); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.create_engine_plan_v2(p_plan jsonb, p_metadata jsonb, p_week_number integer, p_plan_context text, p_expected_parent_plan_id uuid, p_generation_request_id uuid, p_profile_updates jsonb) IS 'Creates one idempotent plan version and atomically switches active state under a per-user lock.';


--
-- Name: create_manual_plan_atomic(jsonb, jsonb, boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.create_manual_plan_atomic(p_plan jsonb, p_workouts jsonb, p_make_active boolean DEFAULT true) RETURNS uuid
    LANGUAGE plpgsql
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
  IF p_make_active THEN
    PERFORM public.assert_professional_plan_replaceable(v_user_id);
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


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: product_notifications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.product_notifications (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    type text NOT NULL,
    title text NOT NULL,
    body text NOT NULL,
    url text,
    payload jsonb DEFAULT '{}'::jsonb NOT NULL,
    dedupe_key text NOT NULL,
    read_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    dismissed_at timestamp with time zone,
    CONSTRAINT product_notifications_body_check CHECK (((char_length(body) >= 1) AND (char_length(body) <= 500))),
    CONSTRAINT product_notifications_dedupe_key_check CHECK ((dedupe_key <> ''::text)),
    CONSTRAINT product_notifications_internal_url_check CHECK (((url IS NULL) OR (url ~~ '/%'::text))),
    CONSTRAINT product_notifications_read_after_create_check CHECK (((read_at IS NULL) OR (read_at >= created_at))),
    CONSTRAINT product_notifications_title_check CHECK (((char_length(title) >= 1) AND (char_length(title) <= 120)))
);

ALTER TABLE ONLY public.product_notifications FORCE ROW LEVEL SECURITY;


--
-- Name: TABLE product_notifications; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.product_notifications IS 'Persistent in-app notifications for product and professional workflows.';


--
-- Name: COLUMN product_notifications.dismissed_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.product_notifications.dismissed_at IS 'Owner-controlled soft-archive timestamp; archived rows remain durable evidence.';


--
-- Name: create_product_notification(uuid, text, text, text, text, text, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.create_product_notification(p_user_id uuid, p_type text, p_title text, p_body text, p_url text, p_dedupe_key text, p_payload jsonb DEFAULT '{}'::jsonb) RETURNS public.product_notifications
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
  notification public.product_notifications%ROWTYPE;
BEGIN
  IF current_setting('app.test_fail_acceptance_notification', true) = 'on'
    AND p_dedupe_key LIKE 'coaching-assignment-accepted:%' THEN
    RAISE EXCEPTION 'TEST_ACCEPTANCE_NOTIFICATION_FAILURE';
  END IF;
  INSERT INTO public.product_notifications (user_id, type, title, body, url, payload, dedupe_key)
  VALUES (p_user_id, p_type, p_title, p_body, p_url, COALESCE(p_payload, '{}'::JSONB), p_dedupe_key)
  ON CONFLICT (user_id, dedupe_key) DO NOTHING
  RETURNING * INTO notification;
  IF notification.id IS NULL THEN
    SELECT * INTO STRICT notification FROM public.product_notifications
    WHERE user_id = p_user_id AND dedupe_key = p_dedupe_key;
  END IF;
  RETURN notification;
END;
$$;


--
-- Name: create_trainer_application_credential(uuid, uuid, text, text, text, date, date, text, text, bigint); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.create_trainer_application_credential(p_credential_id uuid, p_application_id uuid, p_credential_type text, p_title text, p_issuer text, p_issued_on date, p_expires_on date, p_external_url text, p_mime_type text, p_size_bytes bigint) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'storage', 'pg_temp'
    AS $_$
DECLARE
  v_user_id UUID := auth.uid();
  v_application public.trainer_applications%ROWTYPE;
  v_storage_path TEXT;
  v_expected_extension TEXT;
  v_credential public.trainer_application_credentials%ROWTYPE;
BEGIN
  IF v_user_id IS NULL OR auth.role() <> 'authenticated' THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Authentication required.';
  END IF;

  SELECT application.* INTO v_application
  FROM public.trainer_applications application
  WHERE application.id = p_application_id
    AND application.user_id = v_user_id
  FOR UPDATE;

  IF NOT FOUND OR v_application.application_kind <> 'initial'
    OR v_application.status NOT IN ('draft', 'changes_requested')
    OR NOT public.is_account_active(v_user_id) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Application unavailable.';
  END IF;

  IF char_length(btrim(COALESCE(p_title, ''))) NOT BETWEEN 1 AND 160
    OR char_length(COALESCE(p_issuer, '')) > 160
    OR (p_expires_on IS NOT NULL AND p_issued_on IS NOT NULL AND p_expires_on < p_issued_on) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'Credential metadata invalid.';
  END IF;

  IF p_credential_type = 'link' THEN
    IF p_external_url IS NULL
      OR p_external_url !~ '^https://[^/[:space:]]+(?:/[^[:space:]]*)?$'
      OR char_length(p_external_url) > 2048
      OR p_mime_type IS NOT NULL
      OR p_size_bytes IS NOT NULL THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'Credential link invalid.';
    END IF;
  ELSIF p_credential_type = 'document' THEN
    v_expected_extension := CASE p_mime_type
      WHEN 'application/pdf' THEN 'pdf'
      WHEN 'image/jpeg' THEN 'jpg'
      WHEN 'image/png' THEN 'png'
      ELSE NULL
    END;
    v_storage_path := v_user_id::TEXT || '/' || p_application_id::TEXT || '/'
      || p_credential_id::TEXT || '.' || COALESCE(v_expected_extension, 'invalid');

    IF p_external_url IS NOT NULL
      OR v_expected_extension IS NULL
      OR p_size_bytes NOT BETWEEN 1 AND 10485760
      OR NOT EXISTS (
        SELECT 1
        FROM storage.objects object
        WHERE object.bucket_id = 'trainer-credentials'
          AND object.name = v_storage_path
          AND object.metadata->>'mimetype' = p_mime_type
          AND COALESCE(object.metadata->>'size', '') ~ '^[0-9]+$'
          AND (object.metadata->>'size')::BIGINT = p_size_bytes
      ) THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'Credential document invalid.';
    END IF;
  ELSE
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'Credential type invalid.';
  END IF;

  INSERT INTO public.trainer_application_credentials (
    id, application_id, credential_type, title, issuer, issued_on, expires_on,
    storage_path, external_url, mime_type, size_bytes
  ) VALUES (
    p_credential_id, p_application_id, p_credential_type, btrim(p_title),
    NULLIF(btrim(COALESCE(p_issuer, '')), ''), p_issued_on, p_expires_on,
    v_storage_path, p_external_url, p_mime_type, p_size_bytes
  )
  ON CONFLICT (id) DO NOTHING
  RETURNING * INTO v_credential;

  IF v_credential.id IS NULL THEN
    SELECT credential.* INTO v_credential
    FROM public.trainer_application_credentials credential
    JOIN public.trainer_applications application ON application.id = credential.application_id
    WHERE credential.id = p_credential_id
      AND credential.application_id = p_application_id
      AND application.user_id = v_user_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Credential identifier unavailable.';
    END IF;
  END IF;

  IF p_credential_type = 'document' THEN
    DELETE FROM public.trainer_credential_storage_cleanup cleanup
    WHERE cleanup.user_id = v_user_id
      AND cleanup.application_id = p_application_id
      AND cleanup.credential_id = p_credential_id
      AND cleanup.storage_path = v_storage_path
      AND cleanup.reason = 'upload_rollback';
  END IF;

  RETURN jsonb_build_object('id', v_credential.id, 'application_id', v_credential.application_id);
END;
$_$;


--
-- Name: decline_coaching_request(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.decline_coaching_request(request_id uuid, reason text DEFAULT ''::text) RETURNS TABLE(declined_request_id uuid)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $_$
DECLARE
  v_trainer_user_id UUID := auth.uid();
  v_request public.coaching_requests%ROWTYPE;
  v_reason TEXT := COALESCE(btrim($2), '');
BEGIN
  IF v_trainer_user_id IS NULL THEN
    RAISE EXCEPTION 'COACHING_AUTH_REQUIRED';
  END IF;
  IF $1 IS NULL OR char_length(v_reason) > 500 THEN
    RAISE EXCEPTION 'COACHING_REQUEST_INVALID';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.trainer_profiles trainer_profile
    JOIN public.profiles trainer_account ON trainer_account.id = trainer_profile.user_id
    WHERE trainer_profile.user_id = v_trainer_user_id
      AND trainer_profile.status = 'active'
      AND trainer_account.account_status = 'active'
  ) THEN
    RAISE EXCEPTION 'COACHING_TRAINER_NOT_ACTIVE';
  END IF;

  SELECT * INTO v_request
  FROM public.coaching_requests request
  WHERE request.id = $1
    AND request.trainer_user_id = v_trainer_user_id
    AND request.status = 'pending'
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'COACHING_REQUEST_NOT_PENDING';
  END IF;

  UPDATE public.coaching_requests
  SET status = 'declined', decided_at = NOW()
  WHERE id = v_request.id;
  INSERT INTO public.professional_audit_logs (
    actor_user_id, subject_user_id, entity_type, entity_id, action, metadata
  ) VALUES (
    v_trainer_user_id, v_request.client_user_id, 'coaching_request', v_request.id,
    'declined', jsonb_build_object('reason', v_reason, 'service_id', v_request.service_id)
  );
  PERFORM public.create_product_notification(
    v_request.client_user_id, 'coaching_request_declined', 'Solicitud no aceptada',
    'Esta solicitud no pudo ser aceptada en este momento.', '/coaching',
    'coaching-request-declined:' || v_request.id::TEXT,
    jsonb_build_object('request_id', v_request.id)
  );
  RETURN QUERY SELECT v_request.id;
END;
$_$;


--
-- Name: decline_trainer_assignment(uuid, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.decline_trainer_assignment(p_assignment_id uuid, p_reason text, p_idempotency_key text) RETURNS TABLE(assignment_id uuid, changed boolean)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_client_user_id UUID := auth.uid();
  v_target_client_id UUID;
  v_reason TEXT := NULLIF(BTRIM(COALESCE(p_reason, '')), '');
  v_idempotency_key TEXT := BTRIM(COALESCE(p_idempotency_key, ''));
  v_assignment public.trainer_plan_assignments%ROWTYPE;
  v_version public.trainer_assignment_versions%ROWTYPE;
  v_plan public.workout_plans%ROWTYPE;
BEGIN
  IF v_client_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF p_assignment_id IS NULL
    OR v_idempotency_key = ''
    OR char_length(v_idempotency_key) > 200
    OR (v_reason IS NOT NULL AND char_length(v_reason) > 500)
  THEN
    RAISE EXCEPTION 'TRAINER_ASSIGNMENT_DECLINE_INVALID';
  END IF;

  -- Discovery selects only the advisory-lock namespace. The owned row is
  -- re-read and locked before any state is disclosed or changed.
  SELECT candidate.client_user_id
  INTO v_target_client_id
  FROM public.trainer_plan_assignments candidate
  WHERE candidate.id = p_assignment_id;

  IF v_target_client_id IS NULL OR v_target_client_id <> v_client_user_id THEN
    RAISE EXCEPTION 'TRAINER_ASSIGNMENT_NOT_FOUND';
  END IF;

  -- Acceptance takes this same client lock first, so accept-versus-decline has
  -- exactly one winner. Decline needs no relationship or trainer lock because
  -- it is an owning client's terminal safety action.
  PERFORM pg_advisory_xact_lock(hashtextextended(v_client_user_id::TEXT, 0));

  SELECT *
  INTO v_assignment
  FROM public.trainer_plan_assignments candidate
  WHERE candidate.id = p_assignment_id
    AND candidate.client_user_id = v_client_user_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'TRAINER_ASSIGNMENT_NOT_FOUND';
  END IF;

  -- Relationship closure freezes active prescriptions by locking version then
  -- assignment. Resolve terminal/stale assignment states before touching the
  -- version so a late decline cannot form the inverse assignment -> version
  -- lock cycle with that trigger.
  IF v_assignment.status = 'cancelled'
    AND v_assignment.decline_idempotency_key = v_idempotency_key
  THEN
    RETURN QUERY SELECT v_assignment.id, FALSE;
    RETURN;
  END IF;

  IF v_assignment.status <> 'proposed' THEN
    RAISE EXCEPTION 'TRAINER_ASSIGNMENT_NOT_PROPOSED';
  END IF;

  SELECT *
  INTO v_version
  FROM public.trainer_assignment_versions candidate
  WHERE candidate.assignment_id = v_assignment.id
    AND candidate.version_number = 1
  FOR UPDATE;
  IF NOT FOUND OR v_version.materialized_plan_id IS NULL THEN
    RAISE EXCEPTION 'TRAINER_ASSIGNMENT_VERSION_NOT_PROPOSED';
  END IF;

  SELECT *
  INTO v_plan
  FROM public.workout_plans candidate
  WHERE candidate.id = v_version.materialized_plan_id
  FOR UPDATE;
  IF NOT FOUND
    OR v_plan.user_id IS DISTINCT FROM v_client_user_id
    OR v_plan.trainer_relationship_id IS DISTINCT FROM v_assignment.relationship_id
    OR v_plan.trainer_assignment_id IS DISTINCT FROM v_assignment.id
    OR v_plan.trainer_assignment_version_id IS DISTINCT FROM v_version.id
    OR v_plan.source_type IS DISTINCT FROM 'trainer_assigned'
    OR v_plan.library_slot IS DISTINCT FROM 'professional'
    OR v_plan.prescription_locked IS DISTINCT FROM TRUE
  THEN
    RAISE EXCEPTION 'TRAINER_ASSIGNMENT_PLAN_INVALID';
  END IF;

  IF v_version.status <> 'proposed' THEN
    RAISE EXCEPTION 'TRAINER_ASSIGNMENT_VERSION_NOT_PROPOSED';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.trainer_plan_assignments existing
    WHERE existing.client_user_id = v_client_user_id
      AND existing.decline_idempotency_key = v_idempotency_key
      AND existing.id <> v_assignment.id
  ) THEN
    RAISE EXCEPTION 'TRAINER_ASSIGNMENT_DECLINE_IDEMPOTENCY_CONFLICT';
  END IF;

  PERFORM set_config('app.plan_lifecycle_actor', v_client_user_id::TEXT, TRUE);
  PERFORM set_config('app.trainer_prescription_mutation', 'authorized', TRUE);

  UPDATE public.workout_plans
  SET is_active = FALSE
  WHERE id = v_plan.id;

  UPDATE public.trainer_assignment_versions
  SET status = 'cancelled'
  WHERE id = v_version.id;

  BEGIN
    UPDATE public.trainer_plan_assignments
    SET status = 'cancelled',
        decline_idempotency_key = v_idempotency_key,
        updated_at = NOW()
    WHERE id = v_assignment.id;
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'TRAINER_ASSIGNMENT_DECLINE_IDEMPOTENCY_CONFLICT';
  END;

  INSERT INTO public.professional_audit_logs (
    actor_user_id, subject_user_id, entity_type, entity_id, action, metadata
  ) VALUES (
    v_client_user_id,
    v_client_user_id,
    'trainer_plan_assignment',
    v_assignment.id,
    'declined',
    '{}'::JSONB
  );

  PERFORM public.create_product_notification(
    v_assignment.trainer_user_id,
    'coaching_assignment_status',
    'Rutina profesional no aceptada',
    COALESCE(v_reason, 'Tu cliente decidió no aceptar la rutina profesional.'),
    '/coach/programs?clientId=' || v_client_user_id::TEXT,
    'coaching-assignment-declined:' || v_assignment.id::TEXT,
    jsonb_build_object(
      'assignment_id', v_assignment.id,
      'client_user_id', v_client_user_id,
      'relationship_id', v_assignment.relationship_id
    )
  );

  RETURN QUERY SELECT v_assignment.id, TRUE;
END;
$$;


--
-- Name: dismiss_current_notification_attention(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.dismiss_current_notification_attention(p_notice_key text) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_notice_key TEXT := btrim(COALESCE(p_notice_key, ''));
  v_profile_time_zone TEXT;
  v_time_zone TEXT;
  v_last_check_in_at TIMESTAMPTZ;
  v_plan_id UUID;
  v_plan_ai_notes TEXT;
  v_plan_updated_at TIMESTAMPTZ;
  v_banner_status TEXT;
  v_banner_starts_on DATE;
  v_banner_ends_on DATE;
  v_banner_updated_at TIMESTAMPTZ;
  v_candidate_plan_id UUID;
  v_candidate_timestamp TIMESTAMPTZ;
  v_plan_visibility_threshold TIMESTAMPTZ;
  v_today DATE;
BEGIN
  IF v_user_id IS NULL OR auth.role() IS DISTINCT FROM 'authenticated' THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Authentication required.';
  END IF;

  IF char_length(v_notice_key) NOT BETWEEN 1 AND 160 THEN
    RETURN FALSE;
  END IF;

  -- Plan lifecycle RPCs and triggers use this same per-user lock. Row locks
  -- below serialize profile and banner changes that do not use that contract.
  PERFORM pg_advisory_xact_lock(hashtextextended(v_user_id::TEXT, 0));

  SELECT profile.timezone, profile.last_check_in_at
  INTO v_profile_time_zone, v_last_check_in_at
  FROM public.profiles AS profile
  WHERE profile.id = v_user_id
  FOR SHARE;

  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;

  IF v_profile_time_zone IS NULL OR NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_timezone_names AS zone
    WHERE zone.name = v_profile_time_zone
  ) THEN
    RETURN FALSE;
  END IF;
  v_time_zone := v_profile_time_zone;

  IF v_notice_key LIKE 'plan-update:%' THEN
    IF char_length(v_notice_key) < 50 OR substring(v_notice_key FROM 49 FOR 1) <> ':' THEN
      RETURN FALSE;
    END IF;

    v_candidate_plan_id := substring(v_notice_key FROM 13 FOR 36)::UUID;
    v_candidate_timestamp := substring(v_notice_key FROM 50)::TIMESTAMPTZ;

    SELECT plan.id, plan.ai_notes, plan.updated_at
    INTO v_plan_id, v_plan_ai_notes, v_plan_updated_at
    FROM public.workout_plans AS plan
    WHERE plan.user_id = v_user_id
      AND plan.is_active = TRUE
    FOR SHARE;

    IF NOT FOUND THEN
      RETURN FALSE;
    END IF;

    v_plan_visibility_threshold := (
      (NOW() AT TIME ZONE v_time_zone) - INTERVAL '7 days'
    ) AT TIME ZONE v_time_zone;

    IF v_plan_ai_notes IS NULL
      OR v_plan_ai_notes = ''
      OR v_plan_updated_at <= v_plan_visibility_threshold
      OR v_candidate_plan_id <> v_plan_id
      OR v_candidate_timestamp <> v_plan_updated_at
    THEN
      RETURN FALSE;
    END IF;
  ELSIF v_notice_key LIKE 'check-in:%' THEN
    IF v_last_check_in_at IS NULL THEN
      IF v_notice_key <> 'check-in:never' THEN
        RETURN FALSE;
      END IF;
    ELSE
      v_candidate_timestamp := substring(v_notice_key FROM 10)::TIMESTAMPTZ;
      IF v_candidate_timestamp <> v_last_check_in_at
        OR NOW() - v_last_check_in_at < INTERVAL '28 days'
      THEN
        RETURN FALSE;
      END IF;
    END IF;
  ELSIF v_notice_key LIKE 'promo:dashboard-primary:%' THEN
    v_candidate_timestamp := substring(
      v_notice_key FROM char_length('promo:dashboard-primary:') + 1
    )::TIMESTAMPTZ;
    v_today := (NOW() AT TIME ZONE v_time_zone)::DATE;

    SELECT banner.status, banner.starts_on, banner.ends_on, banner.updated_at
    INTO v_banner_status, v_banner_starts_on, v_banner_ends_on, v_banner_updated_at
    FROM public.dashboard_banners AS banner
    WHERE banner.slot = 'dashboard-primary'
    FOR SHARE;

    IF NOT FOUND
      OR v_banner_status <> 'active'
      OR v_banner_starts_on > v_today
      OR v_banner_ends_on < v_today
      OR v_candidate_timestamp <> v_banner_updated_at
    THEN
      RETURN FALSE;
    END IF;
  ELSE
    RETURN FALSE;
  END IF;

  INSERT INTO public.notification_attention_dismissals (user_id, notice_key)
  VALUES (v_user_id, v_notice_key)
  ON CONFLICT (user_id, notice_key) DO NOTHING;

  RETURN TRUE;
EXCEPTION
  WHEN invalid_text_representation OR datetime_field_overflow THEN
    RETURN FALSE;
END;
$$;


--
-- Name: FUNCTION dismiss_current_notification_attention(p_notice_key text); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.dismiss_current_notification_attention(p_notice_key text) IS 'Atomically persists an authenticated owner dismissal only while its plan, check-in, or promotion version remains visible.';


--
-- Name: end_coaching_relationship(uuid, text, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.end_coaching_relationship(p_relationship_id uuid, p_reason text, p_idempotency_key uuid) RETURNS TABLE(relationship_id uuid, changed boolean)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_actor_user_id UUID := auth.uid();
  v_relationship public.coaching_relationships%ROWTYPE;
  v_reason TEXT := NULLIF(btrim(COALESCE(p_reason, '')), '');
  v_other_user_id UUID;
BEGIN
  IF v_actor_user_id IS NULL THEN RAISE EXCEPTION 'COACHING_AUTH_REQUIRED'; END IF;
  IF p_relationship_id IS NULL OR p_idempotency_key IS NULL OR char_length(COALESCE(v_reason, '')) > 500 THEN
    RAISE EXCEPTION 'COACHING_RELATIONSHIP_END_INVALID';
  END IF;

  SELECT * INTO v_relationship
  FROM public.coaching_relationships relationship
  WHERE relationship.id = p_relationship_id
  FOR UPDATE;
  IF NOT FOUND OR (v_relationship.client_user_id <> v_actor_user_id AND v_relationship.trainer_user_id <> v_actor_user_id) THEN
    RAISE EXCEPTION 'COACHING_RELATIONSHIP_NOT_FOUND';
  END IF;
  IF v_relationship.status = 'ended' THEN
    RETURN QUERY SELECT v_relationship.id, FALSE;
    RETURN;
  END IF;

  v_other_user_id := CASE WHEN v_actor_user_id = v_relationship.client_user_id
    THEN v_relationship.trainer_user_id ELSE v_relationship.client_user_id END;
  UPDATE public.coaching_consents consent
  SET revoked_at = NOW(), revoked_by = v_actor_user_id
  WHERE consent.relationship_id = v_relationship.id AND consent.revoked_at IS NULL;
  UPDATE public.coaching_relationships
  SET status = 'ended', ended_at = NOW(), ended_by = v_actor_user_id, end_reason = v_reason, paused_at = NULL
  WHERE id = v_relationship.id;
  INSERT INTO public.professional_audit_logs (actor_user_id, subject_user_id, entity_type, entity_id, action, metadata)
  VALUES (v_actor_user_id, v_other_user_id, 'coaching_relationship', v_relationship.id, 'ended',
    jsonb_build_object('reason', v_reason, 'idempotency_key', p_idempotency_key));
  PERFORM public.create_product_notification(
    v_actor_user_id, 'coaching_relationship_ended', 'Acompañamiento finalizado',
    'El acompañamiento fue finalizado.', '/coaching',
    'coaching-relationship-ended:' || v_relationship.id::TEXT || ':' || v_actor_user_id::TEXT,
    jsonb_build_object('relationship_id', v_relationship.id));
  PERFORM public.create_product_notification(
    v_other_user_id, 'coaching_relationship_ended', 'Acompañamiento finalizado',
    'El acompañamiento fue finalizado.', '/coaching',
    'coaching-relationship-ended:' || v_relationship.id::TEXT || ':' || v_other_user_id::TEXT,
    jsonb_build_object('relationship_id', v_relationship.id));
  RETURN QUERY SELECT v_relationship.id, TRUE;
END;
$$;


--
-- Name: enforce_completed_session_snapshot_immutability(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.enforce_completed_session_snapshot_immutability() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public', 'pg_temp'
    AS $$
BEGIN
  IF OLD.session_context_snapshot IS NOT NULL
    AND NEW.session_context_snapshot IS DISTINCT FROM OLD.session_context_snapshot THEN
    RAISE EXCEPTION 'SESSION_CONTEXT_SNAPSHOT_IMMUTABLE';
  END IF;

  IF OLD.session_result_snapshot IS NOT NULL
    AND NEW.session_result_snapshot IS DISTINCT FROM OLD.session_result_snapshot THEN
    RAISE EXCEPTION 'SESSION_RESULT_SNAPSHOT_IMMUTABLE';
  END IF;

  IF OLD.session_detail_backup IS NOT NULL
    AND NEW.session_detail_backup IS DISTINCT FROM OLD.session_detail_backup THEN
    RAISE EXCEPTION 'SESSION_DETAIL_BACKUP_IMMUTABLE';
  END IF;

  IF NEW.id IS DISTINCT FROM OLD.id
    OR NEW.user_id IS DISTINCT FROM OLD.user_id
    OR (
      NEW.workout_id IS DISTINCT FROM OLD.workout_id
      AND NOT (OLD.workout_id IS NOT NULL AND NEW.workout_id IS NULL)
    )
    OR NEW.client_session_id IS DISTINCT FROM OLD.client_session_id
    OR NEW.completed_at IS DISTINCT FROM OLD.completed_at
    OR NEW.duration_minutes IS DISTINCT FROM OLD.duration_minutes
    OR NEW.notes IS DISTINCT FROM OLD.notes
    OR NEW.mood_rating IS DISTINCT FROM OLD.mood_rating
    OR NEW.energy_rating IS DISTINCT FROM OLD.energy_rating THEN
    RAISE EXCEPTION 'SESSION_EVIDENCE_IMMUTABLE';
  END IF;

  RETURN NEW;
END;
$$;


--
-- Name: enforce_exercise_log_immutability(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.enforce_exercise_log_immutability() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public', 'pg_temp'
    AS $$
BEGIN
  RAISE EXCEPTION 'SESSION_EXERCISE_EVIDENCE_IMMUTABLE';
END;
$$;


--
-- Name: enforce_plan_family_limit(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.enforce_plan_family_limit() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
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


--
-- Name: enforce_protected_profile_fields(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.enforce_protected_profile_fields() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'auth', 'pg_temp'
    AS $$
DECLARE
  target_email TEXT;
  requester_email TEXT;
  requester_role TEXT;
BEGIN
  SELECT LOWER(email) INTO target_email FROM auth.users WHERE id = NEW.id;
  SELECT LOWER(email) INTO requester_email FROM auth.users WHERE id = auth.uid();
  requester_role := COALESCE(auth.role(), '');

  IF target_email = 'fejames07@gmail.com' THEN
    NEW.is_admin := TRUE;
    NEW.subscription_tier := 'pro';
    NEW.account_status := 'active';
    NEW.suspension_reason := NULL;
    NEW.suspended_at := NULL;
    NEW.suspended_until := NULL;
    NEW.suspended_by := NULL;
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF requester_role <> 'service_role' AND requester_email <> 'fejames07@gmail.com' THEN
      NEW.is_admin := FALSE;
      NEW.subscription_tier := 'free';
      NEW.account_status := 'active';
      NEW.suspension_reason := NULL;
      NEW.suspended_at := NULL;
      NEW.suspended_until := NULL;
      NEW.suspended_by := NULL;
    END IF;
    RETURN NEW;
  END IF;

  IF requester_role <> 'service_role' AND requester_email <> 'fejames07@gmail.com' THEN
    NEW.is_admin := OLD.is_admin;
    NEW.subscription_tier := OLD.subscription_tier;
    NEW.account_status := OLD.account_status;
    NEW.suspension_reason := OLD.suspension_reason;
    NEW.suspended_at := OLD.suspended_at;
    NEW.suspended_until := OLD.suspended_until;
    NEW.suspended_by := OLD.suspended_by;
  END IF;

  RETURN NEW;
END;
$$;


--
-- Name: enforce_subscription_tier_change(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.enforce_subscription_tier_change() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_actor_role TEXT := COALESCE(auth.role(), '');
  v_family_count INTEGER;
BEGIN
  IF NEW.subscription_tier IS NOT DISTINCT FROM OLD.subscription_tier THEN RETURN NEW; END IF;
  IF v_actor_role <> 'service_role' AND session_user NOT IN ('postgres', 'supabase_admin') THEN
    RAISE EXCEPTION 'PLAN_SUBSCRIPTION_TIER_CHANGE_FORBIDDEN';
  END IF;
  IF NOT pg_try_advisory_xact_lock(hashtextextended(NEW.id::TEXT, 0)) THEN
    RAISE EXCEPTION 'PLAN_TIER_LOCK_BUSY_RETRY';
  END IF;
  IF OLD.subscription_tier = 'pro' AND NEW.subscription_tier = 'free' THEN
    SELECT COUNT(DISTINCT family_id)::INTEGER INTO v_family_count
    FROM workout_plans WHERE user_id = NEW.id AND library_slot = 'personal'
      AND retired_at IS NULL AND superseded_at IS NULL;
    IF v_family_count > 2 THEN
      RAISE EXCEPTION 'PLAN_DOWNGRADE_FAMILY_LIMIT: archive plans until at most two current families remain';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: enforce_trainer_workout_iso_schedule(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.enforce_trainer_workout_iso_schedule() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public', 'pg_temp'
    AS $_$
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

  IF jsonb_typeof(v_snapshot->'schemaVersion') IS DISTINCT FROM 'number'
    OR v_snapshot->'schemaVersion' IS DISTINCT FROM '1'::JSONB
    OR jsonb_typeof(v_snapshot->'workouts') IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'TRAINER_PRESCRIPTION_SCHEDULE_MISMATCH';
  END IF;

  SELECT
    count(*),
    min(
      CASE
        WHEN jsonb_typeof(item.value) IS DISTINCT FROM 'object' THEN NULL
        WHEN jsonb_typeof(item.value->'dayOfWeek') IS DISTINCT FROM 'number' THEN NULL
        WHEN COALESCE(item.value->>'dayOfWeek', '') !~ '^[1-7]$' THEN NULL
        ELSE (item.value->>'dayOfWeek')::INTEGER
      END
    )
  INTO v_match_count, v_expected_day
  FROM jsonb_array_elements(v_snapshot->'workouts') AS item(value)
  WHERE CASE
    WHEN jsonb_typeof(item.value) IS DISTINCT FROM 'object' THEN FALSE
    WHEN jsonb_typeof(item.value->'orderInPlan') IS DISTINCT FROM 'number' THEN FALSE
    WHEN COALESCE(item.value->>'orderInPlan', '') !~ '^[1-7]$' THEN FALSE
    ELSE (item.value->>'orderInPlan')::INTEGER = NEW.order_in_plan
  END;

  IF v_match_count <> 1
    OR v_expected_day IS NULL
    OR v_expected_day NOT BETWEEN 1 AND 7
    OR NEW.day_of_week IS DISTINCT FROM v_expected_day THEN
    RAISE EXCEPTION 'TRAINER_PRESCRIPTION_SCHEDULE_MISMATCH';
  END IF;

  RETURN NEW;
END;
$_$;


--
-- Name: finalize_trainer_credential_cleanup(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.finalize_trainer_credential_cleanup(p_cleanup_id uuid) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'storage', 'pg_temp'
    AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_cleanup public.trainer_credential_storage_cleanup%ROWTYPE;
  v_application public.trainer_applications%ROWTYPE;
BEGIN
  IF v_user_id IS NULL OR auth.role() <> 'authenticated' THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Authentication required.';
  END IF;

  SELECT cleanup.* INTO v_cleanup
  FROM public.trainer_credential_storage_cleanup cleanup
  WHERE cleanup.id = p_cleanup_id AND cleanup.user_id = v_user_id;
  IF NOT FOUND THEN RETURN TRUE; END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('trainer-profile:' || v_user_id::TEXT, 0));

  SELECT application.* INTO v_application
  FROM public.trainer_applications application
  WHERE application.id = v_cleanup.application_id
    AND application.user_id = v_user_id
  FOR UPDATE;
  IF NOT FOUND THEN RETURN TRUE; END IF;

  SELECT cleanup.* INTO v_cleanup
  FROM public.trainer_credential_storage_cleanup cleanup
  WHERE cleanup.id = p_cleanup_id
    AND cleanup.user_id = v_user_id
    AND cleanup.application_id = v_application.id
  FOR UPDATE;
  IF NOT FOUND THEN RETURN TRUE; END IF;

  IF v_cleanup.reason = 'user_removal'
    AND (v_application.application_kind <> 'initial'
      OR v_application.status NOT IN ('draft', 'changes_requested'))
  THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'Application is no longer editable.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM storage.objects object
    WHERE object.bucket_id = 'trainer-credentials' AND object.name = v_cleanup.storage_path
  ) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'Storage object still exists.';
  END IF;

  IF v_cleanup.reason = 'user_removal' THEN
    DELETE FROM public.trainer_application_credentials credential
    WHERE credential.id = v_cleanup.credential_id
      AND credential.application_id = v_cleanup.application_id;
  END IF;
  DELETE FROM public.trainer_credential_storage_cleanup WHERE id = v_cleanup.id;
  RETURN TRUE;
END;
$$;


--
-- Name: freeze_trainer_assignments_for_relationship(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.freeze_trainer_assignments_for_relationship() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
BEGIN
  IF NEW.status IN ('ended', 'paused_by_platform')
    AND OLD.status IS DISTINCT FROM NEW.status THEN
    UPDATE public.trainer_assignment_versions version
    SET status = 'frozen'
    FROM public.trainer_plan_assignments assignment
    WHERE assignment.relationship_id = NEW.id
      AND assignment.status = 'active'
      AND version.id = assignment.active_version_id
      AND version.status = 'active';
    UPDATE public.trainer_plan_assignments
    SET status = 'frozen', updated_at = NOW()
    WHERE relationship_id = NEW.id AND status = 'active';
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: get_calendar_payload(text, timestamp with time zone); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_calendar_payload(p_time_zone text DEFAULT 'America/Havana'::text, p_from timestamp with time zone DEFAULT NULL::timestamp with time zone) RETURNS jsonb
    LANGUAGE sql STABLE
    SET search_path TO 'public'
    AS $$
WITH day_sessions AS (
  SELECT (pl.completed_at AT TIME ZONE p_time_zone)::date AS day,
    COUNT(*)::int AS sessions,
    COALESCE(SUM(pl.duration_minutes), 0)::int AS duration_min,
    jsonb_agg(pl.id ORDER BY pl.completed_at DESC) AS log_ids
  FROM progress_logs pl
  LEFT JOIN workouts w ON w.id = pl.workout_id AND w.user_id = auth.uid()
  WHERE pl.user_id = auth.uid() AND (p_from IS NULL OR pl.completed_at >= p_from)
  GROUP BY 1
), day_volume AS (
  SELECT (pl.completed_at AT TIME ZONE p_time_zone)::date AS day,
    COALESCE(SUM(weight_value * rep_value), 0)::numeric AS volume_kg
  FROM progress_logs pl
  LEFT JOIN workouts w ON w.id = pl.workout_id AND w.user_id = auth.uid()
  JOIN exercise_logs el ON el.progress_log_id = pl.id
  CROSS JOIN LATERAL unnest(
    COALESCE(el.weights_kg, ARRAY[]::numeric[]),
    COALESCE(el.reps_completed, ARRAY[]::integer[])
  ) AS set_values(weight_value, rep_value)
  WHERE pl.user_id = auth.uid() AND (p_from IS NULL OR pl.completed_at >= p_from)
  GROUP BY 1
)
SELECT COALESCE(jsonb_agg(jsonb_build_object(
  'date', to_char(ds.day, 'YYYY-MM-DD'),
  'sessions', ds.sessions,
  'duration_min', ds.duration_min,
  'volume_kg', COALESCE(dv.volume_kg, 0),
  'log_ids', ds.log_ids
) ORDER BY ds.day), '[]'::jsonb)
FROM day_sessions ds
LEFT JOIN day_volume dv ON dv.day = ds.day;
$$;


--
-- Name: FUNCTION get_calendar_payload(p_time_zone text, p_from timestamp with time zone); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.get_calendar_payload(p_time_zone text, p_from timestamp with time zone) IS 'Agregados por día (sesiones, volumen, duración, log_ids) del usuario autenticado para el calendario.';


--
-- Name: get_coach_client_insights(uuid, date, date); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_coach_client_insights(p_client_id uuid, p_from_date date, p_to_date date) RETURNS jsonb
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


--
-- Name: get_coach_client_measurements(uuid, date, date); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_coach_client_measurements(p_client_id uuid, p_from_date date, p_to_date date) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_trainer_id UUID := auth.uid();
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

  -- This single authorization statement locks the rows that revocation updates.
  -- The locks remain held until the RPC statement completes its measurement read.
  SELECT CASE
    WHEN client_account.timezone IS NOT NULL
      AND EXISTS (SELECT 1 FROM pg_catalog.pg_timezone_names AS zone WHERE zone.name = client_account.timezone)
    THEN client_account.timezone
    ELSE 'America/Havana'
  END
  INTO v_client_timezone
  FROM public.coaching_relationships AS relationship
  JOIN public.trainer_profiles AS trainer_profile ON trainer_profile.user_id = relationship.trainer_user_id
  JOIN public.profiles AS trainer_account ON trainer_account.id = trainer_profile.user_id
  JOIN public.profiles AS client_account ON client_account.id = relationship.client_user_id
  JOIN public.coaching_consents AS training_consent
    ON training_consent.relationship_id = relationship.id
   AND training_consent.scope = 'training_profile'
   AND training_consent.revoked_at IS NULL
  JOIN public.coaching_consents AS body_consent
    ON body_consent.relationship_id = relationship.id
   AND body_consent.scope = 'body_measurements'
   AND body_consent.revoked_at IS NULL
  WHERE relationship.trainer_user_id = v_trainer_id
    AND relationship.client_user_id = p_client_id
    AND relationship.status = 'active'
    AND trainer_profile.status = 'active'
    AND trainer_account.account_status = 'active'
    AND client_account.account_status = 'active'
    AND public.has_active_coaching_scope(v_trainer_id, p_client_id, 'body_measurements')
  FOR SHARE OF relationship, trainer_profile, trainer_account, client_account, training_consent, body_consent;

  IF v_client_timezone IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'COACH_CLIENT_INSIGHTS_UNAVAILABLE';
  END IF;

  SELECT jsonb_build_object(
    'schemaVersion', 1,
    'measurements', COALESCE(jsonb_agg(jsonb_build_object(
      'recordedOn', (measurement.recorded_at AT TIME ZONE v_client_timezone)::DATE,
      'weightKg', measurement.weight_kg,
      'bodyFatPercentage', measurement.body_fat_percentage,
      'muscleMassKg', measurement.muscle_mass_kg,
      'chestCm', measurement.chest_cm,
      'waistCm', measurement.waist_cm,
      'hipsCm', measurement.hips_cm,
      'armsCm', measurement.arms_cm,
      'legsCm', measurement.legs_cm
    ) ORDER BY measurement.recorded_at DESC, measurement.id DESC), '[]'::JSONB)
  )
  INTO v_result
  FROM public.measurements AS measurement
  WHERE measurement.user_id = p_client_id
    AND (measurement.recorded_at AT TIME ZONE v_client_timezone)::DATE BETWEEN p_from_date AND p_to_date;

  RETURN v_result;
END;
$$;


--
-- Name: get_coach_clients_summary(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_coach_clients_summary() RETURNS jsonb
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


--
-- Name: get_dashboard_payload(timestamp with time zone, timestamp with time zone); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_dashboard_payload(p_week_start timestamp with time zone, p_recent_start timestamp with time zone) RETURNS jsonb
    LANGUAGE sql STABLE
    SET search_path TO 'public'
    AS $$
WITH active_plan AS (
  SELECT wp.id, wp.name, wp.ai_notes, wp.created_at, wp.week_number, wp.plan_context,
    wp.days_per_week, wp.duration_weeks, wp.difficulty, wp.goal
  FROM workout_plans wp
  WHERE wp.user_id = auth.uid() AND wp.is_active = true
  ORDER BY wp.created_at DESC
  LIMIT 1
), plan_workouts AS (
  SELECT w.id, w.name, w.focus, w.day_of_week, w.order_in_plan, w.estimated_duration_minutes,
    COALESCE(COUNT(we.id), 0)::int AS exercise_count
  FROM workouts w
  JOIN active_plan ap ON ap.id = w.plan_id
  LEFT JOIN workout_exercises we ON we.workout_id = w.id
  GROUP BY w.id, w.name, w.focus, w.day_of_week, w.order_in_plan, w.estimated_duration_minutes
), recent_logs AS (
  SELECT pl.id, pl.workout_id, pl.completed_at, pl.duration_minutes, pl.session_context_snapshot,
    CASE WHEN w.id IS NULL THEN NULL ELSE jsonb_build_object('name', w.name, 'focus', w.focus) END AS workout
  FROM progress_logs pl
  LEFT JOIN workouts w ON w.id = pl.workout_id AND w.user_id = auth.uid()
  WHERE pl.user_id = auth.uid() AND pl.completed_at >= p_recent_start
  ORDER BY pl.completed_at DESC, pl.id DESC
), week_logs AS (
  SELECT * FROM recent_logs WHERE completed_at >= p_week_start
), week_volume AS (
  SELECT COALESCE(SUM(weight_value * rep_value), 0)::numeric AS total_kg
  FROM week_logs wl
  JOIN exercise_logs el ON el.progress_log_id = wl.id
  CROSS JOIN LATERAL unnest(
    COALESCE(el.weights_kg, ARRAY[]::numeric[]),
    COALESCE(el.reps_completed, ARRAY[]::integer[])
  ) AS set_values(weight_value, rep_value)
), has_history AS (
  SELECT EXISTS (
    SELECT 1 FROM progress_logs pl WHERE pl.user_id = auth.uid() LIMIT 1
  ) AS value
)
SELECT jsonb_build_object(
  'active_plan', (SELECT to_jsonb(ap) FROM active_plan ap),
  'workouts', COALESCE((SELECT jsonb_agg(to_jsonb(pw) ORDER BY pw.order_in_plan NULLS LAST) FROM plan_workouts pw), '[]'::jsonb),
  'recent_logs', COALESCE((SELECT jsonb_agg(to_jsonb(rl) ORDER BY rl.completed_at DESC, rl.id DESC) FROM recent_logs rl), '[]'::jsonb),
  'week_logs', COALESCE((SELECT jsonb_agg(to_jsonb(wl) ORDER BY wl.completed_at DESC, wl.id DESC) FROM week_logs wl), '[]'::jsonb),
  'week_volume_kg', COALESCE((SELECT total_kg FROM week_volume), 0),
  'has_completed_sessions', COALESCE((SELECT value FROM has_history), false)
);
$$;


--
-- Name: FUNCTION get_dashboard_payload(p_week_start timestamp with time zone, p_recent_start timestamp with time zone); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.get_dashboard_payload(p_week_start timestamp with time zone, p_recent_start timestamp with time zone) IS 'Devuelve en una sola llamada el plan activo, workouts, logs recientes y volumen semanal para el dashboard.';


--
-- Name: get_exercise_detail_payload(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_exercise_detail_payload(p_exercise_id uuid) RETURNS jsonb
    LANGUAGE sql STABLE
    SET search_path TO 'public'
    AS $$
WITH preferred_language AS (
  SELECT COALESCE((SELECT language FROM profiles WHERE id = auth.uid()), 'es') AS value
), target_exercise AS (
  SELECT e.id,
    CASE WHEN (SELECT value FROM preferred_language) = 'es' THEN COALESCE(e.name_es, e.name) ELSE e.name END AS name,
    CASE WHEN (SELECT value FROM preferred_language) = 'es' THEN COALESCE(e.description_es, e.description) ELSE e.description END AS description,
    CASE WHEN (SELECT value FROM preferred_language) = 'es' THEN COALESCE(e.muscle_groups_es, e.muscle_groups) ELSE e.muscle_groups END AS muscle_groups,
    CASE WHEN (SELECT value FROM preferred_language) = 'es' THEN COALESCE(e.equipment_es, e.equipment) ELSE e.equipment END AS equipment,
    e.difficulty, e.exercise_type, e.is_compound,
    CASE WHEN (SELECT value FROM preferred_language) = 'es' THEN COALESCE(e.instructions_es, e.instructions) ELSE e.instructions END AS instructions,
    e.video_url, e.image_url
  FROM exercises e
  WHERE e.id = p_exercise_id AND e.is_public = true
  LIMIT 1
), exercise_rows AS (
  SELECT el.id, el.progress_log_id, el.sets_completed, el.reps_completed, el.weights_kg,
    el.rpe_values, el.notes,
    jsonb_build_object('id', pl.id, 'workout_id', pl.workout_id, 'completed_at', pl.completed_at,
      'duration_minutes', pl.duration_minutes, 'mood_rating', pl.mood_rating,
      'session_context_snapshot', pl.session_context_snapshot) AS progress_log,
    pl.completed_at AS progress_completed_at
  FROM exercise_logs el
  JOIN progress_logs pl ON pl.id = el.progress_log_id
  WHERE el.exercise_id = p_exercise_id AND pl.user_id = auth.uid()
  ORDER BY pl.completed_at DESC
), workout_rows AS (
  SELECT DISTINCT w.id, w.name, w.focus
  FROM exercise_logs el
  JOIN progress_logs pl ON pl.id = el.progress_log_id
  LEFT JOIN workouts w ON w.id = pl.workout_id AND w.user_id = auth.uid()
  WHERE el.exercise_id = p_exercise_id AND pl.user_id = auth.uid() AND w.id IS NOT NULL
)
SELECT jsonb_build_object(
  'exercise', (SELECT to_jsonb(te) FROM target_exercise te),
  'logs', COALESCE((SELECT jsonb_agg((to_jsonb(er) - 'progress_completed_at') ORDER BY er.progress_completed_at DESC) FROM exercise_rows er), '[]'::jsonb),
  'workouts', COALESCE((SELECT jsonb_agg(to_jsonb(wr) ORDER BY wr.name) FROM workout_rows wr), '[]'::jsonb)
);
$$;


--
-- Name: FUNCTION get_exercise_detail_payload(p_exercise_id uuid); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.get_exercise_detail_payload(p_exercise_id uuid) IS 'Returns one exercise (including image_url), its authenticated user logs, and related workouts for the exercise detail screen.';


--
-- Name: get_history_payload(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_history_payload(p_limit integer DEFAULT 50) RETURNS jsonb
    LANGUAGE sql STABLE
    SET search_path TO 'public'
    AS $$
WITH params AS (
  SELECT LEAST(GREATEST(COALESCE(p_limit, 50), 1), 100) AS row_limit
), preferred_language AS (
  SELECT COALESCE((SELECT language FROM profiles WHERE id = auth.uid()), 'es') AS value
), session_logs AS (
  SELECT pl.id, pl.workout_id, pl.completed_at, pl.duration_minutes, pl.mood_rating,
    pl.session_context_snapshot,
    CASE WHEN w.id IS NULL THEN NULL ELSE jsonb_build_object('name', w.name, 'focus', w.focus) END AS workout
  FROM progress_logs pl
  LEFT JOIN workouts w ON w.id = pl.workout_id AND w.user_id = auth.uid()
  WHERE pl.user_id = auth.uid()
  ORDER BY pl.completed_at DESC
  LIMIT (SELECT row_limit FROM params)
), exercise_rows AS (
  SELECT el.progress_log_id, el.exercise_id, el.weights_kg, el.reps_completed,
    CASE WHEN e.id IS NULL THEN NULL ELSE jsonb_build_object(
      'name', CASE WHEN (SELECT value FROM preferred_language) = 'es' THEN COALESCE(e.name_es, e.name) ELSE e.name END,
      'muscle_groups', CASE WHEN (SELECT value FROM preferred_language) = 'es' THEN COALESCE(e.muscle_groups_es, e.muscle_groups) ELSE e.muscle_groups END,
      'is_compound', e.is_compound
    ) END AS exercise,
    sl.completed_at AS progress_completed_at
  FROM exercise_logs el
  JOIN session_logs sl ON sl.id = el.progress_log_id
  LEFT JOIN exercises e ON e.id = el.exercise_id
)
SELECT jsonb_build_object(
  'session_logs', COALESCE((SELECT jsonb_agg(to_jsonb(sl) ORDER BY sl.completed_at DESC) FROM session_logs sl), '[]'::jsonb),
  'exercise_logs', COALESCE((SELECT jsonb_agg((to_jsonb(er) - 'progress_completed_at') ORDER BY er.progress_completed_at DESC) FROM exercise_rows er), '[]'::jsonb)
);
$$;


--
-- Name: FUNCTION get_history_payload(p_limit integer); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.get_history_payload(p_limit integer) IS 'Returns recent session history and related exercise logs for the authenticated user in one call.';


--
-- Name: get_plan_history_continuity_schema_version(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_plan_history_continuity_schema_version() RETURNS integer
    LANGUAGE sql STABLE
    SET search_path TO 'public'
    AS $$
  SELECT 39;
$$;


--
-- Name: get_requestable_trainer_services(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_requestable_trainer_services(trainer_slug text) RETURNS TABLE(service_id uuid, name text, description text, modality text, duration_minutes integer, content text)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'COACHING_AUTH_REQUIRED';
  END IF;

  RETURN QUERY
  SELECT service.id, service.name, service.description, service.modality, service.duration_minutes, service.content
  FROM public.trainer_service_offerings service
  JOIN public.trainer_profiles trainer_profile ON trainer_profile.id = service.trainer_profile_id
  WHERE trainer_profile.slug = get_requestable_trainer_services.trainer_slug
    AND trainer_profile.status = 'active'
    AND service.is_active = TRUE
  ORDER BY service.created_at ASC, service.id ASC;
END;
$$;


--
-- Name: grant_body_measurements_consent(uuid, text, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.grant_body_measurements_consent(p_relationship_id uuid, p_consent_version text, p_idempotency_key uuid) RETURNS TABLE(relationship_id uuid, changed boolean)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $_$
DECLARE
  v_client_user_id UUID := auth.uid();
  v_relationship public.coaching_relationships%ROWTYPE;
  v_consent public.coaching_consents%ROWTYPE;
  v_version TEXT := btrim($2);
BEGIN
  IF v_client_user_id IS NULL THEN RAISE EXCEPTION 'COACHING_AUTH_REQUIRED'; END IF;
  IF $1 IS NULL OR $3 IS NULL OR char_length(v_version) NOT BETWEEN 1 AND 160 THEN RAISE EXCEPTION 'COACHING_CONSENT_INVALID'; END IF;
  SELECT * INTO v_relationship FROM public.coaching_relationships relationship
  WHERE relationship.id = $1 AND relationship.client_user_id = v_client_user_id FOR UPDATE;
  IF NOT FOUND OR v_relationship.status <> 'active' THEN RAISE EXCEPTION 'COACHING_RELATIONSHIP_NOT_ACTIVE'; END IF;
  IF NOT public.is_account_active(v_client_user_id) OR NOT EXISTS (
    SELECT 1 FROM public.trainer_profiles trainer_profile
    JOIN public.profiles trainer_account ON trainer_account.id = trainer_profile.user_id
    WHERE trainer_profile.user_id = v_relationship.trainer_user_id
      AND trainer_profile.status = 'active' AND trainer_account.account_status = 'active'
  ) THEN RAISE EXCEPTION 'COACHING_RELATIONSHIP_NOT_ACTIVE'; END IF;
  SELECT * INTO v_consent FROM public.coaching_consents consent
  WHERE consent.relationship_id = v_relationship.id
    AND consent.scope = 'body_measurements'
    AND consent.revoked_at IS NULL
  FOR UPDATE;
  IF FOUND AND v_consent.revoked_at IS NULL THEN RETURN QUERY SELECT v_relationship.id, FALSE; RETURN; END IF;
  INSERT INTO public.coaching_consents (relationship_id, scope, text_version, granted_by)
  VALUES (v_relationship.id, 'body_measurements', v_version, v_client_user_id);
  INSERT INTO public.professional_audit_logs (actor_user_id, subject_user_id, entity_type, entity_id, action, metadata)
  VALUES (v_client_user_id, v_relationship.trainer_user_id, 'coaching_relationship', v_relationship.id,
    'body_measurements_consent_granted', jsonb_build_object('text_version', v_version, 'idempotency_key', $3));
  PERFORM public.create_product_notification(v_relationship.trainer_user_id, 'coaching_body_measurements_granted',
    'Consentimiento actualizado', 'La persona autorizó compartir sus medidas corporales.', '/coaching',
    'coaching-body-measurements-granted:' || v_relationship.id::TEXT,
    jsonb_build_object('relationship_id', v_relationship.id, 'scope', 'body_measurements'));
  RETURN QUERY SELECT v_relationship.id, TRUE;
END;
$_$;


--
-- Name: grant_training_profile_consent(uuid, text, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.grant_training_profile_consent(p_relationship_id uuid, p_consent_version text, p_idempotency_key uuid) RETURNS TABLE(relationship_id uuid, changed boolean)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_client_user_id UUID := auth.uid();
  v_trainer_user_id UUID;
  v_trainer_account public.profiles%ROWTYPE;
  v_trainer_profile public.trainer_profiles%ROWTYPE;
  v_client_account public.profiles%ROWTYPE;
  v_relationship public.coaching_relationships%ROWTYPE;
  v_consent public.coaching_consents%ROWTYPE;
BEGIN
  IF v_client_user_id IS NULL THEN
    RAISE EXCEPTION 'COACHING_AUTH_REQUIRED';
  END IF;
  IF p_relationship_id IS NULL
    OR p_idempotency_key IS NULL
    OR char_length(p_consent_version) NOT BETWEEN 1 AND 160
    OR p_consent_version IS DISTINCT FROM 'training-profile-v1'
  THEN
    RAISE EXCEPTION 'COACHING_CONSENT_INVALID';
  END IF;

  -- Match every client-owned relationship transition before reading account
  -- or relationship state. Administrative client suspension uses this same
  -- namespace before taking its account and relationship row locks.
  PERFORM pg_advisory_xact_lock(hashtextextended(v_client_user_id::TEXT, 0));

  -- This scoped pre-read supplies only the trainer advisory key. All authority
  -- is re-read under the canonical locks below before a state is disclosed.
  SELECT relationship.trainer_user_id
  INTO v_trainer_user_id
  FROM public.coaching_relationships relationship
  WHERE relationship.id = p_relationship_id
    AND relationship.client_user_id = v_client_user_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'COACHING_RELATIONSHIP_NOT_ACTIVE';
  END IF;

  -- Trainer suspension owns this namespace and then locks account, profile,
  -- and relationships in that order. Following it prevents the inverse
  -- relationship -> trainer-account cycle.
  PERFORM pg_advisory_xact_lock(hashtextextended(v_trainer_user_id::TEXT, 0));

  SELECT *
  INTO v_trainer_account
  FROM public.profiles trainer_account
  WHERE trainer_account.id = v_trainer_user_id
  FOR UPDATE;
  IF NOT FOUND OR v_trainer_account.account_status <> 'active' THEN
    RAISE EXCEPTION 'COACHING_RELATIONSHIP_NOT_ACTIVE';
  END IF;

  SELECT *
  INTO v_trainer_profile
  FROM public.trainer_profiles trainer_profile
  WHERE trainer_profile.user_id = v_trainer_user_id
  FOR UPDATE;
  IF NOT FOUND OR v_trainer_profile.status <> 'active' THEN
    RAISE EXCEPTION 'COACHING_RELATIONSHIP_NOT_ACTIVE';
  END IF;

  SELECT *
  INTO v_client_account
  FROM public.profiles client_account
  WHERE client_account.id = v_client_user_id
  FOR UPDATE;
  IF NOT FOUND OR v_client_account.account_status <> 'active' THEN
    RAISE EXCEPTION 'COACHING_RELATIONSHIP_NOT_ACTIVE';
  END IF;

  SELECT *
  INTO v_relationship
  FROM public.coaching_relationships relationship
  WHERE relationship.id = p_relationship_id
    AND relationship.client_user_id = v_client_user_id
    AND relationship.trainer_user_id = v_trainer_user_id
  FOR UPDATE;
  IF NOT FOUND OR v_relationship.status <> 'active' THEN
    RAISE EXCEPTION 'COACHING_RELATIONSHIP_NOT_ACTIVE';
  END IF;

  -- The relationship row serializes every grant attempt before inspecting the
  -- partial unique active-scope index. A revoked grant remains immutable; a
  -- recovery always creates a new versioned row.
  SELECT *
  INTO v_consent
  FROM public.coaching_consents consent
  WHERE consent.relationship_id = v_relationship.id
    AND consent.scope = 'training_profile'
    AND consent.revoked_at IS NULL
  FOR UPDATE;
  IF FOUND THEN
    RETURN QUERY SELECT v_relationship.id, FALSE;
    RETURN;
  END IF;

  INSERT INTO public.coaching_consents (
    relationship_id, scope, text_version, granted_by
  ) VALUES (
    v_relationship.id, 'training_profile', p_consent_version, v_client_user_id
  );

  -- Migration 045's AFTER INSERT trigger owns the single
  -- training_profile_consent_granted audit event.
  PERFORM public.create_product_notification(
    v_relationship.trainer_user_id,
    'coaching_training_profile_granted',
    'Autorización confirmada',
    'La persona autorizó consultar sus datos de entrenamiento.',
    '/coach/clients/' || v_client_user_id::TEXT,
    'coaching-training-profile-granted:' || v_relationship.id::TEXT,
    jsonb_build_object(
      'relationship_id', v_relationship.id,
      'client_user_id', v_client_user_id,
      'scope', 'training_profile'
    )
  );

  RETURN QUERY SELECT v_relationship.id, TRUE;
END;
$$;


--
-- Name: guard_locked_trainer_plan_mutation(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.guard_locked_trainer_plan_mutation() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public', 'pg_temp'
    AS $$
BEGIN
  IF OLD.prescription_locked
    AND NOT ((current_user = 'postgres' OR (auth.role() = 'service_role' AND session_user IN ('postgres', 'supabase_admin')))
      AND current_setting('app.trainer_prescription_mutation', TRUE) = 'authorized') THEN
    RAISE EXCEPTION 'TRAINER_PRESCRIPTION_LOCKED';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;


--
-- Name: guard_locked_trainer_workout_exercise_mutation(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.guard_locked_trainer_workout_exercise_mutation() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE v_workout_ids UUID[];
BEGIN
  v_workout_ids := CASE TG_OP
    WHEN 'INSERT' THEN ARRAY[NEW.workout_id]
    WHEN 'DELETE' THEN ARRAY[OLD.workout_id]
    ELSE ARRAY[OLD.workout_id, NEW.workout_id]
  END;
  IF EXISTS (
    SELECT 1 FROM public.workouts workout
    JOIN public.workout_plans plan ON plan.id = workout.plan_id
    WHERE workout.id = ANY(v_workout_ids) AND plan.prescription_locked
  ) AND NOT ((current_user = 'postgres' OR (auth.role() = 'service_role' AND session_user IN ('postgres', 'supabase_admin')))
    AND current_setting('app.trainer_prescription_mutation', TRUE) = 'authorized') THEN
    RAISE EXCEPTION 'TRAINER_PRESCRIPTION_LOCKED';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;


--
-- Name: guard_locked_trainer_workout_mutation(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.guard_locked_trainer_workout_mutation() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE v_plan_ids UUID[];
BEGIN
  v_plan_ids := CASE TG_OP
    WHEN 'INSERT' THEN ARRAY[NEW.plan_id]
    WHEN 'DELETE' THEN ARRAY[OLD.plan_id]
    ELSE ARRAY[OLD.plan_id, NEW.plan_id]
  END;
  IF EXISTS (SELECT 1 FROM public.workout_plans plan WHERE plan.id = ANY(v_plan_ids) AND plan.prescription_locked)
    AND NOT ((current_user = 'postgres' OR (auth.role() = 'service_role' AND session_user IN ('postgres', 'supabase_admin')))
      AND current_setting('app.trainer_prescription_mutation', TRUE) = 'authorized') THEN
    RAISE EXCEPTION 'TRAINER_PRESCRIPTION_LOCKED';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;


--
-- Name: guard_plan_lifecycle_mutation(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.guard_plan_lifecycle_mutation() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
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

  IF auth.uid() IS NULL
    OR auth.uid() IS DISTINCT FROM v_target_user_id
    OR v_trusted_actor IS DISTINCT FROM v_target_user_id::TEXT THEN
    RAISE EXCEPTION 'PLAN_DIRECT_LIFECYCLE_MUTATION_FORBIDDEN';
  END IF;

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;


--
-- Name: guard_profile_weight_derived(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.guard_profile_weight_derived() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
DECLARE
  v_sync_authorized BOOLEAN := FALSE;
  v_has_weighted_history BOOLEAN := FALSE;
BEGIN
  IF NEW.weight_kg IS NOT DISTINCT FROM OLD.weight_kg
     AND NEW.onboarding_done IS NOT DISTINCT FROM OLD.onboarding_done THEN
    RETURN NEW;
  END IF;

  DELETE FROM private.profile_weight_sync_context
   WHERE transaction_id = pg_catalog.txid_current()
     AND backend_pid = pg_catalog.pg_backend_pid()
     AND profile_id = NEW.id
   RETURNING TRUE INTO v_sync_authorized;

  IF v_sync_authorized THEN
    RETURN NEW;
  END IF;

  IF current_setting('role', true) IN ('service_role', 'supabase_admin')
     OR current_setting('request.jwt.claim.role', true) = 'service_role' THEN
    RETURN NEW;
  END IF;

  IF OLD.onboarding_done AND NOT NEW.onboarding_done THEN
    RAISE EXCEPTION 'onboarding state cannot be reverted'
      USING ERRCODE = 'P0001';
  END IF;

  IF NEW.weight_kg IS DISTINCT FROM OLD.weight_kg THEN
    SELECT EXISTS (
       SELECT 1
         FROM public.measurements AS m
        WHERE m.user_id = NEW.id
          AND m.weight_kg IS NOT NULL
    ) INTO v_has_weighted_history;

    IF OLD.onboarding_done OR v_has_weighted_history THEN
      RAISE EXCEPTION 'profile weight is derived from measurements'
        USING ERRCODE = 'P0001';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;


--
-- Name: guard_referenced_trainer_assignment_version_delete(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.guard_referenced_trainer_assignment_version_delete() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
BEGIN
  -- active_version_id is an immediate reference today; later session snapshots
  -- add further references without relaxing this immutable-history baseline.
  IF OLD.materialized_plan_id IS NOT NULL OR EXISTS (
    SELECT 1 FROM public.trainer_plan_assignments assignment
    WHERE assignment.active_version_id = OLD.id
  ) THEN
    RAISE EXCEPTION 'TRAINER_ASSIGNMENT_VERSION_REFERENCED';
  END IF;
  RETURN OLD;
END;
$$;


--
-- Name: guard_trainer_assignment_version_immutability(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.guard_trainer_assignment_version_immutability() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
BEGIN
  IF NEW.snapshot IS DISTINCT FROM OLD.snapshot THEN
    RAISE EXCEPTION 'TRAINER_ASSIGNMENT_SNAPSHOT_IMMUTABLE';
  END IF;
  IF NEW.assignment_id IS DISTINCT FROM OLD.assignment_id
    OR NEW.version_number IS DISTINCT FROM OLD.version_number THEN
    RAISE EXCEPTION 'TRAINER_ASSIGNMENT_VERSION_IDENTITY_IMMUTABLE';
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: handle_new_user(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.handle_new_user() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, avatar_url)
  VALUES (
    NEW.id,
    NEW.raw_user_meta_data->>'full_name',
    NEW.raw_user_meta_data->>'avatar_url'
  );
  RETURN NEW;
END;
$$;


--
-- Name: has_active_coaching_scope(uuid, uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.has_active_coaching_scope(p_trainer_id uuid, p_client_id uuid, p_scope text) RETURNS boolean
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
  SELECT COALESCE(
    auth.uid() IS NOT NULL
    AND auth.uid() = p_trainer_id
    AND EXISTS (
      SELECT 1
      FROM public.trainer_profiles trainer_profile
      JOIN public.profiles trainer_account
        ON trainer_account.id = trainer_profile.user_id
      JOIN public.profiles client_account
        ON client_account.id = p_client_id
      JOIN public.coaching_relationships relationship
        ON relationship.trainer_user_id = trainer_profile.user_id
      JOIN public.coaching_consents training_consent
        ON training_consent.relationship_id = relationship.id
      JOIN public.coaching_consents consent
        ON consent.relationship_id = relationship.id
      WHERE trainer_profile.user_id = p_trainer_id
        AND trainer_profile.status = 'active'
        AND trainer_account.account_status = 'active'
        AND client_account.account_status = 'active'
        AND relationship.client_user_id = p_client_id
        AND relationship.status = 'active'
        AND training_consent.scope = 'training_profile'
        AND training_consent.revoked_at IS NULL
        AND consent.scope = p_scope
        AND consent.revoked_at IS NULL
    ),
    FALSE
  );
$$;


--
-- Name: is_account_active(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_account_active(p_user_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'auth'
    AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    LEFT JOIN auth.users u ON u.id = p.id
    WHERE p.id = p_user_id
      AND (
        LOWER(u.email) = 'fejames07@gmail.com'
        OR p.account_status = 'active'
        OR (p.account_status = 'suspended' AND p.suspended_until <= NOW())
      )
  );
$$;


--
-- Name: is_professional_audit_event_allowed(text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_professional_audit_event_allowed(p_entity_type text, p_action text) RETURNS boolean
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
      'proposed', 'accepted', 'revision_published', 'assignment_frozen', 'declined'
    )
    ELSE FALSE
  END, FALSE)
$$;


--
-- Name: list_trainer_credential_cleanup(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.list_trainer_credential_cleanup() RETURNS TABLE(id uuid, storage_path text)
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
  SELECT cleanup.id, cleanup.storage_path
  FROM public.trainer_credential_storage_cleanup cleanup
  WHERE cleanup.user_id = auth.uid()
    AND auth.role() = 'authenticated'
  ORDER BY cleanup.created_at, cleanup.id
  LIMIT 20
$$;


--
-- Name: notify_trainer_application_admins(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.notify_trainer_application_admins(p_application_id uuid, p_event_id uuid) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_admin RECORD;
  v_count INTEGER := 0;
BEGIN
  IF p_event_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'Submission event unavailable.';
  END IF;

  FOR v_admin IN
    SELECT profile.id
    FROM public.profiles profile
    WHERE profile.is_admin = TRUE
      AND profile.account_status = 'active'
    ORDER BY profile.id
  LOOP
    PERFORM public.create_product_notification(
      v_admin.id,
      'trainer_application_status',
      'Nueva solicitud de entrenador',
      'Una solicitud de entrenador esta lista para revision.',
      '/admin/trainers/' || p_application_id::TEXT,
      'trainer-application:' || p_application_id::TEXT || ':submitted:' || p_event_id::TEXT,
      jsonb_build_object('applicationId', p_application_id, 'status', 'submitted')
    );
    v_count := v_count + 1;
  END LOOP;

  IF v_count = 0 THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'No active administrator available.';
  END IF;
  RETURN v_count;
END;
$$;


--
-- Name: prepare_trainer_credential_removal(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.prepare_trainer_credential_removal(p_application_id uuid, p_credential_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $_$
DECLARE
  v_user_id UUID := auth.uid();
  v_application public.trainer_applications%ROWTYPE;
  v_credential public.trainer_application_credentials%ROWTYPE;
  v_cleanup public.trainer_credential_storage_cleanup%ROWTYPE;
BEGIN
  IF v_user_id IS NULL OR auth.role() <> 'authenticated' THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Authentication required.';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('trainer-profile:' || v_user_id::TEXT, 0));

  SELECT application.* INTO v_application
  FROM public.trainer_applications application
  WHERE application.id = p_application_id
    AND application.user_id = v_user_id
  FOR UPDATE;
  IF NOT FOUND OR v_application.application_kind <> 'initial'
    OR v_application.status NOT IN ('draft', 'changes_requested')
    OR NOT public.is_account_active(v_user_id) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Application unavailable.';
  END IF;

  SELECT credential.* INTO v_credential
  FROM public.trainer_application_credentials credential
  WHERE credential.id = p_credential_id
    AND credential.application_id = p_application_id
  FOR UPDATE;
  IF NOT FOUND THEN RETURN NULL; END IF;

  IF v_credential.storage_path IS NULL THEN
    DELETE FROM public.trainer_application_credentials WHERE id = v_credential.id;
    RETURN jsonb_build_object('cleanup_id', NULL, 'storage_path', NULL);
  END IF;

  IF v_credential.storage_path !~ (
    '^' || v_user_id::TEXT || '/' || p_application_id::TEXT || '/' || p_credential_id::TEXT || '\.(pdf|jpg|png)$'
  ) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'Credential path invalid.';
  END IF;

  INSERT INTO public.trainer_credential_storage_cleanup (
    user_id, application_id, credential_id, storage_path, reason
  ) VALUES (
    v_user_id, p_application_id, p_credential_id, v_credential.storage_path, 'user_removal'
  )
  ON CONFLICT (storage_path) DO UPDATE SET
    reason = 'user_removal', updated_at = NOW()
  WHERE trainer_credential_storage_cleanup.user_id = EXCLUDED.user_id
    AND trainer_credential_storage_cleanup.credential_id = EXCLUDED.credential_id
  RETURNING * INTO v_cleanup;

  RETURN jsonb_build_object('cleanup_id', v_cleanup.id, 'storage_path', v_cleanup.storage_path);
END;
$_$;


--
-- Name: propose_trainer_assignment(uuid, uuid, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.propose_trainer_assignment(p_relationship_id uuid, p_template_id uuid, p_change_summary text, p_idempotency_key text) RETURNS TABLE(assignment_id uuid, assignment_version_id uuid, workout_plan_id uuid)
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
  IF EXISTS (
    SELECT 1 FROM public.trainer_plan_assignments assignment
    WHERE assignment.client_user_id = v_client_user_id AND assignment.status = 'proposed'
  ) THEN
    RAISE EXCEPTION 'TRAINER_ASSIGNMENT_PROPOSAL_EXISTS';
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


--
-- Name: provision_product_notification_preferences(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.provision_product_notification_preferences() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
BEGIN
  INSERT INTO public.product_notification_preferences (user_id)
  VALUES (NEW.id)
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$;


--
-- Name: publish_trainer_assignment_revision(uuid, uuid, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.publish_trainer_assignment_revision(p_assignment_id uuid, p_template_id uuid, p_change_summary text, p_idempotency_key text) RETURNS TABLE(assignment_id uuid, assignment_version_id uuid, workout_plan_id uuid)
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


--
-- Name: queue_trainer_credential_cleanup(uuid, uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.queue_trainer_credential_cleanup(p_application_id uuid, p_credential_id uuid, p_storage_path text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'storage', 'pg_temp'
    AS $_$
DECLARE
  v_user_id UUID := auth.uid();
  v_application public.trainer_applications%ROWTYPE;
  v_cleanup public.trainer_credential_storage_cleanup%ROWTYPE;
BEGIN
  IF v_user_id IS NULL OR auth.role() <> 'authenticated' THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Authentication required.';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('trainer-profile:' || v_user_id::TEXT, 0));

  SELECT application.* INTO v_application
  FROM public.trainer_applications application
  WHERE application.id = p_application_id
    AND application.user_id = v_user_id
  FOR UPDATE;

  IF NOT FOUND OR v_application.application_kind <> 'initial'
    OR v_application.status NOT IN ('draft', 'changes_requested')
    OR NOT public.is_account_active(v_user_id) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Application unavailable.';
  END IF;

  IF p_storage_path !~ (
    '^' || v_user_id::TEXT || '/' || p_application_id::TEXT || '/' || p_credential_id::TEXT || '\.(pdf|jpg|png)$'
  ) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'Storage path invalid.';
  END IF;

  INSERT INTO public.trainer_credential_storage_cleanup (
    user_id, application_id, credential_id, storage_path, reason
  ) VALUES (
    v_user_id, p_application_id, p_credential_id, p_storage_path, 'upload_rollback'
  )
  ON CONFLICT (storage_path) DO UPDATE SET
    updated_at = NOW()
  WHERE trainer_credential_storage_cleanup.user_id = EXCLUDED.user_id
    AND trainer_credential_storage_cleanup.application_id = EXCLUDED.application_id
    AND trainer_credential_storage_cleanup.credential_id = EXCLUDED.credential_id
  RETURNING * INTO v_cleanup;

  IF v_cleanup.id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Cleanup path already claimed.';
  END IF;

  RETURN jsonb_build_object('id', v_cleanup.id, 'storage_path', v_cleanup.storage_path);
END;
$_$;


--
-- Name: reactivate_and_reinstate_trainer(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.reactivate_and_reinstate_trainer(p_user_id uuid, p_admin_id uuid) RETURNS TABLE(account_reactivated boolean, profile_reinstated boolean)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_profile RECORD;
  v_trainer_profile RECORD;
  v_profile_reinstated BOOLEAN;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'ADMIN_REINSTATEMENT_SERVICE_REQUIRED';
  END IF;
  BEGIN
    PERFORM public.require_active_coaching_admin(p_admin_id);
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'ADMIN_REINSTATEMENT_UNAVAILABLE';
  END;

  -- Match suspension/activation serialization before taking the account and
  -- professional row locks in their established order.
  PERFORM pg_advisory_xact_lock(hashtextextended(p_user_id::TEXT, 0));

  SELECT account_status, suspension_reason, suspended_at, suspended_until, suspended_by
  INTO v_profile
  FROM public.profiles
  WHERE id = p_user_id
  FOR UPDATE;
  IF NOT FOUND OR v_profile.account_status <> 'suspended' THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'ADMIN_REINSTATEMENT_UNAVAILABLE';
  END IF;

  SELECT profile.id, profile.status, profile.source_application_id
  INTO v_trainer_profile
  FROM public.trainer_profiles profile
  JOIN public.trainer_applications application
    ON application.id = profile.source_application_id
   AND application.status = 'approved'
  WHERE profile.user_id = p_user_id
  FOR UPDATE OF profile, application;
  IF NOT FOUND OR v_trainer_profile.status <> 'suspended' THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'ADMIN_REINSTATEMENT_UNAVAILABLE';
  END IF;

  UPDATE public.profiles
  SET account_status = 'active',
      suspension_reason = NULL,
      suspended_at = NULL,
      suspended_until = NULL,
      suspended_by = NULL
  WHERE id = p_user_id;

  IF v_profile.account_status IS DISTINCT FROM 'active'
     OR v_profile.suspension_reason IS NOT NULL
     OR v_profile.suspended_at IS NOT NULL
     OR v_profile.suspended_until IS NOT NULL
     OR v_profile.suspended_by IS NOT NULL THEN
    INSERT INTO public.admin_audit_logs (admin_user_id, target_user_id, action, reason, metadata)
    VALUES (p_admin_id, p_user_id, 'account_reactivated', NULL, '{}'::JSONB);
  END IF;

  SELECT result.profile_reinstated
  INTO v_profile_reinstated
  FROM public.reinstate_trainer_profile(p_user_id, p_admin_id) result;
  IF v_profile_reinstated IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'ADMIN_REINSTATEMENT_UNAVAILABLE';
  END IF;

  RETURN QUERY SELECT TRUE, TRUE;
END;
$$;


--
-- Name: record_plan_generation_failure(text, text, text, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.record_plan_generation_failure(p_mode text, p_engine_version text, p_error_code text, p_metadata jsonb DEFAULT '{}'::jsonb) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
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


--
-- Name: record_plan_generation_success(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.record_plan_generation_success(p_plan_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
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


--
-- Name: record_trainer_credential_cleanup_failure(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.record_trainer_credential_cleanup_failure(p_cleanup_id uuid, p_error text) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
BEGIN
  IF auth.uid() IS NULL OR auth.role() <> 'authenticated' THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Authentication required.';
  END IF;
  UPDATE public.trainer_credential_storage_cleanup
  SET attempt_count = attempt_count + 1,
      last_error = left(COALESCE(p_error, 'Storage cleanup failed.'), 500)
  WHERE id = p_cleanup_id AND user_id = auth.uid();
  RETURN FOUND;
END;
$$;


--
-- Name: reinstate_trainer_profile(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.reinstate_trainer_profile(p_user_id uuid, p_admin_id uuid) RETURNS TABLE(profile_reinstated boolean)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_admin_user_id UUID;
  v_profile public.trainer_profiles%ROWTYPE;
BEGIN
  v_admin_user_id := public.require_active_coaching_admin(p_admin_id);
  IF p_user_id IS NULL OR NOT public.is_account_active(p_user_id) THEN
    RAISE EXCEPTION 'COACHING_ACCOUNT_NOT_ACTIVE';
  END IF;
  SELECT * INTO v_profile FROM public.trainer_profiles profile
  WHERE profile.user_id = p_user_id FOR UPDATE;
  IF NOT FOUND OR v_profile.status = 'active' THEN
    RETURN QUERY SELECT FALSE;
    RETURN;
  END IF;

  UPDATE public.trainer_profiles SET status = 'active' WHERE id = v_profile.id;
  INSERT INTO public.admin_audit_logs (admin_user_id, target_user_id, action, metadata)
  VALUES (v_admin_user_id, p_user_id, 'trainer_profile_reinstated',
    jsonb_build_object('trainer_profile_id', v_profile.id));
  INSERT INTO public.professional_audit_logs (actor_user_id, subject_user_id, entity_type, entity_id, action)
  VALUES (v_admin_user_id, p_user_id, 'trainer_profile', v_profile.id, 'reinstated');
  PERFORM public.create_product_notification(
    p_user_id, 'trainer_profile_reinstated', 'Perfil profesional restablecido',
    'Tu perfil profesional fue restablecido. Los acompañamientos pausados requieren confirmación del cliente.', '/coach',
    'trainer-profile-reinstated:' || p_user_id::TEXT,
    jsonb_build_object('trainer_profile_id', v_profile.id));
  RETURN QUERY SELECT TRUE;
END;
$$;


--
-- Name: reject_professional_audit_log_mutation(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.reject_professional_audit_log_mutation() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public', 'pg_temp'
    AS $$
BEGIN
  RAISE EXCEPTION USING
    ERRCODE = '55000',
    MESSAGE = 'PROFESSIONAL_AUDIT_APPEND_ONLY';
END;
$$;


--
-- Name: release_session_authorization(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.release_session_authorization(p_client_session_id uuid, p_workout_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_user_id UUID := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'SESSION_AUTHENTICATION_REQUIRED';
  END IF;

  IF p_client_session_id IS NULL OR p_workout_id IS NULL THEN
    RAISE EXCEPTION 'SESSION_AUTHORIZATION_INVALID_ID';
  END IF;

  -- Serialize with authorization and atomic save. If save consumes the lease
  -- first, the consumed_at predicate protects the completed session.
  PERFORM pg_advisory_xact_lock(hashtextextended(v_user_id::TEXT, 0));

  UPDATE public.session_authorizations
  SET released_at = COALESCE(released_at, NOW())
  WHERE client_session_id = p_client_session_id
    AND workout_id = p_workout_id
    AND user_id = v_user_id
    AND consumed_at IS NULL;
END;
$$;


--
-- Name: reorder_trainer_template_exercises(uuid, uuid[]); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.reorder_trainer_template_exercises(p_template_workout_id uuid, p_template_exercise_ids uuid[]) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_ids UUID[];
  v_expected UUID[];
  v_trainer_user_id UUID;
BEGIN
  SELECT template.trainer_user_id INTO v_trainer_user_id FROM public.trainer_template_workouts workout JOIN public.trainer_program_templates template ON template.id = workout.template_id WHERE workout.id = p_template_workout_id;
  IF auth.uid() IS NULL OR v_trainer_user_id IS NULL OR v_trainer_user_id <> auth.uid() THEN RAISE EXCEPTION 'TRAINER_TEMPLATE_OWNER_REQUIRED'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(v_trainer_user_id::TEXT, 0));
  PERFORM 1 FROM public.profiles profile WHERE profile.id = v_trainer_user_id AND profile.account_status = 'active' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'TRAINER_TEMPLATE_OWNER_REQUIRED'; END IF;
  PERFORM 1 FROM public.trainer_profiles profile WHERE profile.user_id = v_trainer_user_id AND profile.status = 'active' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'TRAINER_TEMPLATE_OWNER_REQUIRED'; END IF;
  IF p_template_exercise_ids IS NULL OR cardinality(p_template_exercise_ids) IS NULL OR cardinality(p_template_exercise_ids) = 0
    OR cardinality(p_template_exercise_ids) <> cardinality(ARRAY(SELECT DISTINCT item FROM unnest(p_template_exercise_ids) AS item)) THEN
    RAISE EXCEPTION 'TRAINER_TEMPLATE_REORDER_INVALID';
  END IF;
  PERFORM 1 FROM public.trainer_template_workouts WHERE id = p_template_workout_id FOR UPDATE;
  WITH locked_exercises AS (
    SELECT id FROM public.trainer_template_exercises WHERE template_workout_id = p_template_workout_id FOR UPDATE
  ) SELECT array_agg(id ORDER BY id) INTO v_expected FROM locked_exercises;
  SELECT array_agg(id ORDER BY id) INTO v_ids FROM unnest(p_template_exercise_ids) AS id;
  IF v_expected IS NULL OR v_expected IS DISTINCT FROM v_ids THEN RAISE EXCEPTION 'TRAINER_TEMPLATE_REORDER_INCOMPLETE'; END IF;
  SET CONSTRAINTS trainer_template_exercises_workout_order_unique DEFERRED;
  UPDATE public.trainer_template_exercises exercise
  SET order_index = array_position(p_template_exercise_ids, exercise.id)
  WHERE exercise.template_workout_id = p_template_workout_id;
  RETURN jsonb_build_object('template_workout_id', p_template_workout_id, 'changed', TRUE);
END;
$$;


--
-- Name: reorder_trainer_template_workouts(uuid, uuid[]); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.reorder_trainer_template_workouts(p_template_id uuid, p_workout_ids uuid[]) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_ids UUID[];
  v_expected UUID[];
  v_trainer_user_id UUID;
BEGIN
  SELECT trainer_user_id INTO v_trainer_user_id FROM public.trainer_program_templates WHERE id = p_template_id;
  IF auth.uid() IS NULL OR v_trainer_user_id IS NULL OR v_trainer_user_id <> auth.uid() THEN RAISE EXCEPTION 'TRAINER_TEMPLATE_OWNER_REQUIRED'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(v_trainer_user_id::TEXT, 0));
  PERFORM 1 FROM public.profiles profile WHERE profile.id = v_trainer_user_id AND profile.account_status = 'active' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'TRAINER_TEMPLATE_OWNER_REQUIRED'; END IF;
  PERFORM 1 FROM public.trainer_profiles profile WHERE profile.user_id = v_trainer_user_id AND profile.status = 'active' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'TRAINER_TEMPLATE_OWNER_REQUIRED'; END IF;
  IF p_workout_ids IS NULL OR cardinality(p_workout_ids) IS NULL OR cardinality(p_workout_ids) = 0
    OR cardinality(p_workout_ids) <> cardinality(ARRAY(SELECT DISTINCT item FROM unnest(p_workout_ids) AS item)) THEN
    RAISE EXCEPTION 'TRAINER_TEMPLATE_REORDER_INVALID';
  END IF;
  PERFORM 1 FROM public.trainer_program_templates WHERE id = p_template_id FOR UPDATE;
  WITH locked_workouts AS (
    SELECT id FROM public.trainer_template_workouts WHERE template_id = p_template_id FOR UPDATE
  ) SELECT array_agg(id ORDER BY id) INTO v_expected FROM locked_workouts;
  SELECT array_agg(id ORDER BY id) INTO v_ids FROM unnest(p_workout_ids) AS id;
  IF v_expected IS NULL OR v_expected IS DISTINCT FROM v_ids THEN RAISE EXCEPTION 'TRAINER_TEMPLATE_REORDER_INCOMPLETE'; END IF;
  SET CONSTRAINTS trainer_template_workouts_template_order_unique DEFERRED;
  UPDATE public.trainer_template_workouts workout
  SET order_in_plan = array_position(p_workout_ids, workout.id)
  WHERE workout.template_id = p_template_id;
  RETURN jsonb_build_object('template_id', p_template_id, 'changed', TRUE);
END;
$$;


--
-- Name: require_active_coaching_admin(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.require_active_coaching_admin(p_admin_id uuid) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_authenticated_user_id UUID := auth.uid();
  v_is_admin BOOLEAN;
BEGIN
  IF p_admin_id IS NULL THEN
    RAISE EXCEPTION 'COACHING_ADMIN_REQUIRED';
  END IF;
  IF COALESCE(auth.role(), '') <> 'service_role' THEN
    IF v_authenticated_user_id IS NULL THEN RAISE EXCEPTION 'COACHING_ADMIN_REQUIRED'; END IF;
    IF v_authenticated_user_id <> p_admin_id THEN RAISE EXCEPTION 'COACHING_ADMIN_ACTOR_MISMATCH'; END IF;
  END IF;

  SELECT profile.is_admin AND public.is_account_active(profile.id)
  INTO v_is_admin
  FROM public.profiles profile
  WHERE profile.id = p_admin_id;
  IF NOT COALESCE(v_is_admin, FALSE) THEN
    RAISE EXCEPTION 'COACHING_ADMIN_REQUIRED';
  END IF;
  RETURN p_admin_id;
END;
$$;


--
-- Name: require_active_coaching_trainer(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.require_active_coaching_trainer() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public', 'pg_temp'
    AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.trainer_profiles trainer_profile
    WHERE trainer_profile.user_id = NEW.trainer_user_id
      AND trainer_profile.status = 'active'
  ) THEN
    RAISE EXCEPTION 'COACHING_ACTIVE_TRAINER_PROFILE_REQUIRED';
  END IF;

  RETURN NEW;
END;
$$;


--
-- Name: require_active_trainer_service_profile(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.require_active_trainer_service_profile() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public', 'pg_temp'
    AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.trainer_profiles trainer_profile
    WHERE trainer_profile.id = NEW.trainer_profile_id
      AND trainer_profile.status = 'active'
  ) THEN
    RAISE EXCEPTION 'COACHING_ACTIVE_TRAINER_PROFILE_REQUIRED';
  END IF;

  RETURN NEW;
END;
$$;


--
-- Name: require_coaching_service_trainer_match(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.require_coaching_service_trainer_match() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public', 'pg_temp'
    AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.trainer_service_offerings service
    JOIN public.trainer_profiles trainer_profile ON trainer_profile.id = service.trainer_profile_id
    WHERE service.id = NEW.service_id
      AND trainer_profile.user_id = NEW.trainer_user_id
      AND trainer_profile.status = 'active'
  ) THEN
    RAISE EXCEPTION 'COACHING_SERVICE_TRAINER_MISMATCH';
  END IF;

  RETURN NEW;
END;
$$;


--
-- Name: require_no_active_coaching_relationship_for_pending_request(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.require_no_active_coaching_relationship_for_pending_request() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public', 'pg_temp'
    AS $$
BEGIN
  IF NEW.status = 'pending' AND EXISTS (
    SELECT 1
    FROM public.coaching_relationships relationship
    WHERE relationship.client_user_id = NEW.client_user_id
      AND relationship.status = 'active'
  ) THEN
    RAISE EXCEPTION 'COACHING_ACTIVE_RELATIONSHIP_EXISTS';
  END IF;

  RETURN NEW;
END;
$$;


--
-- Name: require_public_trainer_template_exercise(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.require_public_trainer_template_exercise() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.exercises exercise WHERE exercise.id = NEW.exercise_id AND exercise.is_public = TRUE) THEN
    RAISE EXCEPTION 'TRAINER_TEMPLATE_EXERCISE_NOT_PUBLIC';
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: require_trainer_assignment_relationship_match(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.require_trainer_assignment_relationship_match() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.coaching_relationships relationship
    WHERE relationship.id = NEW.relationship_id
      AND relationship.trainer_user_id = NEW.trainer_user_id
      AND relationship.client_user_id = NEW.client_user_id
  ) THEN
    RAISE EXCEPTION 'TRAINER_ASSIGNMENT_RELATIONSHIP_MISMATCH';
  END IF;
  IF NEW.source_template_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.trainer_program_templates template
    WHERE template.id = NEW.source_template_id
      AND template.trainer_user_id = NEW.trainer_user_id
  ) THEN
    RAISE EXCEPTION 'TRAINER_ASSIGNMENT_TEMPLATE_OWNER_MISMATCH';
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: resume_paused_coaching_relationship(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.resume_paused_coaching_relationship(p_relationship_id uuid, p_idempotency_key uuid) RETURNS TABLE(relationship_id uuid, changed boolean)
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

  SELECT * INTO v_frozen_assignment FROM public.trainer_plan_assignments assignment
  WHERE assignment.relationship_id = v_relationship.id AND assignment.status = 'frozen'
  ORDER BY assignment.created_at DESC, assignment.id DESC LIMIT 1 FOR UPDATE;
  IF FOUND THEN
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
    IF NOT FOUND THEN RAISE EXCEPTION 'TRAINER_ASSIGNMENT_PLAN_INVALID'; END IF;
  END IF;

  UPDATE public.coaching_relationships SET status = 'active', paused_at = NULL WHERE id = v_relationship.id;
  IF v_frozen_assignment.id IS NOT NULL THEN
    PERFORM set_config('app.plan_lifecycle_actor', v_client_user_id::TEXT, TRUE);
    PERFORM set_config('app.trainer_prescription_mutation', 'authorized', TRUE);
    UPDATE public.workout_plans SET is_active = FALSE WHERE user_id = v_client_user_id AND is_active = TRUE;
    UPDATE public.workout_plans SET is_active = TRUE WHERE id = v_frozen_plan.id;
    UPDATE public.trainer_assignment_versions SET status = 'active', effective_from = NOW() WHERE id = v_frozen_version.id;
    UPDATE public.trainer_plan_assignments SET status = 'active', updated_at = NOW() WHERE id = v_frozen_assignment.id;
  END IF;
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


--
-- Name: retire_plan_family(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.retire_plan_family(p_plan_id uuid) RETURNS uuid
    LANGUAGE plpgsql
    SET search_path TO 'public'
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


--
-- Name: revoke_body_measurements_consent(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.revoke_body_measurements_consent(p_relationship_id uuid, p_idempotency_key uuid) RETURNS TABLE(relationship_id uuid, changed boolean)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $_$
DECLARE
  v_client_user_id UUID := auth.uid();
  v_relationship public.coaching_relationships%ROWTYPE;
  v_consent public.coaching_consents%ROWTYPE;
BEGIN
  IF v_client_user_id IS NULL THEN RAISE EXCEPTION 'COACHING_AUTH_REQUIRED'; END IF;
  IF $1 IS NULL OR $2 IS NULL THEN RAISE EXCEPTION 'COACHING_CONSENT_INVALID'; END IF;
  SELECT * INTO v_relationship FROM public.coaching_relationships relationship
  WHERE relationship.id = $1 AND relationship.client_user_id = v_client_user_id FOR UPDATE;
  IF NOT FOUND OR v_relationship.status <> 'active' THEN RAISE EXCEPTION 'COACHING_RELATIONSHIP_NOT_ACTIVE'; END IF;
  SELECT * INTO v_consent FROM public.coaching_consents consent
  WHERE consent.relationship_id = v_relationship.id
    AND consent.scope = 'body_measurements'
    AND consent.revoked_at IS NULL
  FOR UPDATE;
  IF NOT FOUND OR v_consent.revoked_at IS NOT NULL THEN RETURN QUERY SELECT v_relationship.id, FALSE; RETURN; END IF;
  UPDATE public.coaching_consents SET revoked_at = NOW(), revoked_by = v_client_user_id WHERE id = v_consent.id;
  INSERT INTO public.professional_audit_logs (actor_user_id, subject_user_id, entity_type, entity_id, action, metadata)
  VALUES (v_client_user_id, v_relationship.trainer_user_id, 'coaching_relationship', v_relationship.id,
    'body_measurements_consent_revoked', jsonb_build_object('idempotency_key', $2));
  PERFORM public.create_product_notification(v_relationship.trainer_user_id, 'coaching_body_measurements_revoked',
    'Consentimiento actualizado', 'La persona dejó de compartir sus medidas corporales.', '/coaching',
    'coaching-body-measurements-revoked:' || v_relationship.id::TEXT,
    jsonb_build_object('relationship_id', v_relationship.id, 'scope', 'body_measurements'));
  RETURN QUERY SELECT v_relationship.id, TRUE;
END;
$_$;


--
-- Name: revoke_training_profile_consent(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.revoke_training_profile_consent(p_relationship_id uuid, p_idempotency_key uuid) RETURNS TABLE(relationship_id uuid, changed boolean)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $_$
DECLARE
  v_client_user_id UUID := auth.uid();
  v_relationship public.coaching_relationships%ROWTYPE;
BEGIN
  IF v_client_user_id IS NULL THEN RAISE EXCEPTION 'COACHING_AUTH_REQUIRED'; END IF;
  IF $1 IS NULL OR $2 IS NULL THEN RAISE EXCEPTION 'COACHING_CONSENT_INVALID'; END IF;
  SELECT * INTO v_relationship FROM public.coaching_relationships relationship
  WHERE relationship.id = $1 AND relationship.client_user_id = v_client_user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'COACHING_RELATIONSHIP_NOT_ACTIVE'; END IF;
  IF v_relationship.status = 'ended' THEN RETURN QUERY SELECT v_relationship.id, FALSE; RETURN; END IF;
  IF v_relationship.status <> 'active' THEN RAISE EXCEPTION 'COACHING_RELATIONSHIP_NOT_ACTIVE'; END IF;
  UPDATE public.coaching_consents consent SET revoked_at = NOW(), revoked_by = v_client_user_id
  WHERE consent.relationship_id = v_relationship.id AND consent.revoked_at IS NULL;
  UPDATE public.coaching_relationships SET status = 'ended', ended_at = NOW(), ended_by = v_client_user_id,
    end_reason = 'Consentimiento de datos de entrenamiento revocado' WHERE id = v_relationship.id;
  INSERT INTO public.professional_audit_logs (actor_user_id, subject_user_id, entity_type, entity_id, action, metadata)
  VALUES (v_client_user_id, v_relationship.trainer_user_id, 'coaching_relationship', v_relationship.id,
    'training_profile_consent_revoked', jsonb_build_object('idempotency_key', $2));
  PERFORM public.create_product_notification(v_relationship.trainer_user_id, 'coaching_training_profile_revoked',
    'Acompañamiento finalizado', 'La persona revocó los datos de entrenamiento y finalizó el acompañamiento.', '/coaching',
    'coaching-training-profile-revoked:' || v_relationship.id::TEXT, jsonb_build_object('relationship_id', v_relationship.id));
  RETURN QUERY SELECT v_relationship.id, TRUE;
END;
$_$;


--
-- Name: sanitize_professional_audit_log_insert(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sanitize_professional_audit_log_insert() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
BEGIN
  IF NOT public.is_professional_audit_event_allowed(NEW.entity_type, NEW.action) THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'PROFESSIONAL_AUDIT_EVENT_INVALID';
  END IF;
  NEW.metadata := public.sanitize_professional_audit_metadata(
    NEW.entity_type,
    NEW.action,
    NEW.metadata
  );
  RETURN NEW;
END;
$$;


--
-- Name: sanitize_professional_audit_metadata(text, text, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sanitize_professional_audit_metadata(p_entity_type text, p_action text, p_metadata jsonb) RETURNS jsonb
    LANGUAGE plpgsql IMMUTABLE
    SET search_path TO 'public', 'pg_temp'
    AS $_$
DECLARE
  v_safe JSONB := '{}'::JSONB;
  v_key TEXT;
  v_normalized_key TEXT;
  v_canonical_key TEXT;
  v_value JSONB;
  v_text TEXT;
  v_allowed_keys TEXT[] := '{}'::TEXT[];
  v_filtered JSONB;
  v_expected_to_status TEXT;
BEGIN
  IF jsonb_typeof(COALESCE(p_metadata, '{}'::JSONB)) <> 'object' THEN
    RETURN '{}'::JSONB;
  END IF;

  FOR v_key, v_value IN SELECT key, value FROM jsonb_each(p_metadata)
  LOOP
    v_normalized_key := lower(v_key);

    -- These names remain explicit so future changes cannot accidentally turn
    -- them into allowlisted aliases (matching is case-insensitive).
    IF v_normalized_key = ANY (ARRAY[
      'reason', 'free_reason', 'change_summary', 'email', 'contact_email',
      'phone', 'contact_phone', 'credential', 'credential_url', 'storage',
      'storage_url', 'storage_path', 'notes', 'public_note', 'internal_note',
      'measurement', 'measurements', 'body_data', 'payload', 'snapshot',
      'raw_error', 'error_payload', 'last_error'
    ]) THEN
      CONTINUE;
    END IF;

    v_text := CASE WHEN jsonb_typeof(v_value) = 'string' THEN v_value #>> '{}' ELSE NULL END;
    v_canonical_key := CASE v_normalized_key
      WHEN 'applicationid' THEN 'applicationId'
      WHEN 'interviewid' THEN 'interviewId'
      WHEN 'fromstatus' THEN 'fromStatus'
      WHEN 'tostatus' THEN 'toStatus'
      ELSE v_normalized_key
    END;

    IF v_normalized_key = ANY (ARRAY[
      'applicationid', 'interviewid', 'event_id', 'service_id',
      'relationship_id', 'accepted_request_id', 'trainer_user_id',
      'client_user_id', 'trainer_profile_id', 'idempotency_key'
    ]) THEN
      IF v_text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' THEN
        v_safe := v_safe || jsonb_build_object(v_canonical_key, v_text);
      END IF;
    ELSIF v_normalized_key = 'cancelled_request_ids' THEN
      IF jsonb_typeof(v_value) = 'array'
        AND jsonb_array_length(v_value) <= 1000
        AND NOT EXISTS (
          SELECT 1
          FROM jsonb_array_elements_text(v_value) item(value)
          WHERE item.value !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        )
      THEN
        v_safe := v_safe || jsonb_build_object(v_canonical_key, v_value);
      END IF;
    ELSIF v_normalized_key = 'status' THEN
      IF v_text IN ('completed', 'cancelled') THEN
        v_safe := v_safe || jsonb_build_object(v_canonical_key, v_text);
      END IF;
    ELSIF v_normalized_key IN ('fromstatus', 'tostatus') THEN
      IF v_text IN (
        'draft', 'submitted', 'under_review', 'changes_requested',
        'interview_required', 'approved', 'rejected', 'withdrawn'
      ) THEN
        v_safe := v_safe || jsonb_build_object(v_canonical_key, v_text);
      END IF;
    ELSIF v_normalized_key = 'consent_version' THEN
      IF v_text = 'training-profile-v1' THEN
        v_safe := v_safe || jsonb_build_object(v_canonical_key, v_text);
      END IF;
    ELSIF v_normalized_key = 'text_version' THEN
      IF v_text IN ('training-profile-v1', 'body-measurements-v1') THEN
        v_safe := v_safe || jsonb_build_object(v_canonical_key, v_text);
      END IF;
    ELSIF v_normalized_key = 'scope' THEN
      IF v_text IN ('training_profile', 'body_measurements') THEN
        v_safe := v_safe || jsonb_build_object(v_canonical_key, v_text);
      END IF;
    ELSIF v_normalized_key = 'version_number' THEN
      IF jsonb_typeof(v_value) = 'number'
        AND (v_value #>> '{}') ~ '^[0-9]+$'
        AND (v_value #>> '{}')::NUMERIC BETWEEN 1 AND 100000
      THEN
        v_safe := v_safe || jsonb_build_object(v_canonical_key, v_value);
      END IF;
    ELSIF v_normalized_key = 'trainer_profile_suspended'
      AND jsonb_typeof(v_value) = 'boolean'
    THEN
      v_safe := v_safe || jsonb_build_object(v_canonical_key, v_value);
    END IF;
  END LOOP;

  IF p_entity_type = 'trainer_application' THEN
    v_expected_to_status := CASE p_action
      WHEN 'application_submitted' THEN 'submitted'
      WHEN 'application_withdrawn' THEN 'withdrawn'
      WHEN 'trainer_application_under_review' THEN 'under_review'
      WHEN 'trainer_application_changes_requested' THEN 'changes_requested'
      WHEN 'trainer_application_interview_required' THEN 'interview_required'
      WHEN 'trainer_application_approved' THEN 'approved'
      WHEN 'trainer_application_rejected' THEN 'rejected'
      ELSE NULL
    END;
    IF v_expected_to_status IS NOT NULL
      AND v_safe ->> 'toStatus' IS DISTINCT FROM v_expected_to_status
    THEN
      v_safe := v_safe - 'toStatus';
    END IF;
  END IF;

  IF p_entity_type = 'coaching_relationship'
    AND p_action = 'training_profile_consent_granted'
    AND (
      v_safe ->> 'text_version' IS DISTINCT FROM 'training-profile-v1'
      OR v_safe ->> 'scope' IS DISTINCT FROM 'training_profile'
    )
  THEN
    v_safe := v_safe - 'text_version' - 'scope';
  ELSIF p_entity_type = 'coaching_relationship'
    AND p_action = 'body_measurements_consent_granted'
    AND v_safe ->> 'text_version' IS DISTINCT FROM 'body-measurements-v1'
  THEN
    v_safe := v_safe - 'text_version';
  END IF;

  IF p_entity_type = 'trainer_application'
    AND p_action IN ('application_submitted', 'application_withdrawn')
  THEN
    v_allowed_keys := ARRAY['event_id', 'fromStatus', 'toStatus'];
  ELSIF p_entity_type = 'trainer_application'
    AND p_action IN (
      'trainer_application_under_review', 'trainer_application_changes_requested',
      'trainer_application_interview_required', 'trainer_application_approved',
      'trainer_application_rejected'
    )
  THEN
    v_allowed_keys := ARRAY['fromStatus', 'toStatus'];
  ELSIF p_entity_type = 'trainer_application'
    AND p_action = 'trainer_interview_scheduled'
  THEN
    v_allowed_keys := ARRAY['interviewId'];
  ELSIF p_entity_type = 'trainer_interview'
    AND p_action = 'trainer_interview_outcome_recorded'
  THEN
    v_allowed_keys := ARRAY['applicationId', 'status'];
  ELSIF p_entity_type = 'coaching_request' AND p_action = 'created' THEN
    v_allowed_keys := ARRAY['service_id', 'consent_version', 'idempotency_key'];
  ELSIF p_entity_type = 'coaching_request'
    AND p_action IN ('cancelled', 'declined')
  THEN
    v_allowed_keys := ARRAY['service_id'];
  ELSIF p_entity_type = 'coaching_request' AND p_action = 'accepted' THEN
    v_allowed_keys := ARRAY['relationship_id', 'service_id', 'cancelled_request_ids'];
  ELSIF p_entity_type = 'coaching_request'
    AND p_action = 'cancelled_after_acceptance'
  THEN
    v_allowed_keys := ARRAY['accepted_request_id', 'service_id'];
  ELSIF p_entity_type = 'coaching_relationship'
    AND p_action = 'relationship_created'
  THEN
    v_allowed_keys := ARRAY['service_id'];
  ELSIF p_entity_type = 'coaching_relationship'
    AND p_action = 'training_profile_consent_granted'
  THEN
    v_allowed_keys := ARRAY['text_version', 'scope'];
  ELSIF p_entity_type = 'coaching_relationship'
    AND p_action = 'body_measurements_consent_granted'
  THEN
    v_allowed_keys := ARRAY['text_version', 'idempotency_key'];
  ELSIF p_entity_type = 'coaching_relationship'
    AND p_action IN (
      'body_measurements_consent_revoked', 'training_profile_consent_revoked',
      'ended', 'resumed'
    )
  THEN
    v_allowed_keys := ARRAY['idempotency_key'];
  ELSIF p_entity_type = 'coaching_relationship'
    AND p_action = 'paused_due_to_account_suspension'
  THEN
    v_allowed_keys := ARRAY['trainer_user_id', 'client_user_id'];
  ELSIF p_entity_type = 'trainer_account' AND p_action = 'suspended' THEN
    v_allowed_keys := ARRAY['trainer_profile_suspended'];
  ELSIF p_entity_type = 'trainer_profile'
    AND p_action IN ('profile_created', 'profile_updated')
  THEN
    v_allowed_keys := ARRAY['applicationId'];
  ELSIF p_entity_type = 'trainer_plan_assignment'
    AND p_action IN ('proposed', 'accepted')
  THEN
    v_allowed_keys := ARRAY['relationship_id', 'version_number'];
  ELSIF p_entity_type = 'trainer_plan_assignment'
    AND p_action = 'revision_published'
  THEN
    v_allowed_keys := ARRAY['version_number'];
  ELSIF p_entity_type = 'trainer_plan_assignment'
    AND p_action = 'assignment_frozen'
  THEN
    v_allowed_keys := ARRAY['relationship_id'];
  END IF;

  SELECT COALESCE(jsonb_object_agg(entry.key, entry.value), '{}'::JSONB)
  INTO v_filtered
  FROM jsonb_each(v_safe) entry
  WHERE entry.key = ANY(v_allowed_keys);

  RETURN v_filtered;
END;
$_$;


--
-- Name: save_session_log_atomic(uuid, uuid, timestamp with time zone, integer, integer, jsonb, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.save_session_log_atomic(p_client_session_id uuid, p_workout_id uuid, p_completed_at timestamp with time zone, p_duration_minutes integer, p_mood_rating integer, p_exercise_logs jsonb, p_result_snapshot jsonb) RETURNS TABLE(progress_log_id uuid, inserted boolean, result_snapshot jsonb)
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_progress_log_id UUID;
  v_inserted BOOLEAN := FALSE;
  v_result_snapshot JSONB;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  INSERT INTO public.progress_logs (
    user_id,
    workout_id,
    client_session_id,
    session_result_snapshot,
    completed_at,
    duration_minutes,
    mood_rating
  ) VALUES (
    v_user_id,
    p_workout_id,
    p_client_session_id,
    p_result_snapshot,
    p_completed_at,
    p_duration_minutes,
    p_mood_rating
  )
  ON CONFLICT (user_id, client_session_id)
    WHERE client_session_id IS NOT NULL
    DO NOTHING
  RETURNING id, session_result_snapshot
    INTO v_progress_log_id, v_result_snapshot;

  v_inserted := FOUND;

  IF NOT v_inserted THEN
    SELECT id, session_result_snapshot
      INTO v_progress_log_id, v_result_snapshot
      FROM public.progress_logs
     WHERE user_id = v_user_id
       AND client_session_id = p_client_session_id;
  END IF;

  IF v_inserted THEN
    INSERT INTO public.exercise_logs (
      progress_log_id,
      exercise_id,
      sets_completed,
      reps_completed,
      weights_kg,
      rpe_values,
      duration_seconds,
      notes
    )
    SELECT
      v_progress_log_id,
      item.exercise_id,
      item.sets_completed,
      item.reps_completed,
      item.weights_kg,
      item.rpe_values,
      item.duration_seconds,
      item.notes
    FROM jsonb_to_recordset(COALESCE(p_exercise_logs, '[]'::JSONB)) AS item(
      exercise_id UUID,
      sets_completed INTEGER,
      reps_completed INTEGER[],
      weights_kg NUMERIC[],
      rpe_values NUMERIC[],
      duration_seconds INTEGER,
      notes TEXT
    );
  END IF;

  RETURN QUERY SELECT v_progress_log_id, v_inserted, v_result_snapshot;
END;
$$;


--
-- Name: save_session_log_atomic_v2(uuid, uuid, timestamp with time zone, integer, integer, jsonb, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.save_session_log_atomic_v2(p_client_session_id uuid, p_workout_id uuid, p_completed_at timestamp with time zone, p_duration_minutes integer, p_mood_rating integer, p_exercise_logs jsonb, p_result_snapshot jsonb) RETURNS TABLE(progress_log_id uuid, inserted boolean, result_snapshot jsonb)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_save_at TIMESTAMPTZ := NOW();
  v_authorization public.session_authorizations%ROWTYPE;
  v_progress_log_id UUID;
  v_progress_workout_id UUID;
  v_inserted BOOLEAN := FALSE;
  v_result_snapshot JSONB;
  v_executed_exercises JSONB;
  v_session_context_snapshot JSONB;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'SESSION_AUTHENTICATION_REQUIRED';
  END IF;

  IF p_client_session_id IS NULL OR p_workout_id IS NULL THEN
    RAISE EXCEPTION 'SESSION_AUTHORIZATION_INVALID_ID';
  END IF;

  -- Keep the lock order aligned with authorize_session_start and plan lifecycle
  -- RPCs: per-user advisory lock first, authorization row lock second.
  PERFORM pg_advisory_xact_lock(hashtextextended(v_user_id::TEXT, 0));

  SELECT * INTO v_authorization
  FROM public.session_authorizations
  WHERE client_session_id = p_client_session_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'SESSION_AUTHORIZATION_REQUIRED';
  END IF;

  IF v_authorization.user_id IS DISTINCT FROM v_user_id
    OR v_authorization.workout_id IS DISTINCT FROM p_workout_id THEN
    RAISE EXCEPTION 'SESSION_AUTHORIZATION_MISMATCH';
  END IF;

  IF v_authorization.released_at IS NOT NULL THEN
    RAISE EXCEPTION 'SESSION_AUTHORIZATION_EXPIRED';
  END IF;

  IF v_authorization.consumed_at IS NOT NULL THEN
    SELECT id, workout_id, session_result_snapshot
    INTO v_progress_log_id, v_progress_workout_id, v_result_snapshot
    FROM public.progress_logs
    WHERE user_id = v_user_id
      AND client_session_id = p_client_session_id;

    IF NOT FOUND OR v_progress_workout_id IS DISTINCT FROM p_workout_id THEN
      RAISE EXCEPTION 'SESSION_AUTHORIZATION_CONSUMED';
    END IF;

    RETURN QUERY SELECT v_progress_log_id, FALSE, v_result_snapshot;
    RETURN;
  END IF;

  -- Keep the workout/plan metadata captured at authorization time, but replace
  -- its planned list with the exact exercise evidence rows being persisted
  -- (completed or explicitly skipped). Planned/replacement exercises reuse
  -- captured metadata when available; ad-hoc exercises are resolved from the
  -- immutable exercise id at save time.
  SELECT COALESCE(
    jsonb_agg(actual.exercise_context ORDER BY actual.ordinality),
    '[]'::JSONB
  )
  INTO v_executed_exercises
  FROM (
    SELECT
      item.ordinality,
      COALESCE(
        captured.exercise_context,
        jsonb_build_object(
          'exerciseId', exercise.id,
          'name', exercise.name,
          'nameEs', exercise.name_es,
          'muscleGroups', COALESCE(exercise.muscle_groups, ARRAY[]::TEXT[]),
          'muscleGroupsEs', COALESCE(exercise.muscle_groups_es, ARRAY[]::TEXT[]),
          'isCompound', COALESCE(exercise.is_compound, FALSE)
        )
      ) AS exercise_context
    FROM ROWS FROM (
      jsonb_to_recordset(COALESCE(p_exercise_logs, '[]'::JSONB)) AS (
        exercise_id UUID,
        sets_completed INTEGER,
        reps_completed INTEGER[],
        weights_kg NUMERIC[],
        rpe_values NUMERIC[],
        duration_seconds INTEGER,
        notes TEXT
      )
    ) WITH ORDINALITY AS item(
      exercise_id,
      sets_completed,
      reps_completed,
      weights_kg,
      rpe_values,
      duration_seconds,
      notes,
      ordinality
    )
    JOIN public.exercises AS exercise ON exercise.id = item.exercise_id
    LEFT JOIN LATERAL (
      SELECT captured_item.value AS exercise_context
      FROM jsonb_array_elements(
        COALESCE(v_authorization.session_context_snapshot->'exercises', '[]'::JSONB)
      ) AS captured_item(value)
      WHERE captured_item.value->>'exerciseId' = item.exercise_id::TEXT
      LIMIT 1
    ) AS captured ON TRUE
  ) AS actual;

  v_session_context_snapshot := jsonb_set(
    v_authorization.session_context_snapshot,
    '{exercises}',
    v_executed_exercises,
    TRUE
  );

  -- Recover a save that committed through a legacy client before this v2 call
  -- acquired the per-user lock. Exact owner/workout binding is mandatory.
  SELECT id, workout_id, session_result_snapshot
  INTO v_progress_log_id, v_progress_workout_id, v_result_snapshot
  FROM public.progress_logs
  WHERE user_id = v_user_id
    AND client_session_id = p_client_session_id;

  IF FOUND THEN
    IF v_progress_workout_id IS DISTINCT FROM p_workout_id THEN
      RAISE EXCEPTION 'SESSION_IDEMPOTENCY_MISMATCH';
    END IF;

    UPDATE public.progress_logs
    SET session_context_snapshot = COALESCE(
      session_context_snapshot,
      v_session_context_snapshot
    )
    WHERE id = v_progress_log_id
      AND user_id = v_user_id;

    UPDATE public.session_authorizations
    SET consumed_at = COALESCE(consumed_at, NOW())
    WHERE client_session_id = p_client_session_id
      AND user_id = v_user_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'SESSION_AUTHORIZATION_CONSUME_FAILED';
    END IF;

    RETURN QUERY SELECT v_progress_log_id, FALSE, v_result_snapshot;
    RETURN;
  END IF;

  IF v_authorization.expires_at <= v_save_at THEN
    RAISE EXCEPTION 'SESSION_AUTHORIZATION_EXPIRED';
  END IF;

  -- Client completion time is retained as historical evidence, never as the
  -- source of the daily slot. Fifteen minutes of pre-authorization clock skew
  -- and five minutes of future skew are accepted; the 12-hour lease remains
  -- the hard upper boundary for valid offline completion.
  IF p_completed_at IS NULL
    OR p_completed_at < v_authorization.created_at - INTERVAL '15 minutes'
    OR p_completed_at > LEAST(
      v_authorization.expires_at,
      v_save_at + INTERVAL '5 minutes'
    ) THEN
    RAISE EXCEPTION 'SESSION_COMPLETED_AT_INVALID';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.progress_logs
    WHERE user_id = v_user_id
      AND workout_id = p_workout_id
      AND client_session_id IS DISTINCT FROM p_client_session_id
      AND completed_at >= v_authorization.workout_window_start
      AND completed_at < v_authorization.policy_day_end
  ) THEN
    RAISE EXCEPTION 'SESSION_WORKOUT_ALREADY_COMPLETED';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.progress_logs
    WHERE user_id = v_user_id
      AND client_session_id IS DISTINCT FROM p_client_session_id
      AND completed_at >= v_authorization.policy_day_start
      AND completed_at < v_authorization.policy_day_end
  ) THEN
    RAISE EXCEPTION 'SESSION_DAILY_LIMIT_REACHED';
  END IF;

  -- Consumed claims are authoritative daily evidence even when a legacy client
  -- supplied a completion timestamp outside the frozen calendar day.
  IF EXISTS (
    SELECT 1
    FROM public.session_authorizations
    WHERE user_id = v_user_id
      AND policy_date = v_authorization.policy_date
      AND client_session_id IS DISTINCT FROM p_client_session_id
      AND consumed_at IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'SESSION_DAILY_LIMIT_REACHED';
  END IF;

  INSERT INTO public.progress_logs (
    user_id,
    workout_id,
    client_session_id,
    session_result_snapshot,
    session_context_snapshot,
    completed_at,
    duration_minutes,
    mood_rating
  ) VALUES (
    v_user_id,
    p_workout_id,
    p_client_session_id,
    p_result_snapshot,
    v_session_context_snapshot,
    p_completed_at,
    p_duration_minutes,
    p_mood_rating
  )
  ON CONFLICT (user_id, client_session_id)
    WHERE client_session_id IS NOT NULL
    DO NOTHING
  RETURNING id, session_result_snapshot
  INTO v_progress_log_id, v_result_snapshot;

  v_inserted := FOUND;

  IF NOT v_inserted THEN
    SELECT id, workout_id, session_result_snapshot
    INTO v_progress_log_id, v_progress_workout_id, v_result_snapshot
    FROM public.progress_logs
    WHERE user_id = v_user_id
      AND client_session_id = p_client_session_id;

    IF NOT FOUND OR v_progress_workout_id IS DISTINCT FROM p_workout_id THEN
      RAISE EXCEPTION 'SESSION_IDEMPOTENCY_MISMATCH';
    END IF;

    UPDATE public.progress_logs
    SET session_context_snapshot = COALESCE(
      session_context_snapshot,
      v_session_context_snapshot
    )
    WHERE id = v_progress_log_id
      AND user_id = v_user_id;

    UPDATE public.session_authorizations
    SET consumed_at = COALESCE(consumed_at, NOW())
    WHERE client_session_id = p_client_session_id
      AND user_id = v_user_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'SESSION_AUTHORIZATION_CONSUME_FAILED';
    END IF;
  END IF;

  IF v_inserted THEN
    INSERT INTO public.exercise_logs (
      progress_log_id,
      exercise_id,
      sets_completed,
      reps_completed,
      weights_kg,
      rpe_values,
      duration_seconds,
      notes
    )
    SELECT
      v_progress_log_id,
      item.exercise_id,
      item.sets_completed,
      item.reps_completed,
      item.weights_kg,
      item.rpe_values,
      item.duration_seconds,
      item.notes
    FROM jsonb_to_recordset(COALESCE(p_exercise_logs, '[]'::JSONB)) AS item(
      exercise_id UUID,
      sets_completed INTEGER,
      reps_completed INTEGER[],
      weights_kg NUMERIC[],
      rpe_values NUMERIC[],
      duration_seconds INTEGER,
      notes TEXT
    );
  END IF;

  IF v_inserted THEN
    UPDATE public.session_authorizations
    SET consumed_at = NOW()
    WHERE client_session_id = p_client_session_id
      AND user_id = v_user_id
      AND consumed_at IS NULL;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'SESSION_AUTHORIZATION_CONSUME_FAILED';
    END IF;
  END IF;

  RETURN QUERY SELECT v_progress_log_id, v_inserted, v_result_snapshot;
END;
$$;


--
-- Name: save_session_log_atomic_v3(uuid, uuid, timestamp with time zone, integer, integer, jsonb, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.save_session_log_atomic_v3(p_client_session_id uuid, p_workout_id uuid, p_completed_at timestamp with time zone, p_duration_minutes integer, p_mood_rating integer, p_exercise_logs jsonb, p_result_snapshot jsonb) RETURNS TABLE(progress_log_id uuid, inserted boolean, result_snapshot jsonb)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_authorization public.session_authorizations%ROWTYPE;
  v_authorized_plan public.workout_plans%ROWTYPE;
  v_prescription_locked BOOLEAN := FALSE;
  v_normalized_exercise_logs JSONB := COALESCE(p_exercise_logs, '[]'::JSONB);
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'SESSION_AUTHENTICATION_REQUIRED';
  END IF;

  IF p_client_session_id IS NULL OR p_workout_id IS NULL THEN
    RAISE EXCEPTION 'SESSION_AUTHORIZATION_INVALID_ID';
  END IF;

  -- This matches v2's order. The row lock also freezes the authorization
  -- snapshot across a retry while a later professional revision is published.
  PERFORM pg_advisory_xact_lock(hashtextextended(v_user_id::TEXT, 0));
  SELECT * INTO v_authorization
  FROM public.session_authorizations
  WHERE client_session_id = p_client_session_id
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'SESSION_AUTHORIZATION_REQUIRED'; END IF;
  IF v_authorization.user_id IS DISTINCT FROM v_user_id
    OR v_authorization.workout_id IS DISTINCT FROM p_workout_id THEN
    RAISE EXCEPTION 'SESSION_AUTHORIZATION_MISMATCH';
  END IF;

  -- A consumed claim is an idempotent retry, not a second execution. Delegate
  -- before inspecting mutable plan state or the retry payload so a malformed
  -- offline retry always receives the original immutable result.
  IF v_authorization.consumed_at IS NOT NULL THEN
    RETURN QUERY
    SELECT * FROM public.save_session_log_atomic_v2(
      p_client_session_id,
      p_workout_id,
      p_completed_at,
      p_duration_minutes,
      p_mood_rating,
      p_exercise_logs,
      p_result_snapshot
    );
    RETURN;
  END IF;

  SELECT * INTO v_authorized_plan
  FROM public.workout_plans
  WHERE id = v_authorization.plan_id
    AND user_id = v_user_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'SESSION_AUTHORIZATION_MISMATCH'; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.workouts
    WHERE id = v_authorization.workout_id
      AND plan_id = v_authorized_plan.id
      AND user_id = v_user_id
  ) THEN
    RAISE EXCEPTION 'SESSION_AUTHORIZATION_MISMATCH';
  END IF;

  v_prescription_locked := COALESCE(v_authorized_plan.prescription_locked, FALSE) OR COALESCE(
    LOWER(v_authorization.session_context_snapshot->'plan'->>'prescriptionLocked') IN ('true', 't', '1'),
    FALSE
  );

  IF v_prescription_locked THEN
    IF v_authorized_plan.prescription_locked IS DISTINCT FROM TRUE
      OR v_authorized_plan.trainer_assignment_id IS NULL
      OR v_authorized_plan.trainer_assignment_version_id IS NULL
      OR NOT EXISTS (
        SELECT 1
        FROM public.trainer_plan_assignments AS assignment
        WHERE assignment.id = v_authorized_plan.trainer_assignment_id
          AND assignment.client_user_id = v_user_id
          AND assignment.relationship_id = v_authorized_plan.trainer_relationship_id
      )
      OR NOT EXISTS (
        SELECT 1
        FROM public.trainer_assignment_versions AS version
        WHERE version.id = v_authorized_plan.trainer_assignment_version_id
          AND version.assignment_id = v_authorized_plan.trainer_assignment_id
          AND version.materialized_plan_id = v_authorized_plan.id
      ) THEN
      RAISE EXCEPTION 'SESSION_PROFESSIONAL_AUTHORIZATION_INVALID';
    END IF;

    IF jsonb_typeof(v_normalized_exercise_logs) IS DISTINCT FROM 'array' THEN
      RAISE EXCEPTION 'SESSION_PROFESSIONAL_EXERCISE_INVALID';
    END IF;

    IF EXISTS (
      SELECT 1
      FROM jsonb_to_recordset(v_normalized_exercise_logs) AS item(
        exercise_id UUID,
        sets_completed INTEGER,
        skip_reason TEXT
      )
      WHERE item.exercise_id IS NULL
        OR item.sets_completed IS NULL
        OR item.sets_completed < 0
        OR (item.sets_completed = 0 AND NULLIF(BTRIM(item.skip_reason), '') IS NULL)
    ) THEN
      RAISE EXCEPTION 'SESSION_PROFESSIONAL_SKIP_REASON_REQUIRED';
    END IF;

    IF EXISTS (
      SELECT 1
      FROM jsonb_to_recordset(v_normalized_exercise_logs) AS item(exercise_id UUID)
      GROUP BY item.exercise_id
      HAVING COUNT(*) > 1
    ) THEN
      RAISE EXCEPTION 'SESSION_PROFESSIONAL_EXERCISE_DUPLICATE';
    END IF;

    IF EXISTS (
      SELECT 1
      FROM jsonb_to_recordset(v_normalized_exercise_logs) AS item(exercise_id UUID)
      WHERE NOT EXISTS (
        SELECT 1
        FROM public.workout_exercises AS prescription
        WHERE prescription.workout_id = v_authorization.workout_id
          AND prescription.exercise_id = item.exercise_id
      )
    ) THEN
      RAISE EXCEPTION 'SESSION_PROFESSIONAL_EXERCISE_FORBIDDEN';
    END IF;

    IF EXISTS (
      SELECT 1
      FROM public.workout_exercises AS prescription
      WHERE prescription.workout_id = v_authorization.workout_id
        AND NOT EXISTS (
          SELECT 1
          FROM jsonb_to_recordset(v_normalized_exercise_logs) AS item(exercise_id UUID)
          WHERE item.exercise_id = prescription.exercise_id
        )
    ) THEN
      RAISE EXCEPTION 'SESSION_PROFESSIONAL_EXERCISE_INCOMPLETE';
    END IF;

    -- Keep an explicit omission reason in the client payload and normalize the
    -- persistent legacy-compatible notes column without dropping the evidence.
    SELECT COALESCE(jsonb_agg(
      CASE
        WHEN COALESCE((item.value->>'sets_completed')::INTEGER, 0) = 0 THEN
          jsonb_set(
            item.value,
            '{notes}',
            to_jsonb('Saltado: ' || BTRIM(item.value->>'skip_reason') || '.'),
            TRUE
          )
        ELSE item.value
      END
      ORDER BY item.ordinality
    ), '[]'::JSONB)
    INTO v_normalized_exercise_logs
    FROM jsonb_array_elements(v_normalized_exercise_logs) WITH ORDINALITY AS item(value, ordinality);
  END IF;

  RETURN QUERY
  SELECT * FROM public.save_session_log_atomic_v2(
    p_client_session_id,
    p_workout_id,
    p_completed_at,
    p_duration_minutes,
    p_mood_rating,
    v_normalized_exercise_logs,
    p_result_snapshot
  );
END;
$$;


--
-- Name: save_trainer_application_draft(jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.save_trainer_application_draft(p_payload jsonb) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $_$
DECLARE
  v_user_id UUID := auth.uid();
  v_application public.trainer_applications%ROWTYPE;
  v_avatar_url TEXT;
  v_onboarding_done BOOLEAN;
  v_payload_key_count INTEGER;
  v_professional_name TEXT;
  v_professional_photo_url TEXT;
  v_bio TEXT;
  v_specialties TEXT[];
  v_modalities TEXT[];
  v_experience_summary TEXT;
  v_general_location TEXT;
  v_languages TEXT[];
  v_contact_email TEXT;
  v_contact_phone TEXT;
  v_preferred_contact TEXT;
  v_timezone TEXT;
  v_interview_availability TEXT;
BEGIN
  IF v_user_id IS NULL OR auth.role() <> 'authenticated' THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Authentication required.';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('trainer-profile:' || v_user_id::TEXT, 0));

  SELECT profile.avatar_url, profile.onboarding_done
  INTO v_avatar_url, v_onboarding_done
  FROM public.profiles profile
  WHERE profile.id = v_user_id;

  IF NOT FOUND OR NOT COALESCE(v_onboarding_done, FALSE) OR NOT public.is_account_active(v_user_id) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Active onboarded account required.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.trainer_profiles profile WHERE profile.user_id = v_user_id
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'A trainer profile already exists; use the profile update workflow.';
  END IF;

  SELECT application.* INTO v_application
  FROM public.trainer_applications application
  WHERE application.user_id = v_user_id
    AND application.application_kind = 'initial'
    AND application.status IN ('draft', 'changes_requested')
  ORDER BY application.created_at DESC, application.id DESC
  LIMIT 1
  FOR UPDATE;

  IF v_application.id IS NULL AND EXISTS (
    SELECT 1
    FROM public.trainer_applications application
    WHERE application.user_id = v_user_id
      AND application.application_kind = 'initial'
      AND application.status IN ('submitted', 'under_review', 'interview_required')
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'The initial trainer application is already under review.';
  END IF;

  IF jsonb_typeof(p_payload) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'Trainer application draft payload invalid.';
  END IF;

  SELECT count(*)
  INTO v_payload_key_count
  FROM jsonb_object_keys(p_payload);

  IF v_payload_key_count <> 13
    OR NOT (p_payload ?& ARRAY[
      'professional_name', 'professional_photo_url', 'bio', 'specialties', 'modalities',
      'experience_summary', 'general_location', 'languages', 'contact_email', 'contact_phone',
      'preferred_contact', 'timezone', 'interview_availability'
    ])
    OR jsonb_typeof(p_payload->'specialties') <> 'array'
    OR jsonb_typeof(p_payload->'modalities') <> 'array'
    OR jsonb_typeof(p_payload->'languages') <> 'array'
  THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'Trainer application draft payload invalid.';
  END IF;

  v_professional_name := btrim(COALESCE(p_payload->>'professional_name', ''));
  v_professional_photo_url := NULLIF(btrim(COALESCE(p_payload->>'professional_photo_url', '')), '');
  v_bio := btrim(COALESCE(p_payload->>'bio', ''));
  v_specialties := ARRAY(
    SELECT btrim(item.value)
    FROM jsonb_array_elements_text(p_payload->'specialties') WITH ORDINALITY AS item(value, position)
    ORDER BY item.position
  );
  v_modalities := ARRAY(
    SELECT btrim(item.value)
    FROM jsonb_array_elements_text(p_payload->'modalities') WITH ORDINALITY AS item(value, position)
    ORDER BY item.position
  );
  v_experience_summary := btrim(COALESCE(p_payload->>'experience_summary', ''));
  v_general_location := NULLIF(btrim(COALESCE(p_payload->>'general_location', '')), '');
  v_languages := ARRAY(
    SELECT btrim(item.value)
    FROM jsonb_array_elements_text(p_payload->'languages') WITH ORDINALITY AS item(value, position)
    ORDER BY item.position
  );
  v_contact_email := lower(btrim(COALESCE(p_payload->>'contact_email', '')));
  v_contact_phone := NULLIF(btrim(COALESCE(p_payload->>'contact_phone', '')), '');
  v_preferred_contact := btrim(COALESCE(p_payload->>'preferred_contact', ''));
  v_timezone := btrim(COALESCE(p_payload->>'timezone', ''));
  v_interview_availability := btrim(COALESCE(p_payload->>'interview_availability', ''));

  IF char_length(v_professional_name) <> 0 AND char_length(v_professional_name) NOT BETWEEN 2 AND 100
    OR char_length(v_bio) <> 0 AND char_length(v_bio) NOT BETWEEN 50 AND 2000
    OR cardinality(v_specialties) > 10
    OR EXISTS (
      SELECT 1 FROM unnest(v_specialties) specialty
      WHERE char_length(specialty) NOT BETWEEN 1 AND 80
    )
    OR cardinality(v_modalities) > 3
    OR NOT (v_modalities <@ ARRAY['online', 'in_person', 'hybrid']::TEXT[])
    OR char_length(v_experience_summary) <> 0
      AND char_length(v_experience_summary) NOT BETWEEN 20 AND 2000
    OR char_length(COALESCE(v_general_location, '')) > 120
    OR cardinality(v_languages) > 10
    OR EXISTS (
      SELECT 1 FROM unnest(v_languages) language
      WHERE char_length(language) NOT BETWEEN 1 AND 80
    )
    OR char_length(v_contact_email) > 254
    OR v_contact_email <> '' AND v_contact_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    OR v_contact_phone IS NOT NULL AND v_contact_phone !~ '^\+?[0-9][0-9 ()\.\-]{6,31}$'
    OR v_preferred_contact NOT IN ('email', 'phone', 'whatsapp')
    OR NOT EXISTS (
      SELECT 1 FROM pg_catalog.pg_timezone_names timezone_name WHERE timezone_name.name = v_timezone
    )
    OR char_length(v_interview_availability) <> 0
      AND char_length(v_interview_availability) NOT BETWEEN 10 AND 1000
  THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'Trainer application draft fields invalid.';
  END IF;

  IF v_professional_photo_url IS NOT NULL
    AND (
      char_length(v_professional_photo_url) > 2048
      OR v_professional_photo_url !~ '^https://[^/[:space:]]+(?:/[^[:space:]]*)?$'
      OR v_professional_photo_url IS DISTINCT FROM v_avatar_url
        AND v_professional_photo_url IS DISTINCT FROM v_application.professional_photo_url
    )
  THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'Professional photo must be owned by the applicant.';
  END IF;

  IF v_application.id IS NULL THEN
    INSERT INTO public.trainer_applications (
      user_id, application_kind, status, professional_name, professional_photo_url, bio,
      specialties, modalities, experience_summary, general_location, languages, contact_email,
      contact_phone, preferred_contact, timezone, interview_availability
    ) VALUES (
      v_user_id, 'initial', 'draft', v_professional_name, v_professional_photo_url, v_bio,
      v_specialties, v_modalities, v_experience_summary, v_general_location, v_languages,
      v_contact_email, v_contact_phone, v_preferred_contact, v_timezone, v_interview_availability
    ) RETURNING * INTO v_application;
  ELSE
    UPDATE public.trainer_applications
    SET professional_name = v_professional_name,
        professional_photo_url = v_professional_photo_url,
        bio = v_bio,
        specialties = v_specialties,
        modalities = v_modalities,
        experience_summary = v_experience_summary,
        general_location = v_general_location,
        languages = v_languages,
        contact_email = v_contact_email,
        contact_phone = v_contact_phone,
        preferred_contact = v_preferred_contact,
        timezone = v_timezone,
        interview_availability = v_interview_availability
    WHERE id = v_application.id
    RETURNING * INTO v_application;
  END IF;

  RETURN jsonb_build_object('application_id', v_application.id, 'status', v_application.status);
END;
$_$;


--
-- Name: save_trainer_profile_changes(jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.save_trainer_profile_changes(p_payload jsonb) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $_$
DECLARE
  v_user_id UUID := auth.uid();
  v_profile public.trainer_profiles%ROWTYPE;
  v_source_application public.trainer_applications%ROWTYPE;
  v_credential_source public.trainer_applications%ROWTYPE;
  v_review public.trainer_applications%ROWTYPE;
  v_event_id UUID;
  v_professional_name TEXT;
  v_professional_photo_url TEXT;
  v_bio TEXT;
  v_specialties TEXT[];
  v_modalities TEXT[];
  v_effective_modalities TEXT[];
  v_experience_summary TEXT;
  v_general_location TEXT;
  v_languages TEXT[];
  v_review_changed BOOLEAN;
  v_review_created BOOLEAN := FALSE;
  v_previous_status TEXT;
BEGIN
  IF v_user_id IS NULL OR auth.role() <> 'authenticated' THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Authentication required.';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('trainer-profile:' || v_user_id::TEXT, 0));

  SELECT profile.* INTO v_profile
  FROM public.trainer_profiles profile
  WHERE profile.user_id = v_user_id
  FOR UPDATE;

  IF NOT FOUND OR v_profile.status <> 'active' OR NOT public.is_account_active(v_user_id) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Active trainer profile required.';
  END IF;

  SELECT application.* INTO v_review
  FROM public.trainer_applications application
  WHERE application.user_id = v_user_id
    AND application.application_kind = 'profile_update'
    AND application.status IN ('draft', 'submitted', 'under_review', 'changes_requested', 'interview_required')
  ORDER BY application.created_at DESC, application.id DESC
  LIMIT 1
  FOR UPDATE;

  IF jsonb_typeof(p_payload) <> 'object'
    OR NOT (p_payload ?& ARRAY[
      'professionalName', 'professionalPhotoUrl', 'bio', 'specialties',
      'modalities', 'experienceSummary', 'generalLocation', 'languages'
    ])
    OR jsonb_typeof(p_payload->'specialties') <> 'array'
    OR jsonb_typeof(p_payload->'modalities') <> 'array'
    OR jsonb_typeof(p_payload->'languages') <> 'array'
  THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'Trainer profile payload invalid.';
  END IF;

  v_professional_name := btrim(COALESCE(p_payload->>'professionalName', ''));
  v_professional_photo_url := NULLIF(btrim(COALESCE(p_payload->>'professionalPhotoUrl', '')), '');
  v_bio := btrim(COALESCE(p_payload->>'bio', ''));
  v_specialties := ARRAY(
    SELECT btrim(item.value)
    FROM jsonb_array_elements_text(p_payload->'specialties') WITH ORDINALITY AS item(value, position)
    ORDER BY item.position
  );
  v_modalities := ARRAY(
    SELECT btrim(item.value)
    FROM jsonb_array_elements_text(p_payload->'modalities') WITH ORDINALITY AS item(value, position)
    ORDER BY item.position
  );
  v_experience_summary := btrim(COALESCE(p_payload->>'experienceSummary', ''));
  v_general_location := NULLIF(btrim(COALESCE(p_payload->>'generalLocation', '')), '');
  v_languages := ARRAY(
    SELECT btrim(item.value)
    FROM jsonb_array_elements_text(p_payload->'languages') WITH ORDINALITY AS item(value, position)
    ORDER BY item.position
  );
  v_effective_modalities := ARRAY(
    SELECT DISTINCT modality
    FROM unnest(
      v_profile.modalities || CASE
        WHEN v_review.id IS NOT NULL AND v_review.status IN ('under_review', 'interview_required')
          THEN v_review.modalities
        ELSE v_modalities
      END
    ) AS modality
  );

  IF char_length(v_professional_name) NOT BETWEEN 2 AND 100
    OR (
      v_professional_photo_url IS NOT NULL
      AND (
        v_professional_photo_url !~ '^https://[^/[:space:]]+(?:/[^[:space:]]*)?$'
        OR char_length(v_professional_photo_url) > 2048
      )
    )
    OR char_length(v_bio) NOT BETWEEN 50 AND 2000
    OR cardinality(v_specialties) NOT BETWEEN 1 AND 10
    OR EXISTS (
      SELECT 1 FROM unnest(v_specialties) specialty
      WHERE char_length(specialty) NOT BETWEEN 1 AND 80
    )
    OR cardinality(v_modalities) NOT BETWEEN 1 AND 3
    OR NOT (v_modalities <@ ARRAY['online', 'in_person', 'hybrid']::TEXT[])
    OR char_length(v_experience_summary) NOT BETWEEN 20 AND 2000
    OR char_length(COALESCE(v_general_location, '')) > 120
    OR cardinality(v_languages) NOT BETWEEN 1 AND 10
    OR EXISTS (
      SELECT 1 FROM unnest(v_languages) language
      WHERE char_length(language) NOT BETWEEN 1 AND 80
    )
  THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'Trainer profile fields invalid.';
  END IF;

  IF v_professional_photo_url IS DISTINCT FROM v_profile.professional_photo_url
    AND v_professional_photo_url IS NOT NULL
    AND NOT public.trainer_photo_url_is_owned(v_user_id, v_professional_photo_url)
  THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'Professional photo must come from the owner avatar storage path.';
  END IF;

  IF v_effective_modalities && ARRAY['in_person', 'hybrid']::TEXT[]
    AND v_general_location IS NULL
  THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'General location is required while approved or pending modalities include in-person or hybrid coaching.';
  END IF;

  v_review_changed := v_professional_name IS DISTINCT FROM v_profile.professional_name
    OR v_specialties IS DISTINCT FROM v_profile.specialties
    OR v_modalities IS DISTINCT FROM v_profile.modalities
    OR v_experience_summary IS DISTINCT FROM v_profile.experience_summary;

  UPDATE public.trainer_profiles
  SET professional_photo_url = v_professional_photo_url,
      bio = v_bio,
      general_location = v_general_location,
      languages = v_languages
  WHERE id = v_profile.id
  RETURNING * INTO v_profile;

  IF NOT v_review_changed
    AND v_review.id IS NOT NULL
    AND v_review.application_kind = 'profile_update'
    AND v_review.status IN ('draft', 'submitted', 'changes_requested')
    AND (
      v_review.professional_name IS DISTINCT FROM v_profile.professional_name
      OR v_review.specialties IS DISTINCT FROM v_profile.specialties
      OR v_review.modalities IS DISTINCT FROM v_profile.modalities
      OR v_review.experience_summary IS DISTINCT FROM v_profile.experience_summary
    )
  THEN
    UPDATE public.trainer_applications
    SET status = 'withdrawn',
        decided_at = NOW()
    WHERE id = v_review.id;

    INSERT INTO public.trainer_application_events (
      application_id, from_status, to_status, public_note, actor_user_id, actor_role
    ) VALUES (
      v_review.id, v_review.status, 'withdrawn',
      'Actualizacion de perfil retirada por el entrenador.', v_user_id, 'applicant'
    );

    RETURN jsonb_build_object(
      'profile_updated', TRUE,
      'review_application_id', NULL,
      'review_status', NULL,
      'review_created', FALSE
    );
  END IF;

  IF NOT v_review_changed THEN
    RETURN jsonb_build_object(
      'profile_updated', TRUE,
      'review_application_id', v_review.id,
      'review_status', v_review.status,
      'review_created', FALSE
    );
  END IF;

  SELECT application.* INTO v_source_application
  FROM public.trainer_applications application
  WHERE application.id = v_profile.source_application_id
    AND application.user_id = v_user_id
    AND application.status = 'approved'
  FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Approved trainer source unavailable.';
  END IF;

  SELECT application.* INTO v_credential_source
  FROM public.trainer_applications application
  WHERE application.id = COALESCE(
      v_source_application.credential_source_application_id,
      v_source_application.id
    )
    AND application.user_id = v_user_id
    AND application.status = 'approved'
    AND EXISTS (
      SELECT 1
      FROM public.trainer_application_credentials credential
      WHERE credential.application_id = application.id
    )
  FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Approved credential source unavailable.';
  END IF;

  IF v_review.id IS NOT NULL THEN
    IF v_review.application_kind <> 'profile_update'
      OR v_review.source_profile_id IS DISTINCT FROM v_profile.id
      OR v_review.credential_source_application_id IS DISTINCT FROM v_credential_source.id
    THEN
      RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Open trainer review conflicts with approved profile.';
    END IF;

    IF v_review.status IN ('under_review', 'interview_required') THEN
      RETURN jsonb_build_object(
        'profile_updated', TRUE,
        'review_application_id', v_review.id,
        'review_status', v_review.status,
        'review_created', FALSE
      );
    END IF;

    v_previous_status := v_review.status;
    UPDATE public.trainer_applications
    SET status = 'submitted',
        professional_name = v_professional_name,
        professional_photo_url = v_professional_photo_url,
        bio = v_bio,
        specialties = v_specialties,
        modalities = v_modalities,
        experience_summary = v_experience_summary,
        general_location = v_general_location,
        languages = v_languages,
        contact_email = v_source_application.contact_email,
        contact_phone = v_source_application.contact_phone,
        preferred_contact = v_source_application.preferred_contact,
        timezone = v_source_application.timezone,
        interview_availability = v_source_application.interview_availability,
        submitted_at = COALESCE(submitted_at, NOW()),
        decided_at = NULL
    WHERE id = v_review.id
    RETURNING * INTO v_review;

    SELECT event.id INTO v_event_id
    FROM public.trainer_application_events event
    WHERE event.application_id = v_review.id
      AND event.to_status = 'submitted'
      AND event.actor_role = 'applicant'
    ORDER BY event.created_at DESC, event.id DESC
    LIMIT 1;

    IF v_event_id IS NULL OR v_previous_status = 'changes_requested' THEN
      INSERT INTO public.trainer_application_events (
        application_id, from_status, to_status, public_note, actor_user_id, actor_role
      ) VALUES (
        v_review.id, v_previous_status, 'submitted',
        'Actualizacion de perfil enviada para revision.', v_user_id, 'applicant'
      ) RETURNING id INTO v_event_id;
    END IF;
  ELSE
    INSERT INTO public.trainer_applications (
      user_id, application_kind, source_profile_id, credential_source_application_id,
      status, professional_name, professional_photo_url, bio, specialties, modalities,
      experience_summary, general_location, languages, contact_email, contact_phone,
      preferred_contact, timezone, interview_availability, submitted_at
    ) VALUES (
      v_user_id, 'profile_update', v_profile.id, v_credential_source.id,
      'submitted', v_professional_name, v_professional_photo_url, v_bio,
      v_specialties, v_modalities, v_experience_summary, v_general_location,
      v_languages, v_source_application.contact_email, v_source_application.contact_phone,
      v_source_application.preferred_contact, v_source_application.timezone,
      v_source_application.interview_availability, NOW()
    ) RETURNING * INTO v_review;

    INSERT INTO public.trainer_application_events (
      application_id, from_status, to_status, public_note, actor_user_id, actor_role
    ) VALUES (
      v_review.id, NULL, 'submitted',
      'Actualizacion de perfil enviada para revision.', v_user_id, 'applicant'
    ) RETURNING id INTO v_event_id;
    v_review_created := TRUE;
  END IF;

  PERFORM public.notify_trainer_application_admins(v_review.id, v_event_id);

  RETURN jsonb_build_object(
    'profile_updated', TRUE,
    'review_application_id', v_review.id,
    'review_status', v_review.status,
    'review_created', v_review_created
  );
END;
$_$;


--
-- Name: set_subscription_tier_atomic(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_subscription_tier_atomic(p_user_id uuid, p_subscription_tier text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_actor_role TEXT := COALESCE(auth.role(), '');
  v_current_tier TEXT;
  v_family_count INTEGER;
BEGIN
  IF v_actor_role <> 'service_role' AND session_user NOT IN ('postgres', 'supabase_admin') THEN
    RAISE EXCEPTION 'PLAN_SUBSCRIPTION_TIER_CHANGE_FORBIDDEN';
  END IF;
  IF p_subscription_tier NOT IN ('free', 'pro') THEN RAISE EXCEPTION 'Invalid subscription tier'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_user_id::TEXT, 0));
  PERFORM set_config('app.plan_lifecycle_actor', p_user_id::TEXT, TRUE);
  SELECT subscription_tier INTO v_current_tier FROM profiles WHERE id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Profile not found'; END IF;
  IF v_current_tier = 'pro' AND p_subscription_tier = 'free' THEN
    SELECT COUNT(DISTINCT family_id)::INTEGER INTO v_family_count
    FROM workout_plans WHERE user_id = p_user_id AND library_slot = 'personal'
      AND retired_at IS NULL AND superseded_at IS NULL;
    IF v_family_count > 2 THEN
      RAISE EXCEPTION 'PLAN_DOWNGRADE_FAMILY_LIMIT: archive plans until at most two current families remain';
    END IF;
  END IF;
  UPDATE profiles SET subscription_tier = p_subscription_tier WHERE id = p_user_id;
  RETURN p_user_id;
END;
$$;


--
-- Name: snapshot_admin_audit_identity(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.snapshot_admin_audit_identity() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public', 'pg_temp'
    AS $$
BEGIN
  NEW.admin_user_id_snapshot := NEW.admin_user_id;
  NEW.target_user_id_snapshot := NEW.target_user_id;
  RETURN NEW;
END;
$$;


--
-- Name: submit_trainer_application(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.submit_trainer_application(p_application_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $_$
DECLARE
  v_user_id UUID := auth.uid();
  v_application public.trainer_applications%ROWTYPE;
  v_event_id UUID;
  v_profile_avatar_url TEXT;
BEGIN
  IF v_user_id IS NULL OR auth.role() <> 'authenticated' THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Authentication required.';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('trainer-profile:' || v_user_id::TEXT, 0));

  SELECT application.*
  INTO v_application
  FROM public.trainer_applications application
  WHERE application.id = p_application_id
    AND application.user_id = v_user_id
  FOR UPDATE;

  IF NOT FOUND OR v_application.application_kind <> 'initial'
    OR NOT public.is_account_active(v_user_id) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Application unavailable.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.trainer_profiles trainer_profile
    WHERE trainer_profile.user_id = v_user_id
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'An existing trainer profile must be updated through the profile review flow.';
  END IF;

  SELECT profile.avatar_url INTO v_profile_avatar_url
  FROM public.profiles profile
  WHERE profile.id = v_user_id
    AND profile.onboarding_done = TRUE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Applicant profile unavailable.';
  END IF;

  IF v_application.status = 'submitted' THEN
    SELECT event.id
    INTO v_event_id
    FROM public.trainer_application_events event
    WHERE event.application_id = v_application.id
      AND event.to_status = 'submitted'
      AND event.actor_user_id = v_user_id
      AND event.actor_role = 'applicant'
    ORDER BY event.created_at DESC, event.id DESC
    LIMIT 1;

    PERFORM public.notify_trainer_application_admins(v_application.id, v_event_id);

    RETURN jsonb_build_object(
      'application_id', v_application.id,
      'user_id', v_user_id,
      'status', v_application.status,
      'transitioned', FALSE,
      'event_id', v_event_id
    );
  END IF;

  IF v_application.status NOT IN ('draft', 'changes_requested') THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'Invalid applicant transition.';
  END IF;

  IF char_length(btrim(v_application.professional_name)) NOT BETWEEN 2 AND 100
    OR v_application.professional_photo_url IS NULL
    OR v_application.professional_photo_url IS DISTINCT FROM v_profile_avatar_url
    OR v_application.professional_photo_url !~ '^https://[^/[:space:]]+(?:/[^[:space:]]*)?$'
    OR char_length(btrim(v_application.bio)) NOT BETWEEN 50 AND 2000
    OR cardinality(v_application.specialties) NOT BETWEEN 1 AND 10
    OR EXISTS (
      SELECT 1 FROM unnest(v_application.specialties) specialty
      WHERE char_length(btrim(specialty)) NOT BETWEEN 1 AND 80
    )
    OR cardinality(v_application.modalities) NOT BETWEEN 1 AND 3
    OR char_length(btrim(v_application.experience_summary)) NOT BETWEEN 20 AND 2000
    OR (
      v_application.modalities && ARRAY['in_person', 'hybrid']::TEXT[]
      AND (
        v_application.general_location IS NULL
        OR char_length(btrim(v_application.general_location)) NOT BETWEEN 1 AND 120
      )
    )
    OR char_length(COALESCE(v_application.general_location, '')) > 120
    OR cardinality(v_application.languages) NOT BETWEEN 1 AND 10
    OR EXISTS (
      SELECT 1 FROM unnest(v_application.languages) language
      WHERE char_length(btrim(language)) NOT BETWEEN 1 AND 80
    )
    OR char_length(v_application.contact_email) > 254
    OR v_application.contact_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    OR (
      v_application.preferred_contact IN ('phone', 'whatsapp')
      AND NULLIF(btrim(COALESCE(v_application.contact_phone, '')), '') IS NULL
    )
    OR (
      v_application.contact_phone IS NOT NULL
      AND v_application.contact_phone !~ '^\+?[0-9][0-9[:space:]().-]{6,31}$'
    )
    OR NOT EXISTS (
      SELECT 1 FROM pg_catalog.pg_timezone_names timezone_name
      WHERE timezone_name.name = v_application.timezone
    )
    OR char_length(btrim(v_application.interview_availability)) NOT BETWEEN 10 AND 1000
    OR NOT public.trainer_application_has_eligible_credentials(v_application.id, v_user_id)
  THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'Application is incomplete.';
  END IF;

  UPDATE public.trainer_applications
  SET status = 'submitted',
      submitted_at = NOW(),
      decided_at = NULL
  WHERE id = v_application.id;

  INSERT INTO public.trainer_application_events (
    application_id,
    from_status,
    to_status,
    public_note,
    actor_user_id,
    actor_role
  ) VALUES (
    v_application.id,
    v_application.status,
    'submitted',
    'Solicitud enviada para revision.',
    v_user_id,
    'applicant'
  )
  RETURNING id INTO v_event_id;

  PERFORM public.notify_trainer_application_admins(v_application.id, v_event_id);

  RETURN jsonb_build_object(
    'application_id', v_application.id,
    'user_id', v_user_id,
    'status', 'submitted',
    'transitioned', TRUE,
    'event_id', v_event_id
  );
END;
$_$;


--
-- Name: suspend_account_and_professional(uuid, uuid, text, timestamp with time zone); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.suspend_account_and_professional(p_user_id uuid, p_admin_id uuid, p_reason text, p_until timestamp with time zone) RETURNS TABLE(account_suspended boolean, trainer_profile_suspended boolean)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_admin_user_id UUID;
  v_target_account public.profiles%ROWTYPE;
  v_reason TEXT := NULLIF(btrim(COALESCE(p_reason, '')), '');
  v_relationship RECORD;
  v_profile_changed BOOLEAN := FALSE;
BEGIN
  v_admin_user_id := public.require_active_coaching_admin(p_admin_id);
  IF p_user_id IS NULL OR v_reason IS NULL OR char_length(v_reason) < 4 OR char_length(v_reason) > 500 THEN
    RAISE EXCEPTION 'COACHING_SUSPENSION_INVALID';
  END IF;
  IF p_until IS NOT NULL AND p_until <= NOW() THEN
    RAISE EXCEPTION 'COACHING_SUSPENSION_INVALID';
  END IF;

  -- Coordinate with any client-side activation operation before reading account state.
  PERFORM pg_advisory_xact_lock(hashtextextended(p_user_id::TEXT, 0));

  SELECT * INTO v_target_account FROM public.profiles profile
  WHERE profile.id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'COACHING_ACCOUNT_NOT_FOUND';
  END IF;
  IF v_target_account.account_status = 'suspended' THEN
    RETURN QUERY SELECT FALSE, FALSE;
    RETURN;
  END IF;

  UPDATE public.profiles
  SET account_status = 'suspended', suspension_reason = v_reason,
      suspended_at = NOW(), suspended_until = p_until, suspended_by = v_admin_user_id
  WHERE id = p_user_id;

  -- Always take the profile row lock after the account lock, even for a client
  -- with no professional profile, to match accept/resume's trainer lock order.
  PERFORM 1 FROM public.trainer_profiles profile
  WHERE profile.user_id = p_user_id
  FOR UPDATE;
  UPDATE public.trainer_profiles
  SET status = 'suspended'
  WHERE user_id = p_user_id AND status <> 'suspended';
  v_profile_changed := FOUND;

  -- A suspended professional must immediately lose all live client scopes.
  -- Returning the changed rows keeps notifications scoped to this operation.
  FOR v_relationship IN
    UPDATE public.coaching_relationships relationship
    SET status = 'paused_by_platform', paused_at = NOW()
    WHERE (relationship.trainer_user_id = p_user_id OR relationship.client_user_id = p_user_id)
      AND relationship.status = 'active'
    RETURNING relationship.id, relationship.trainer_user_id, relationship.client_user_id
  LOOP
    UPDATE public.coaching_consents consent
    SET revoked_at = NOW(), revoked_by = v_admin_user_id
    WHERE consent.relationship_id = v_relationship.id
      AND consent.revoked_at IS NULL;
    INSERT INTO public.professional_audit_logs (
      actor_user_id, subject_user_id, entity_type, entity_id, action, metadata
    ) VALUES (
      v_admin_user_id, p_user_id, 'coaching_relationship', v_relationship.id,
      'paused_due_to_account_suspension', jsonb_build_object(
        'trainer_user_id', v_relationship.trainer_user_id,
        'client_user_id', v_relationship.client_user_id
      )
    );
    IF v_relationship.trainer_user_id = p_user_id THEN
      PERFORM public.create_product_notification(
        p_user_id, 'coaching_trainer_suspended', 'Perfil profesional suspendido',
        'El acceso profesional fue suspendido por administración.', '/coach',
        'coaching-trainer-suspended:' || v_relationship.id::TEXT || ':' || p_user_id::TEXT,
        jsonb_build_object('relationship_id', v_relationship.id));
      IF v_relationship.client_user_id <> p_user_id THEN
        PERFORM public.create_product_notification(
          v_relationship.client_user_id, 'coaching_trainer_suspended', 'Acompañamiento pausado',
          'Tu acompañamiento fue pausado por una revisión administrativa.', '/coaching',
          'coaching-trainer-suspended:' || v_relationship.id::TEXT || ':' || v_relationship.client_user_id::TEXT,
          jsonb_build_object('relationship_id', v_relationship.id));
      END IF;
    ELSE
      PERFORM public.create_product_notification(
        p_user_id, 'coaching_account_suspended', 'Cuenta suspendida',
        'Tu acceso fue suspendido por administración y el acompañamiento quedó pausado.', '/coaching',
        'coaching-account-suspended:' || v_relationship.id::TEXT || ':' || p_user_id::TEXT,
        jsonb_build_object('relationship_id', v_relationship.id));
      IF v_relationship.trainer_user_id <> p_user_id THEN
        PERFORM public.create_product_notification(
          v_relationship.trainer_user_id, 'coaching_client_suspended', 'Acompañamiento pausado',
          'El acompañamiento fue pausado por una revisión administrativa.', '/coach/requests',
          'coaching-account-suspended:' || v_relationship.id::TEXT || ':' || v_relationship.trainer_user_id::TEXT,
          jsonb_build_object('relationship_id', v_relationship.id));
      END IF;
    END IF;
  END LOOP;

  INSERT INTO public.admin_audit_logs (admin_user_id, target_user_id, action, reason, metadata)
  VALUES (v_admin_user_id, p_user_id, 'account_suspended', v_reason,
    jsonb_build_object('suspended_until', p_until, 'trainer_profile_suspended', v_profile_changed));
  INSERT INTO public.professional_audit_logs (actor_user_id, subject_user_id, entity_type, entity_id, action, metadata)
  VALUES (v_admin_user_id, p_user_id, 'trainer_account', p_user_id, 'suspended',
    jsonb_build_object('trainer_profile_suspended', v_profile_changed));
  RETURN QUERY SELECT TRUE, v_profile_changed;
END;
$$;


--
-- Name: sync_profile_weight_from_measurements(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sync_profile_weight_from_measurements() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
DECLARE
  v_user_id UUID;
  v_should_sync BOOLEAN := FALSE;
  v_latest_weight NUMERIC(5,1);
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_user_id := NEW.user_id;
    v_should_sync := NEW.weight_kg IS NOT NULL;
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.user_id IS DISTINCT FROM NEW.user_id THEN
      RAISE EXCEPTION 'measurement owner cannot be changed'
        USING ERRCODE = 'P0001';
    END IF;
    v_user_id := NEW.user_id;
    v_should_sync := OLD.weight_kg IS DISTINCT FROM NEW.weight_kg
      OR OLD.recorded_at IS DISTINCT FROM NEW.recorded_at
      OR OLD.id IS DISTINCT FROM NEW.id;
  ELSE
    v_user_id := OLD.user_id;
    v_should_sync := OLD.weight_kg IS NOT NULL;
  END IF;

  IF NOT v_should_sync THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
  END IF;

  PERFORM 1
    FROM public.profiles AS p
   WHERE p.id = v_user_id
   FOR UPDATE;

  INSERT INTO private.profile_weight_sync_context (transaction_id, backend_pid, profile_id)
  VALUES (pg_catalog.txid_current(), pg_catalog.pg_backend_pid(), v_user_id)
  ON CONFLICT DO NOTHING;

  SELECT m.weight_kg
    INTO v_latest_weight
    FROM public.measurements AS m
   WHERE m.user_id = v_user_id
     AND m.weight_kg IS NOT NULL
   ORDER BY m.recorded_at DESC, m.id DESC
   LIMIT 1;

  UPDATE public.profiles
     SET weight_kg = v_latest_weight
   WHERE id = v_user_id;

  DELETE FROM private.profile_weight_sync_context
   WHERE transaction_id = pg_catalog.txid_current()
     AND backend_pid = pg_catalog.pg_backend_pid()
     AND profile_id = v_user_id;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: touch_coaching_relationships_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.touch_coaching_relationships_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public', 'pg_temp'
    AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;


--
-- Name: touch_product_notification_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.touch_product_notification_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public', 'pg_temp'
    AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;


--
-- Name: touch_social_push_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.touch_social_push_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END; $$;


--
-- Name: touch_trainer_verification_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.touch_trainer_verification_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public', 'pg_temp'
    AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;


--
-- Name: trainer_application_has_eligible_credentials(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.trainer_application_has_eligible_credentials(p_application_id uuid, p_user_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'storage', 'pg_temp'
    AS $_$
  SELECT EXISTS (
    SELECT 1
    FROM public.trainer_application_credentials credential
    JOIN public.trainer_applications application
      ON application.id = credential.application_id
    WHERE credential.application_id = p_application_id
      AND application.user_id = p_user_id
  )
  AND NOT EXISTS (
    SELECT 1
    FROM public.trainer_application_credentials credential
    JOIN public.trainer_credential_storage_cleanup cleanup
      ON cleanup.application_id = credential.application_id
      AND cleanup.credential_id = credential.id
      AND cleanup.reason = 'user_removal'
    WHERE credential.application_id = p_application_id
  )
  AND NOT EXISTS (
    SELECT 1
    FROM public.trainer_application_credentials credential
    WHERE credential.application_id = p_application_id
      AND (
        char_length(btrim(credential.title)) NOT BETWEEN 1 AND 160
        OR (
          credential.credential_type = 'link'
          AND (
            credential.external_url IS NULL
            OR credential.external_url !~ '^https://[^/[:space:]]+(?:/[^[:space:]]*)?$'
            OR char_length(credential.external_url) > 2048
            OR credential.storage_path IS NOT NULL
            OR credential.mime_type IS NOT NULL
            OR credential.size_bytes IS NOT NULL
          )
        )
        OR (
          credential.credential_type = 'document'
          AND (
            credential.external_url IS NOT NULL
            OR credential.storage_path <> (
              p_user_id::TEXT || '/' || p_application_id::TEXT || '/' || credential.id::TEXT || '.' ||
              CASE credential.mime_type
                WHEN 'application/pdf' THEN 'pdf'
                WHEN 'image/jpeg' THEN 'jpg'
                WHEN 'image/png' THEN 'png'
                ELSE 'invalid'
              END
            )
            OR credential.size_bytes NOT BETWEEN 1 AND 10485760
            OR NOT EXISTS (
              SELECT 1
              FROM storage.objects object
              WHERE object.bucket_id = 'trainer-credentials'
                AND object.name = credential.storage_path
                AND object.metadata->>'mimetype' = credential.mime_type
                AND COALESCE(object.metadata->>'size', '') ~ '^[0-9]+$'
                AND (object.metadata->>'size')::BIGINT = credential.size_bytes
            )
          )
        )
      )
  )
$_$;


--
-- Name: trainer_photo_url_is_owned(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.trainer_photo_url_is_owned(p_user_id uuid, p_photo_url text) RETURNS boolean
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'storage', 'pg_temp'
    AS $_$
DECLARE
  v_claims JSONB;
  v_issuer TEXT;
  v_origin TEXT;
  v_expected_url TEXT;
BEGIN
  IF p_photo_url IS NULL THEN RETURN TRUE; END IF;

  BEGIN
    v_claims := NULLIF(current_setting('request.jwt.claims', true), '')::JSONB;
  EXCEPTION WHEN OTHERS THEN
    RETURN FALSE;
  END;
  v_issuer := NULLIF(v_claims->>'iss', '');

  IF auth.uid() IS DISTINCT FROM p_user_id
    OR v_issuer IS NULL
    OR v_issuer !~ '^https://[^/[:space:]]+/auth/v1/?$'
  THEN
    RETURN FALSE;
  END IF;

  v_origin := regexp_replace(v_issuer, '/auth/v1/?$', '');
  v_expected_url := v_origin || '/storage/v1/object/public/avatars/'
    || p_user_id::TEXT || '/avatar.webp';

  RETURN regexp_replace(p_photo_url, '\?v=[0-9]+$', '') = v_expected_url
    AND (p_photo_url = v_expected_url OR p_photo_url ~ '\?v=[0-9]+$')
    AND EXISTS (
      SELECT 1
      FROM storage.objects object
      WHERE object.bucket_id = 'avatars'
        AND object.name = p_user_id::TEXT || '/avatar.webp'
    );
END;
$_$;


--
-- Name: trainer_security_preflight(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.trainer_security_preflight() RETURNS integer
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
      'proposed', 'accepted', 'revision_published', 'assignment_frozen', 'declined'
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

  RETURN 59;
END;
$_$;


--
-- Name: transition_trainer_application(uuid, uuid, text, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.transition_trainer_application(p_application_id uuid, p_actor_user_id uuid, p_action text, p_payload jsonb DEFAULT '{}'::jsonb) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $_$
DECLARE
  v_application public.trainer_applications%ROWTYPE;
  v_application_user_id UUID;
  v_existing_profile public.trainer_profiles%ROWTYPE;
  v_interview public.trainer_interviews%ROWTYPE;
  v_event_id UUID;
  v_profile_id UUID;
  v_target_status TEXT;
  v_public_note TEXT := NULLIF(btrim(COALESCE(p_payload->>'public_note', '')), '');
  v_internal_note TEXT := NULLIF(btrim(COALESCE(p_payload->>'internal_note', '')), '');
  v_interview_id UUID;
  v_proposed_at TIMESTAMPTZ;
  v_timezone TEXT;
  v_medium TEXT;
  v_external_url TEXT;
  v_interview_status TEXT;
  v_outcome TEXT;
  v_notification_title TEXT;
  v_notification_body TEXT;
  v_notification_url TEXT;
  v_dedupe_key TEXT;
BEGIN
  IF p_actor_user_id IS NULL OR NOT EXISTS (
    SELECT 1
    FROM public.profiles profile
    WHERE profile.id = p_actor_user_id
      AND profile.is_admin = TRUE
      AND profile.account_status = 'active'
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Active administrator required.';
  END IF;

  IF p_action NOT IN (
    'start_review',
    'request_changes',
    'schedule_interview',
    'record_interview_outcome',
    'approve',
    'reject'
  ) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'Unsupported administrative transition.';
  END IF;

  IF char_length(COALESCE(v_public_note, '')) > 1000
    OR char_length(COALESCE(v_internal_note, '')) > 2000
  THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'Administrative note is too long.';
  END IF;

  SELECT application.user_id
  INTO v_application_user_id
  FROM public.trainer_applications application
  WHERE application.id = p_application_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'Application unavailable.';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('trainer-profile:' || v_application_user_id::TEXT, 0));

  SELECT application.*
  INTO v_application
  FROM public.trainer_applications application
  WHERE application.id = p_application_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'Application unavailable.';
  END IF;

  v_notification_url := CASE v_application.application_kind
    WHEN 'profile_update' THEN '/coach/profile'
    ELSE '/coach/apply'
  END;

  IF p_action = 'schedule_interview' THEN
    IF COALESCE(p_payload->>'interview_id', '') !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$' THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'Interview identifier is invalid.';
    END IF;
    v_interview_id := (p_payload->>'interview_id')::UUID;
    v_proposed_at := (p_payload->>'proposed_at')::TIMESTAMPTZ;
    v_timezone := NULLIF(btrim(COALESCE(p_payload->>'timezone', '')), '');
    v_medium := NULLIF(btrim(COALESCE(p_payload->>'medium', '')), '');
    v_external_url := NULLIF(btrim(COALESCE(p_payload->>'external_url', '')), '');

    IF v_application.status = 'interview_required' THEN
      SELECT interview.*
      INTO v_interview
      FROM public.trainer_interviews interview
      WHERE interview.id = v_interview_id
        AND interview.application_id = v_application.id
      FOR UPDATE;

      IF NOT FOUND THEN
        RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'Interview retry does not match the application.';
      END IF;
      IF v_interview.proposed_at <> v_proposed_at
        OR v_interview.timezone <> v_timezone
        OR v_interview.medium <> v_medium
        OR v_interview.external_url IS DISTINCT FROM v_external_url
      THEN
        RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'Interview idempotency conflict.';
      END IF;

      SELECT event.id
      INTO v_event_id
      FROM public.trainer_application_events event
      WHERE event.application_id = v_application.id
        AND event.to_status = 'interview_required'
        AND event.actor_role = 'admin'
      ORDER BY event.created_at DESC, event.id DESC
      LIMIT 1;

      RETURN jsonb_build_object(
        'application_id', v_application.id,
        'status', v_application.status,
        'transitioned', FALSE,
        'event_id', v_event_id,
        'interview_id', v_interview.id
      );
    END IF;

    IF v_application.status <> 'under_review' THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'Invalid administrative transition.';
    END IF;
    IF v_proposed_at IS NULL OR v_proposed_at <= NOW() THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'Interview must be scheduled in the future.';
    END IF;
    IF v_timezone IS NULL OR NOT EXISTS (
      SELECT 1 FROM pg_catalog.pg_timezone_names timezone_name
      WHERE timezone_name.name = v_timezone
    ) THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'Interview timezone is invalid.';
    END IF;
    IF v_medium NOT IN ('video_call', 'phone', 'in_person') THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'Interview medium is invalid.';
    END IF;
    IF v_external_url IS NOT NULL AND (
      char_length(v_external_url) > 2048
      OR v_external_url !~ '^https://[^/[:space:]]+(?:/[^[:space:]]*)?$'
    ) THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'Interview URL must use HTTPS.';
    END IF;

    INSERT INTO public.trainer_interviews (
      id,
      application_id,
      proposed_at,
      timezone,
      medium,
      external_url,
      status,
      public_note,
      internal_note,
      created_by
    ) VALUES (
      v_interview_id,
      v_application.id,
      v_proposed_at,
      v_timezone,
      v_medium,
      v_external_url,
      'scheduled',
      v_public_note,
      v_internal_note,
      p_actor_user_id
    );

    UPDATE public.trainer_applications
    SET status = 'interview_required', decided_at = NULL
    WHERE id = v_application.id;

    INSERT INTO public.trainer_application_events (
      application_id, from_status, to_status, public_note, internal_note, actor_user_id, actor_role
    ) VALUES (
      v_application.id, v_application.status, 'interview_required', v_public_note, v_internal_note,
      p_actor_user_id, 'admin'
    ) RETURNING id INTO v_event_id;

    INSERT INTO public.professional_audit_logs (
      actor_user_id, subject_user_id, entity_type, entity_id, action, metadata
    ) VALUES (
      p_actor_user_id, v_application.user_id, 'trainer_application', v_application.id,
      'trainer_interview_scheduled', jsonb_build_object('interviewId', v_interview_id)
    );

    PERFORM public.create_product_notification(
      v_application.user_id,
      'trainer_application_status',
      'Entrevista programada',
      'Se ha programado una entrevista externa para tu solicitud.',
      v_notification_url,
      'trainer-interview:' || v_interview_id::TEXT || ':scheduled',
      jsonb_build_object(
        'applicationId', v_application.id,
        'status', 'interview_required',
        'interviewId', v_interview_id
      )
    );

    RETURN jsonb_build_object(
      'application_id', v_application.id,
      'status', 'interview_required',
      'transitioned', TRUE,
      'event_id', v_event_id,
      'interview_id', v_interview_id
    );
  END IF;

  IF p_action = 'record_interview_outcome' THEN
    IF v_application.status <> 'interview_required' THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'Application has no interview awaiting outcome.';
    END IF;
    IF COALESCE(p_payload->>'interview_id', '') !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$' THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'Interview identifier is invalid.';
    END IF;
    v_interview_id := (p_payload->>'interview_id')::UUID;
    v_interview_status := NULLIF(btrim(COALESCE(p_payload->>'interview_status', '')), '');
    v_outcome := NULLIF(btrim(COALESCE(p_payload->>'outcome', '')), '');
    IF v_interview_status NOT IN ('completed', 'cancelled')
      OR char_length(COALESCE(v_outcome, '')) NOT BETWEEN 3 AND 1000
    THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'Interview outcome is invalid.';
    END IF;

    SELECT interview.*
    INTO v_interview
    FROM public.trainer_interviews interview
    WHERE interview.id = v_interview_id
      AND interview.application_id = v_application.id
    FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'Interview unavailable.';
    END IF;

    IF v_interview.status = v_interview_status AND v_interview.outcome = v_outcome THEN
      SELECT event.id
      INTO v_event_id
      FROM public.trainer_application_events event
      WHERE event.application_id = v_application.id
        AND event.from_status = 'interview_required'
        AND event.to_status = 'interview_required'
        AND event.actor_role = 'admin'
      ORDER BY event.created_at DESC, event.id DESC
      LIMIT 1;
      RETURN jsonb_build_object(
        'application_id', v_application.id,
        'status', v_application.status,
        'transitioned', FALSE,
        'event_id', v_event_id,
        'interview_id', v_interview.id
      );
    END IF;
    IF v_interview.status IN ('completed', 'cancelled') THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'Interview outcome is already final.';
    END IF;

    UPDATE public.trainer_interviews
    SET status = v_interview_status,
        outcome = v_outcome,
        public_note = COALESCE(v_public_note, public_note),
        internal_note = COALESCE(v_internal_note, internal_note)
    WHERE id = v_interview.id;

    INSERT INTO public.trainer_application_events (
      application_id, from_status, to_status, public_note, internal_note, actor_user_id, actor_role
    ) VALUES (
      v_application.id, 'interview_required', 'interview_required', v_public_note, v_internal_note,
      p_actor_user_id, 'admin'
    ) RETURNING id INTO v_event_id;

    INSERT INTO public.professional_audit_logs (
      actor_user_id, subject_user_id, entity_type, entity_id, action, metadata
    ) VALUES (
      p_actor_user_id, v_application.user_id, 'trainer_interview', v_interview.id,
      'trainer_interview_outcome_recorded',
      jsonb_build_object('applicationId', v_application.id, 'status', v_interview_status)
    );

    PERFORM public.create_product_notification(
      v_application.user_id,
      'trainer_application_status',
      'Entrevista actualizada',
      CASE WHEN v_interview_status = 'completed'
        THEN 'El resultado de tu entrevista ha sido registrado.'
        ELSE 'La entrevista de tu solicitud ha sido cancelada.'
      END,
      v_notification_url,
      'trainer-interview:' || v_interview.id::TEXT || ':' || v_interview_status,
      jsonb_build_object(
        'applicationId', v_application.id,
        'status', 'interview_required',
        'interviewId', v_interview.id,
        'interviewStatus', v_interview_status
      )
    );

    RETURN jsonb_build_object(
      'application_id', v_application.id,
      'status', v_application.status,
      'transitioned', TRUE,
      'event_id', v_event_id,
      'interview_id', v_interview.id
    );
  END IF;

  v_target_status := CASE p_action
    WHEN 'start_review' THEN 'under_review'
    WHEN 'request_changes' THEN 'changes_requested'
    WHEN 'approve' THEN 'approved'
    WHEN 'reject' THEN 'rejected'
  END;

  IF p_action IN ('request_changes', 'reject')
    AND char_length(COALESCE(v_public_note, '')) NOT BETWEEN 3 AND 1000
  THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'A public note is required.';
  END IF;

  IF v_application.status = v_target_status THEN
    SELECT event.id
    INTO v_event_id
    FROM public.trainer_application_events event
    WHERE event.application_id = v_application.id
      AND event.to_status = v_target_status
      AND event.actor_role = 'admin'
    ORDER BY event.created_at DESC, event.id DESC
    LIMIT 1;
    IF v_target_status = 'approved' THEN
      SELECT profile.id INTO v_profile_id
      FROM public.trainer_profiles profile
      WHERE profile.user_id = v_application.user_id
        AND profile.status = 'active';
    END IF;
    RETURN jsonb_build_object(
      'application_id', v_application.id,
      'status', v_application.status,
      'transitioned', FALSE,
      'event_id', v_event_id,
      'profile_id', v_profile_id
    );
  END IF;

  IF (p_action = 'start_review' AND v_application.status <> 'submitted')
    OR (p_action IN ('request_changes', 'approve', 'reject')
      AND v_application.status NOT IN ('under_review', 'interview_required'))
  THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'Invalid administrative transition.';
  END IF;

  IF v_target_status = 'approved'
    AND (
      (
        v_application.application_kind = 'initial'
        AND NOT public.trainer_application_has_eligible_credentials(
          v_application.id,
          v_application.user_id
        )
      )
      OR (
        v_application.application_kind = 'profile_update'
        AND (
          v_application.credential_source_application_id IS NULL
          OR NOT EXISTS (
            SELECT 1
            FROM public.trainer_applications credential_source
            WHERE credential_source.id = v_application.credential_source_application_id
              AND credential_source.user_id = v_application.user_id
              AND credential_source.status = 'approved'
          )
          OR NOT public.trainer_application_has_eligible_credentials(
            v_application.credential_source_application_id,
            v_application.user_id
          )
        )
      )
    )
  THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'Application credentials are unavailable.';
  END IF;

  IF v_target_status = 'approved' AND v_application.application_kind = 'profile_update' THEN
    SELECT profile.* INTO v_existing_profile
    FROM public.trainer_profiles profile
    WHERE profile.id = v_application.source_profile_id
      AND profile.user_id = v_application.user_id
      AND profile.status = 'active'
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Active trainer profile required for profile update approval.';
    END IF;

    v_profile_id := v_existing_profile.id;
  ELSIF v_target_status = 'approved' AND v_application.application_kind = 'initial' THEN
    SELECT profile.* INTO v_existing_profile
    FROM public.trainer_profiles profile
    WHERE profile.user_id = v_application.user_id
    FOR UPDATE;

    IF FOUND THEN
      RAISE EXCEPTION USING
        ERRCODE = '42501',
        MESSAGE = 'An existing trainer profile must be updated through the profile review flow.';
    END IF;
  END IF;

  IF v_target_status = 'approved'
    AND v_application.modalities && ARRAY['in_person', 'hybrid']::TEXT[]
    AND NULLIF(btrim(COALESCE(
      CASE
        WHEN v_application.application_kind = 'profile_update'
          THEN v_existing_profile.general_location
        ELSE v_application.general_location
      END,
      ''
    )), '') IS NULL
  THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'Add a general location before approving in-person or hybrid coaching modalities.';
  END IF;

  UPDATE public.trainer_applications
  SET status = v_target_status,
      decided_at = CASE WHEN v_target_status IN ('approved', 'rejected') THEN NOW() ELSE NULL END
  WHERE id = v_application.id;

  IF v_target_status = 'approved' THEN
    INSERT INTO public.trainer_profiles (
      user_id,
      source_application_id,
      slug,
      status,
      professional_name,
      professional_photo_url,
      bio,
      specialties,
      modalities,
      experience_summary,
      general_location,
      languages,
      verified_at
    ) VALUES (
      v_application.user_id,
      v_application.id,
      'trainer-' || replace(v_application.user_id::TEXT, '-', ''),
      'active',
      v_application.professional_name,
      v_application.professional_photo_url,
      v_application.bio,
      v_application.specialties,
      v_application.modalities,
      v_application.experience_summary,
      v_application.general_location,
      v_application.languages,
      NOW()
    )
    ON CONFLICT (user_id) DO UPDATE SET
      source_application_id = EXCLUDED.source_application_id,
      status = CASE
        WHEN v_application.application_kind = 'profile_update'
          THEN trainer_profiles.status
        ELSE 'active'
      END,
      professional_name = EXCLUDED.professional_name,
      professional_photo_url = CASE
        WHEN v_application.application_kind = 'profile_update'
          THEN trainer_profiles.professional_photo_url
        ELSE EXCLUDED.professional_photo_url
      END,
      bio = CASE
        WHEN v_application.application_kind = 'profile_update'
          THEN trainer_profiles.bio
        ELSE EXCLUDED.bio
      END,
      specialties = EXCLUDED.specialties,
      modalities = EXCLUDED.modalities,
      experience_summary = EXCLUDED.experience_summary,
      general_location = CASE
        WHEN v_application.application_kind = 'profile_update'
          THEN trainer_profiles.general_location
        ELSE EXCLUDED.general_location
      END,
      languages = CASE
        WHEN v_application.application_kind = 'profile_update'
          THEN trainer_profiles.languages
        ELSE EXCLUDED.languages
      END,
      verified_at = NOW()
    RETURNING id INTO v_profile_id;
  END IF;

  INSERT INTO public.trainer_application_events (
    application_id, from_status, to_status, public_note, internal_note, actor_user_id, actor_role
  ) VALUES (
    v_application.id, v_application.status, v_target_status, v_public_note, v_internal_note,
    p_actor_user_id, 'admin'
  ) RETURNING id INTO v_event_id;

  INSERT INTO public.professional_audit_logs (
    actor_user_id, subject_user_id, entity_type, entity_id, action, metadata
  ) VALUES (
    p_actor_user_id,
    v_application.user_id,
    'trainer_application',
    v_application.id,
    'trainer_application_' || v_target_status,
    jsonb_build_object('fromStatus', v_application.status, 'toStatus', v_target_status)
  );

  v_notification_title := CASE v_target_status
    WHEN 'under_review' THEN 'Solicitud en revision'
    WHEN 'changes_requested' THEN 'Cambios solicitados'
    WHEN 'approved' THEN 'Solicitud aprobada'
    WHEN 'rejected' THEN 'Solicitud rechazada'
  END;
  v_notification_body := CASE v_target_status
    WHEN 'under_review' THEN 'La revision administrativa de tu solicitud ha comenzado.'
    WHEN 'changes_requested' THEN 'Tu solicitud necesita cambios antes de continuar.'
    WHEN 'approved' THEN 'Tu perfil profesional ha sido aprobado.'
    WHEN 'rejected' THEN 'Tu solicitud profesional no ha sido aprobada.'
  END;
  v_dedupe_key := CASE
    WHEN v_target_status IN ('approved', 'rejected')
      THEN 'trainer-application:' || v_application.id::TEXT || ':' || v_target_status
    ELSE 'trainer-application:' || v_application.id::TEXT || ':' || v_target_status || ':' || v_event_id::TEXT
  END;
  PERFORM public.create_product_notification(
    v_application.user_id,
    'trainer_application_status',
    v_notification_title,
    v_notification_body,
    v_notification_url,
    v_dedupe_key,
    jsonb_build_object('applicationId', v_application.id, 'status', v_target_status)
  );

  RETURN jsonb_build_object(
    'application_id', v_application.id,
    'status', v_target_status,
    'transitioned', TRUE,
    'event_id', v_event_id,
    'profile_id', v_profile_id
  );
END;
$_$;


--
-- Name: update_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


--
-- Name: validate_materialized_assignment_identity(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.validate_materialized_assignment_identity() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.workout_plans plan
    JOIN public.trainer_assignment_versions version ON version.id = plan.trainer_assignment_version_id
    JOIN public.coaching_relationships relationship ON relationship.id = NEW.relationship_id
    WHERE plan.trainer_assignment_id = NEW.id
      AND (plan.user_id IS DISTINCT FROM NEW.client_user_id
        OR plan.trainer_relationship_id IS DISTINCT FROM NEW.relationship_id
        OR version.assignment_id IS DISTINCT FROM NEW.id
        OR relationship.client_user_id IS DISTINCT FROM NEW.client_user_id
        OR relationship.trainer_user_id IS DISTINCT FROM NEW.trainer_user_id)
  ) THEN
    RAISE EXCEPTION 'TRAINER_ASSIGNED_PLAN_IDENTITY_INVALID';
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: validate_materialized_assignment_version_identity(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.validate_materialized_assignment_version_identity() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.workout_plans plan
    WHERE plan.trainer_assignment_version_id = NEW.id
      AND (NEW.materialized_plan_id IS DISTINCT FROM plan.id
        OR NEW.assignment_id IS DISTINCT FROM plan.trainer_assignment_id)
  ) THEN
    RAISE EXCEPTION 'TRAINER_ASSIGNED_PLAN_IDENTITY_INVALID';
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: validate_trainer_assigned_plan_identity(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.validate_trainer_assigned_plan_identity() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
BEGIN
  IF NEW.source_type = 'trainer_assigned' THEN
    IF NEW.library_slot <> 'professional'
      OR NEW.prescription_locked <> TRUE
      OR NEW.trainer_relationship_id IS NULL
      OR NEW.trainer_assignment_id IS NULL
      OR NEW.trainer_assignment_version_id IS NULL THEN
      RAISE EXCEPTION 'TRAINER_ASSIGNED_PLAN_IDENTITY_INVALID';
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM public.trainer_plan_assignments assignment
      JOIN public.trainer_assignment_versions version
        ON version.id = NEW.trainer_assignment_version_id
       AND version.assignment_id = assignment.id
       AND version.materialized_plan_id = NEW.id
      JOIN public.coaching_relationships relationship
        ON relationship.id = NEW.trainer_relationship_id
       AND relationship.id = assignment.relationship_id
      WHERE assignment.id = NEW.trainer_assignment_id
        AND assignment.client_user_id = NEW.user_id
        AND relationship.client_user_id = NEW.user_id
        AND relationship.trainer_user_id = assignment.trainer_user_id
    ) THEN
      RAISE EXCEPTION 'TRAINER_ASSIGNED_PLAN_IDENTITY_INVALID';
    END IF;
  ELSIF NEW.library_slot <> 'personal'
    OR NEW.prescription_locked <> FALSE
    OR NEW.trainer_relationship_id IS NOT NULL
    OR NEW.trainer_assignment_id IS NOT NULL
    OR NEW.trainer_assignment_version_id IS NOT NULL THEN
    RAISE EXCEPTION 'TRAINER_ASSIGNED_PLAN_IDENTITY_INVALID';
  END IF;

  RETURN NEW;
END;
$$;


--
-- Name: withdraw_trainer_application(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.withdraw_trainer_application(p_application_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_application public.trainer_applications%ROWTYPE;
  v_event_id UUID;
BEGIN
  IF v_user_id IS NULL OR auth.role() <> 'authenticated' THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Authentication required.';
  END IF;

  SELECT application.*
  INTO v_application
  FROM public.trainer_applications application
  WHERE application.id = p_application_id
    AND application.user_id = v_user_id
  FOR UPDATE;

  IF NOT FOUND OR v_application.application_kind <> 'initial'
    OR NOT public.is_account_active(v_user_id) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Application unavailable.';
  END IF;

  IF v_application.status = 'withdrawn' THEN
    SELECT event.id
    INTO v_event_id
    FROM public.trainer_application_events event
    WHERE event.application_id = v_application.id
      AND event.to_status = 'withdrawn'
      AND event.actor_user_id = v_user_id
      AND event.actor_role = 'applicant'
    ORDER BY event.created_at DESC, event.id DESC
    LIMIT 1;

    RETURN jsonb_build_object(
      'application_id', v_application.id,
      'user_id', v_user_id,
      'status', v_application.status,
      'transitioned', FALSE,
      'event_id', v_event_id
    );
  END IF;

  IF v_application.status NOT IN (
    'draft',
    'submitted',
    'under_review',
    'changes_requested',
    'interview_required'
  ) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'Invalid applicant transition.';
  END IF;

  UPDATE public.trainer_applications
  SET status = 'withdrawn',
      decided_at = NOW()
  WHERE id = v_application.id;

  INSERT INTO public.trainer_application_events (
    application_id,
    from_status,
    to_status,
    public_note,
    actor_user_id,
    actor_role
  ) VALUES (
    v_application.id,
    v_application.status,
    'withdrawn',
    'Solicitud retirada por el solicitante.',
    v_user_id,
    'applicant'
  )
  RETURNING id INTO v_event_id;

  RETURN jsonb_build_object(
    'application_id', v_application.id,
    'user_id', v_user_id,
    'status', 'withdrawn',
    'transitioned', TRUE,
    'event_id', v_event_id
  );
END;
$$;


--
-- Name: profile_weight_sync_context; Type: TABLE; Schema: private; Owner: -
--

CREATE TABLE private.profile_weight_sync_context (
    transaction_id bigint NOT NULL,
    backend_pid integer NOT NULL,
    profile_id uuid NOT NULL
);


--
-- Name: session_completion_analytics_state; Type: TABLE; Schema: private; Owner: -
--

CREATE TABLE private.session_completion_analytics_state (
    user_id uuid NOT NULL,
    completed_count bigint DEFAULT 0 NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT session_completion_analytics_state_completed_count_check CHECK ((completed_count >= 0))
);


--
-- Name: trainer_profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.trainer_profiles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    source_application_id uuid NOT NULL,
    slug text NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    professional_name text NOT NULL,
    professional_photo_url text,
    bio text NOT NULL,
    specialties text[] DEFAULT '{}'::text[] NOT NULL,
    modalities text[] DEFAULT '{}'::text[] NOT NULL,
    experience_summary text NOT NULL,
    general_location text,
    languages text[] DEFAULT '{}'::text[] NOT NULL,
    verified_at timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT trainer_profiles_modalities_check CHECK ((modalities <@ ARRAY['online'::text, 'in_person'::text, 'hybrid'::text])),
    CONSTRAINT trainer_profiles_slug_check CHECK ((slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'::text)),
    CONSTRAINT trainer_profiles_status_check CHECK ((status = ANY (ARRAY['active'::text, 'suspended'::text, 'inactive'::text])))
);

ALTER TABLE ONLY public.trainer_profiles FORCE ROW LEVEL SECURITY;


--
-- Name: TABLE trainer_profiles; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.trainer_profiles IS 'Approved professional capability record; public discovery is intentionally deferred.';


--
-- Name: trainer_service_offerings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.trainer_service_offerings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    trainer_profile_id uuid NOT NULL,
    name text NOT NULL,
    description text DEFAULT ''::text NOT NULL,
    modality text NOT NULL,
    duration_minutes integer NOT NULL,
    content text DEFAULT ''::text NOT NULL,
    capacity integer DEFAULT 1 NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    billing_mode text DEFAULT 'free_preview'::text NOT NULL,
    price_minor integer,
    currency text,
    billing_interval text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT trainer_service_offerings_billing_mode_check CHECK ((billing_mode = 'free_preview'::text)),
    CONSTRAINT trainer_service_offerings_capacity_check CHECK (((capacity >= 1) AND (capacity <= 1000))),
    CONSTRAINT trainer_service_offerings_content_check CHECK ((char_length(content) <= 4000)),
    CONSTRAINT trainer_service_offerings_description_check CHECK ((char_length(description) <= 4000)),
    CONSTRAINT trainer_service_offerings_duration_minutes_check CHECK (((duration_minutes >= 15) AND (duration_minutes <= 480))),
    CONSTRAINT trainer_service_offerings_free_preview_commercial_values_check CHECK (((billing_mode <> 'free_preview'::text) OR ((price_minor IS NULL) AND (currency IS NULL) AND (billing_interval IS NULL)))),
    CONSTRAINT trainer_service_offerings_modality_check CHECK ((modality = ANY (ARRAY['online'::text, 'in_person'::text, 'hybrid'::text]))),
    CONSTRAINT trainer_service_offerings_name_check CHECK (((char_length(btrim(name)) >= 1) AND (char_length(btrim(name)) <= 160)))
);

ALTER TABLE ONLY public.trainer_service_offerings FORCE ROW LEVEL SECURITY;


--
-- Name: active_trainer_directory; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.active_trainer_directory WITH (security_barrier='true') AS
 SELECT trainer_profile.user_id,
    trainer_profile.slug,
    trainer_profile.professional_name,
    trainer_profile.professional_photo_url,
    trainer_profile.bio,
    trainer_profile.specialties,
    trainer_profile.modalities,
    trainer_profile.experience_summary,
    trainer_profile.general_location,
    trainer_profile.languages,
    trainer_profile.verified_at,
    lower(concat_ws(' '::text, trainer_profile.professional_name, trainer_profile.bio, trainer_profile.experience_summary, trainer_profile.general_location, array_to_string(trainer_profile.specialties, ' '::text), array_to_string(trainer_profile.languages, ' '::text))) AS directory_search,
    lower(array_to_string(trainer_profile.specialties, ' '::text)) AS specialties_search,
    lower(array_to_string(trainer_profile.languages, ' '::text)) AS languages_search,
    COALESCE(jsonb_agg(jsonb_build_object('name', service.name, 'description', service.description, 'modality', service.modality, 'duration_minutes', service.duration_minutes, 'content', service.content) ORDER BY service.created_at, service.id) FILTER (WHERE (service.id IS NOT NULL)), '[]'::jsonb) AS active_services
   FROM (public.trainer_profiles trainer_profile
     LEFT JOIN public.trainer_service_offerings service ON (((service.trainer_profile_id = trainer_profile.id) AND (service.is_active = true))))
  WHERE ((trainer_profile.status = 'active'::text) AND public.is_account_active(trainer_profile.user_id))
  GROUP BY trainer_profile.user_id, trainer_profile.slug, trainer_profile.professional_name, trainer_profile.professional_photo_url, trainer_profile.bio, trainer_profile.specialties, trainer_profile.modalities, trainer_profile.experience_summary, trainer_profile.general_location, trainer_profile.languages, trainer_profile.verified_at;


--
-- Name: VIEW active_trainer_directory; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON VIEW public.active_trainer_directory IS 'Authenticated discovery projection of active trainer profiles and their active non-commercial services only.';


--
-- Name: admin_audit_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.admin_audit_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    admin_user_id uuid,
    target_user_id uuid,
    action text NOT NULL,
    reason text,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    admin_user_id_snapshot uuid,
    target_user_id_snapshot uuid
);

ALTER TABLE ONLY public.admin_audit_logs FORCE ROW LEVEL SECURITY;


--
-- Name: TABLE admin_audit_logs; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.admin_audit_logs IS 'Immutable operational log for administrative account and subscription actions.';


--
-- Name: ai_conversations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ai_conversations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    title text DEFAULT 'Nueva conversación'::text NOT NULL,
    context text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT ai_conversations_context_check CHECK ((context = ANY (ARRAY['general'::text, 'workout_plan'::text, 'nutrition'::text, 'progress'::text])))
);


--
-- Name: ai_messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ai_messages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    conversation_id uuid NOT NULL,
    role text NOT NULL,
    content text NOT NULL,
    generated_plan_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT ai_messages_role_check CHECK ((role = ANY (ARRAY['user'::text, 'assistant'::text])))
);


--
-- Name: ai_usage_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ai_usage_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    model text NOT NULL,
    operation text NOT NULL,
    attempt_number integer NOT NULL,
    input_tokens integer DEFAULT 0 NOT NULL,
    output_tokens integer DEFAULT 0 NOT NULL,
    cache_creation_tokens integer DEFAULT 0 NOT NULL,
    cache_read_tokens integer DEFAULT 0 NOT NULL,
    estimated_cost_usd numeric(10,6) DEFAULT 0 NOT NULL,
    latency_ms integer,
    success boolean DEFAULT true NOT NULL,
    error_type text,
    error_message text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT ai_usage_logs_attempt_number_check CHECK (((attempt_number >= 1) AND (attempt_number <= 5))),
    CONSTRAINT ai_usage_logs_operation_check CHECK ((operation = ANY (ARRAY['initial_plan_generation'::text, 'weekly_plan_regeneration'::text, 'plan_adjustment'::text, 'coach_chat'::text, 'other'::text])))
);


--
-- Name: ai_usage_daily; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.ai_usage_daily WITH (security_invoker='true') AS
 SELECT date_trunc('day'::text, (created_at AT TIME ZONE 'UTC'::text)) AS day,
    count(*) AS total_calls,
    count(*) FILTER (WHERE success) AS successful_calls,
    sum(estimated_cost_usd) AS total_cost_usd,
    sum(input_tokens) AS total_input_tokens,
    sum(output_tokens) AS total_output_tokens,
    sum(cache_creation_tokens) AS total_cache_creation_tokens,
    sum(cache_read_tokens) AS total_cache_read_tokens
   FROM public.ai_usage_logs
  GROUP BY (date_trunc('day'::text, (created_at AT TIME ZONE 'UTC'::text)))
  ORDER BY (date_trunc('day'::text, (created_at AT TIME ZONE 'UTC'::text))) DESC;


--
-- Name: coaching_consents; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.coaching_consents (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    relationship_id uuid NOT NULL,
    scope text NOT NULL,
    text_version text NOT NULL,
    granted_at timestamp with time zone DEFAULT now() NOT NULL,
    revoked_at timestamp with time zone,
    granted_by uuid NOT NULL,
    revoked_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT coaching_consents_revocation_actor_check CHECK ((((revoked_at IS NULL) AND (revoked_by IS NULL)) OR ((revoked_at IS NOT NULL) AND (revoked_by IS NOT NULL)))),
    CONSTRAINT coaching_consents_scope_check CHECK ((scope = ANY (ARRAY['training_profile'::text, 'body_measurements'::text]))),
    CONSTRAINT coaching_consents_text_version_check CHECK (((char_length(btrim(text_version)) >= 1) AND (char_length(btrim(text_version)) <= 160)))
);

ALTER TABLE ONLY public.coaching_consents FORCE ROW LEVEL SECURITY;


--
-- Name: coaching_relationships; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.coaching_relationships (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    source_request_id uuid,
    service_id uuid NOT NULL,
    trainer_user_id uuid NOT NULL,
    client_user_id uuid NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    started_at timestamp with time zone DEFAULT now() NOT NULL,
    paused_at timestamp with time zone,
    ended_at timestamp with time zone,
    ended_by uuid,
    end_reason text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT coaching_relationships_client_trainer_distinct CHECK ((client_user_id <> trainer_user_id)),
    CONSTRAINT coaching_relationships_end_reason_check CHECK (((end_reason IS NULL) OR (char_length(end_reason) <= 500))),
    CONSTRAINT coaching_relationships_end_state_check CHECK ((((status = 'ended'::text) AND (ended_at IS NOT NULL)) OR ((status <> 'ended'::text) AND (ended_at IS NULL) AND (ended_by IS NULL) AND (end_reason IS NULL)))),
    CONSTRAINT coaching_relationships_pause_state_check CHECK ((((status = 'paused_by_platform'::text) AND (paused_at IS NOT NULL)) OR ((status <> 'paused_by_platform'::text) AND (paused_at IS NULL)))),
    CONSTRAINT coaching_relationships_status_check CHECK ((status = ANY (ARRAY['active'::text, 'paused_by_platform'::text, 'ended'::text])))
);

ALTER TABLE ONLY public.coaching_relationships FORCE ROW LEVEL SECURITY;


--
-- Name: coaching_requests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.coaching_requests (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    service_id uuid NOT NULL,
    trainer_user_id uuid NOT NULL,
    client_user_id uuid NOT NULL,
    message text DEFAULT ''::text NOT NULL,
    training_profile_consent_version text NOT NULL,
    idempotency_key uuid DEFAULT gen_random_uuid() NOT NULL,
    acceptance_idempotency_key uuid,
    acceptance_cancelled_request_ids uuid[] DEFAULT '{}'::uuid[] NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    decided_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT coaching_requests_client_trainer_distinct CHECK ((client_user_id <> trainer_user_id)),
    CONSTRAINT coaching_requests_message_check CHECK ((char_length(message) <= 1000)),
    CONSTRAINT coaching_requests_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'accepted'::text, 'declined'::text, 'cancelled'::text])))
);

ALTER TABLE ONLY public.coaching_requests FORCE ROW LEVEL SECURITY;


--
-- Name: dashboard_banners; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.dashboard_banners (
    slot text DEFAULT 'dashboard-primary'::text NOT NULL,
    kind text DEFAULT 'announcement'::text NOT NULL,
    title text NOT NULL,
    description text,
    image_url text,
    cta_label text,
    cta_href text,
    status text DEFAULT 'draft'::text NOT NULL,
    starts_on date,
    ends_on date,
    updated_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT dashboard_banners_cta_pair CHECK (((cta_label IS NULL) = (cta_href IS NULL))),
    CONSTRAINT dashboard_banners_date_range CHECK (((starts_on IS NULL) OR (ends_on IS NULL) OR (starts_on <= ends_on))),
    CONSTRAINT dashboard_banners_description_length CHECK (((description IS NULL) OR (char_length(description) <= 280))),
    CONSTRAINT dashboard_banners_kind_check CHECK ((kind = ANY (ARRAY['announcement'::text, 'event'::text, 'promotion'::text, 'info'::text]))),
    CONSTRAINT dashboard_banners_slot_check CHECK ((slot = 'dashboard-primary'::text)),
    CONSTRAINT dashboard_banners_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'active'::text, 'paused'::text]))),
    CONSTRAINT dashboard_banners_title_length CHECK (((char_length(title) >= 3) AND (char_length(title) <= 100)))
);


--
-- Name: TABLE dashboard_banners; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.dashboard_banners IS 'Single configurable promotional content slot rendered on the dashboard.';


--
-- Name: exercise_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.exercise_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    progress_log_id uuid NOT NULL,
    exercise_id uuid NOT NULL,
    sets_completed integer,
    reps_completed integer[],
    weights_kg numeric(6,2)[],
    duration_seconds integer,
    notes text,
    rpe_values integer[]
);

ALTER TABLE ONLY public.exercise_logs FORCE ROW LEVEL SECURITY;


--
-- Name: COLUMN exercise_logs.rpe_values; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.exercise_logs.rpe_values IS 'Per-set RPE values recorded during a session. Aligns by index with reps_completed and weights_kg.';


--
-- Name: exercises; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.exercises (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    description text,
    muscle_groups text[] DEFAULT '{}'::text[] NOT NULL,
    equipment text[] DEFAULT '{}'::text[],
    difficulty text,
    exercise_type text,
    instructions text,
    video_url text,
    image_url text,
    is_public boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    wger_id integer,
    is_compound boolean DEFAULT false NOT NULL,
    source text,
    external_id text,
    name_es text,
    description_es text,
    instructions_es text,
    muscle_groups_es text[],
    equipment_es text[],
    movement_patterns text[] DEFAULT '{}'::text[] NOT NULL,
    cardio_modality text,
    impact_level text,
    joint_stress_tags text[] DEFAULT '{}'::text[] NOT NULL,
    CONSTRAINT exercises_cardio_modality_check CHECK (((cardio_modality IS NULL) OR (cardio_modality = ANY (ARRAY['walking'::text, 'running'::text, 'cycling'::text, 'elliptical'::text, 'rowing'::text, 'stairs'::text, 'jump_rope'::text])))),
    CONSTRAINT exercises_difficulty_check CHECK ((difficulty = ANY (ARRAY['beginner'::text, 'intermediate'::text, 'advanced'::text]))),
    CONSTRAINT exercises_exercise_type_check CHECK ((exercise_type = ANY (ARRAY['strength'::text, 'cardio'::text, 'flexibility'::text, 'balance'::text, 'hiit'::text]))),
    CONSTRAINT exercises_impact_level_check CHECK (((impact_level IS NULL) OR (impact_level = ANY (ARRAY['low'::text, 'moderate'::text, 'high'::text]))))
);


--
-- Name: COLUMN exercises.name; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.exercises.name IS 'Canonical English exercise name from the source dataset.';


--
-- Name: COLUMN exercises.name_es; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.exercises.name_es IS 'Spanish exercise name; NULL falls back to the canonical English value.';


--
-- Name: COLUMN exercises.cardio_modality; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.exercises.cardio_modality IS 'Deterministic cardio taxonomy; rebuilt by migration 031 and by the catalog seed mapper.';


--
-- Name: follows; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.follows (
    follower_id uuid NOT NULL,
    following_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    status text DEFAULT 'accepted'::text NOT NULL,
    CONSTRAINT follows_status_check CHECK ((status = ANY (ARRAY['accepted'::text, 'pending'::text]))),
    CONSTRAINT no_self_follow CHECK ((follower_id <> following_id))
);


--
-- Name: measurements; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.measurements (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    recorded_at timestamp with time zone DEFAULT now() NOT NULL,
    weight_kg numeric(5,1),
    body_fat_percentage numeric(4,1),
    muscle_mass_kg numeric(5,1),
    chest_cm numeric(5,1),
    waist_cm numeric(5,1),
    hips_cm numeric(5,1),
    arms_cm numeric(5,1),
    legs_cm numeric(5,1),
    notes text
);

ALTER TABLE ONLY public.measurements FORCE ROW LEVEL SECURITY;


--
-- Name: notification_attention_dismissals; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notification_attention_dismissals (
    user_id uuid DEFAULT auth.uid() NOT NULL,
    notice_key text NOT NULL,
    dismissed_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT notification_attention_dismissals_notice_key_check CHECK (((char_length(notice_key) >= 1) AND (char_length(notice_key) <= 160)))
);

ALTER TABLE ONLY public.notification_attention_dismissals FORCE ROW LEVEL SECURITY;


--
-- Name: TABLE notification_attention_dismissals; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.notification_attention_dismissals IS 'Immutable acknowledgement keys for derived user attention notices.';


--
-- Name: COLUMN notification_attention_dismissals.notice_key; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.notification_attention_dismissals.notice_key IS 'Stable notice version key such as plan-update:<plan-id>:<updated-at>.';


--
-- Name: workout_plans; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.workout_plans (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    name text NOT NULL,
    description text,
    goal text,
    duration_weeks integer,
    days_per_week integer,
    difficulty text,
    is_active boolean DEFAULT false NOT NULL,
    generated_by_ai boolean DEFAULT false NOT NULL,
    ai_prompt text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    ai_notes text,
    week_number integer DEFAULT 1 NOT NULL,
    plan_context text DEFAULT 'first_plan'::text NOT NULL,
    parent_plan_id uuid,
    manually_updated_at timestamp with time zone,
    source_type text DEFAULT 'ai'::text NOT NULL,
    source_post_id uuid,
    source_user_id uuid,
    generation_metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    family_id uuid DEFAULT gen_random_uuid() NOT NULL,
    superseded_at timestamp with time zone,
    retired_at timestamp with time zone,
    generation_request_id uuid,
    library_slot text DEFAULT 'personal'::text NOT NULL,
    trainer_relationship_id uuid,
    trainer_assignment_id uuid,
    trainer_assignment_version_id uuid,
    prescription_locked boolean DEFAULT false NOT NULL,
    CONSTRAINT workout_plans_days_per_week_check CHECK (((days_per_week >= 1) AND (days_per_week <= 7))),
    CONSTRAINT workout_plans_difficulty_check CHECK ((difficulty = ANY (ARRAY['beginner'::text, 'intermediate'::text, 'advanced'::text]))),
    CONSTRAINT workout_plans_plan_context_check CHECK ((plan_context = ANY (ARRAY['first_plan'::text, 'weekly_regeneration'::text, 'manual_update'::text]))),
    CONSTRAINT workout_plans_source_type_check CHECK ((source_type = ANY (ARRAY['ai'::text, 'engine'::text, 'manual'::text, 'imported'::text, 'shared_post'::text, 'trainer_assigned'::text]))),
    CONSTRAINT workout_plans_week_number_check CHECK ((week_number >= 1))
);

ALTER TABLE ONLY public.workout_plans FORCE ROW LEVEL SECURITY;


--
-- Name: COLUMN workout_plans.ai_notes; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.workout_plans.ai_notes IS 'Mensaje personalizado del entrenador IA para el usuario. Generado en español por Claude. Máx ~400 chars / 4 frases.';


--
-- Name: COLUMN workout_plans.week_number; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.workout_plans.week_number IS 'Semana del ciclo de plan. 1=primer plan; >1=regeneraciones semanales.';


--
-- Name: COLUMN workout_plans.plan_context; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.workout_plans.plan_context IS 'Contexto UX del plan activo: first_plan, weekly_regeneration o manual_update.';


--
-- Name: COLUMN workout_plans.parent_plan_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.workout_plans.parent_plan_id IS 'Plan anterior del cual se derivó una regeneración semanal.';


--
-- Name: COLUMN workout_plans.source_type; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.workout_plans.source_type IS 'Origen del plan: ai, manual, imported o shared_post.';


--
-- Name: plan_generation_daily; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.plan_generation_daily WITH (security_invoker='true') AS
 SELECT date_trunc('day'::text, (created_at AT TIME ZONE 'UTC'::text)) AS day,
    plan_context,
    COALESCE((generation_metadata ->> 'engineVersion'::text), 'unknown'::text) AS engine_version,
    count(*) AS successful_generations
   FROM public.workout_plans
  WHERE (source_type = 'engine'::text)
  GROUP BY (date_trunc('day'::text, (created_at AT TIME ZONE 'UTC'::text))), plan_context, COALESCE((generation_metadata ->> 'engineVersion'::text), 'unknown'::text)
  ORDER BY (date_trunc('day'::text, (created_at AT TIME ZONE 'UTC'::text))) DESC, plan_context, COALESCE((generation_metadata ->> 'engineVersion'::text), 'unknown'::text);


--
-- Name: plan_generation_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.plan_generation_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    plan_id uuid,
    mode text NOT NULL,
    generator text NOT NULL,
    success boolean NOT NULL,
    engine_version text,
    error_code text,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT plan_generation_events_mode_check CHECK ((mode = ANY (ARRAY['initial'::text, 'weekly_regeneration'::text, 'plan_adjustment'::text])))
);


--
-- Name: plan_generation_health_daily; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.plan_generation_health_daily WITH (security_invoker='true') AS
 SELECT date_trunc('day'::text, (created_at AT TIME ZONE 'UTC'::text)) AS day,
    mode,
    generator,
    COALESCE(engine_version, 'unknown'::text) AS engine_version,
    count(*) AS attempts,
    count(*) FILTER (WHERE success) AS successes,
    count(*) FILTER (WHERE (NOT success)) AS failures,
        CASE
            WHEN (count(*) > 0) THEN round(((count(*) FILTER (WHERE success))::numeric / (count(*))::numeric), 4)
            ELSE (0)::numeric
        END AS success_rate
   FROM public.plan_generation_events
  GROUP BY (date_trunc('day'::text, (created_at AT TIME ZONE 'UTC'::text))), mode, generator, COALESCE(engine_version, 'unknown'::text)
  ORDER BY (date_trunc('day'::text, (created_at AT TIME ZONE 'UTC'::text))) DESC, mode, generator, COALESCE(engine_version, 'unknown'::text);


--
-- Name: post_comments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.post_comments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    post_id uuid NOT NULL,
    user_id uuid NOT NULL,
    body text NOT NULL,
    removed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT post_comments_body_check CHECK (((length(body) >= 1) AND (length(body) <= 1000)))
);


--
-- Name: post_likes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.post_likes (
    post_id uuid NOT NULL,
    user_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: post_reports; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.post_reports (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    post_id uuid,
    comment_id uuid,
    reporter_id uuid NOT NULL,
    reason text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT report_target CHECK ((num_nonnulls(post_id, comment_id) = 1))
);


--
-- Name: posts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.posts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    body text,
    photo_urls text[] DEFAULT '{}'::text[] NOT NULL,
    session_snapshot jsonb,
    routine_snapshot jsonb,
    like_count integer DEFAULT 0 NOT NULL,
    comment_count integer DEFAULT 0 NOT NULL,
    removed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT posts_has_content CHECK (((body IS NOT NULL) OR (array_length(photo_urls, 1) IS NOT NULL) OR (session_snapshot IS NOT NULL) OR (routine_snapshot IS NOT NULL)))
);


--
-- Name: product_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.product_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    occurred_at timestamp with time zone DEFAULT now() NOT NULL,
    event_name text NOT NULL,
    anonymous_id uuid NOT NULL,
    user_id uuid,
    locale text,
    path text,
    properties jsonb DEFAULT '{}'::jsonb NOT NULL,
    CONSTRAINT product_events_event_name_check CHECK ((event_name = ANY (ARRAY['landing_view'::text, 'primary_cta_clicked'::text, 'language_changed'::text, 'signup_started'::text, 'signup_completed'::text, 'onboarding_step_completed'::text, 'onboarding_abandoned'::text, 'plan_generated'::text, 'first_session_started'::text, 'first_session_completed'::text, 'plan_adjustment_used'::text, 'organic_page_cta_clicked'::text, 'coach_overview_viewed'::text, 'coach_client_insights_viewed'::text, 'coach_alert_filter_used'::text, 'second_session_completed'::text, 'paywall_viewed'::text, 'checkout_started'::text, 'pro_interest_submitted'::text]))),
    CONSTRAINT product_events_locale_check CHECK ((locale = ANY (ARRAY['es'::text, 'en'::text]))),
    CONSTRAINT product_events_path_check CHECK (((path IS NULL) OR (path = ANY (ARRAY['/'::text, '/es'::text, '/en'::text, '/register'::text, '/onboarding'::text, '/pricing'::text, '/session'::text]))))
);


--
-- Name: product_notification_preferences; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.product_notification_preferences (
    user_id uuid DEFAULT auth.uid() NOT NULL,
    professional_enabled boolean DEFAULT true NOT NULL,
    push_enabled boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY public.product_notification_preferences FORCE ROW LEVEL SECURITY;


--
-- Name: TABLE product_notification_preferences; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.product_notification_preferences IS 'Per-user opt-in state for professional and native product notifications.';


--
-- Name: product_push_tokens; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.product_push_tokens (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    token text NOT NULL,
    platform text NOT NULL,
    device_id text NOT NULL,
    enabled boolean DEFAULT true NOT NULL,
    last_seen_at timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT product_push_tokens_device_id_check CHECK ((device_id <> ''::text)),
    CONSTRAINT product_push_tokens_platform_check CHECK ((platform = ANY (ARRAY['android'::text, 'ios'::text]))),
    CONSTRAINT product_push_tokens_token_check CHECK ((token <> ''::text))
);

ALTER TABLE ONLY public.product_push_tokens FORCE ROW LEVEL SECURITY;


--
-- Name: TABLE product_push_tokens; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.product_push_tokens IS 'Private per-device delivery tokens for general product notifications.';


--
-- Name: professional_audit_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.professional_audit_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    actor_user_id uuid,
    subject_user_id uuid,
    entity_type text NOT NULL,
    entity_id uuid,
    action text NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT professional_audit_logs_action_check CHECK ((action <> ''::text)),
    CONSTRAINT professional_audit_logs_entity_type_check CHECK ((entity_type <> ''::text))
);

ALTER TABLE ONLY public.professional_audit_logs FORCE ROW LEVEL SECURITY;


--
-- Name: TABLE professional_audit_logs; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.professional_audit_logs IS 'Private append-oriented audit evidence for professional workflow changes.';


--
-- Name: profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.profiles (
    id uuid NOT NULL,
    username text,
    full_name text,
    avatar_url text,
    height_cm numeric(5,1),
    weight_kg numeric(5,1),
    date_of_birth date,
    gender text,
    fitness_level text,
    primary_goal text,
    onboarding_done boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    days_per_week integer,
    session_duration_minutes integer,
    gym_type text,
    available_equipment text[] DEFAULT '{}'::text[] NOT NULL,
    injuries text,
    preferred_workout_days integer[],
    timezone text,
    last_check_in_at timestamp with time zone,
    is_private boolean DEFAULT false NOT NULL,
    post_count integer DEFAULT 0 NOT NULL,
    subscription_tier text DEFAULT 'free'::text NOT NULL,
    language text DEFAULT 'es'::text NOT NULL,
    cardio_preferences text[] DEFAULT '{}'::text[] NOT NULL,
    activity_level text DEFAULT 'insufficiently_active'::text NOT NULL,
    readiness_status text DEFAULT 'pending'::text NOT NULL,
    readiness_answers jsonb DEFAULT '{}'::jsonb NOT NULL,
    movement_limitations jsonb DEFAULT '[]'::jsonb NOT NULL,
    readiness_version text,
    readiness_completed_at timestamp with time zone,
    is_admin boolean DEFAULT false NOT NULL,
    account_status text DEFAULT 'active'::text NOT NULL,
    suspension_reason text,
    suspended_at timestamp with time zone,
    suspended_until timestamp with time zone,
    suspended_by uuid,
    CONSTRAINT profiles_account_status_check CHECK ((account_status = ANY (ARRAY['active'::text, 'suspended'::text]))),
    CONSTRAINT profiles_activity_level_check CHECK ((activity_level = ANY (ARRAY['inactive'::text, 'insufficiently_active'::text, 'regularly_active'::text]))),
    CONSTRAINT profiles_cardio_preferences_check CHECK ((cardio_preferences <@ ARRAY['walking'::text, 'running'::text, 'cycling'::text, 'elliptical'::text, 'rowing'::text, 'stairs'::text, 'jump_rope'::text])),
    CONSTRAINT profiles_days_per_week_check CHECK (((days_per_week >= 2) AND (days_per_week <= 6))),
    CONSTRAINT profiles_fitness_level_check CHECK ((fitness_level = ANY (ARRAY['beginner'::text, 'intermediate'::text, 'advanced'::text]))),
    CONSTRAINT profiles_gender_check CHECK ((gender = ANY (ARRAY['male'::text, 'female'::text, 'other'::text, 'prefer_not_to_say'::text]))),
    CONSTRAINT profiles_gym_type_check CHECK ((gym_type = ANY (ARRAY['home_no_equipment'::text, 'home_basic'::text, 'full_gym'::text]))),
    CONSTRAINT profiles_language_check CHECK ((language = ANY (ARRAY['es'::text, 'en'::text]))),
    CONSTRAINT profiles_preferred_workout_days_check CHECK (((preferred_workout_days IS NULL) OR (((array_length(preferred_workout_days, 1) >= 1) AND (array_length(preferred_workout_days, 1) <= 7)) AND (preferred_workout_days <@ ARRAY[1, 2, 3, 4, 5, 6, 7])))),
    CONSTRAINT profiles_primary_goal_check CHECK ((primary_goal = ANY (ARRAY['lose_weight'::text, 'build_muscle'::text, 'improve_endurance'::text, 'stay_active'::text, 'other'::text, 'gain_strength'::text]))),
    CONSTRAINT profiles_readiness_status_check CHECK ((readiness_status = ANY (ARRAY['pending'::text, 'cleared'::text, 'modified'::text, 'professional_clearance_required'::text]))),
    CONSTRAINT profiles_session_duration_minutes_check CHECK ((session_duration_minutes = ANY (ARRAY[30, 45, 60, 90]))),
    CONSTRAINT profiles_subscription_tier_check CHECK ((subscription_tier = ANY (ARRAY['free'::text, 'pro'::text])))
);

ALTER TABLE ONLY public.profiles FORCE ROW LEVEL SECURITY;


--
-- Name: COLUMN profiles.preferred_workout_days; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.profiles.preferred_workout_days IS 'Días de entrenamiento preferidos (1=lunes … 7=domingo, ISO 8601). NULL → usar DEFAULT_SCHEDULES según days_per_week. Validación adicional (unicidad, cruce con days_per_week) en capa Zod.';


--
-- Name: COLUMN profiles.timezone; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.profiles.timezone IS 'Zona horaria IANA del usuario (ej. Europe/Madrid). NULL = zona por defecto de la app.';


--
-- Name: COLUMN profiles.last_check_in_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.profiles.last_check_in_at IS 'Última revisión de datos de perfil (onboarding o ajustes). NULL = nunca.';


--
-- Name: COLUMN profiles.subscription_tier; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.profiles.subscription_tier IS 'Plan de cuenta para límites de biblioteca: free permite 1 plan guardado; pro permite ilimitados.';


--
-- Name: COLUMN profiles.language; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.profiles.language IS 'Preferred language for exercise catalog content (es or en).';


--
-- Name: COLUMN profiles.is_admin; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.profiles.is_admin IS 'Administrative access flag. Protected by trg_enforce_protected_profile_fields.';


--
-- Name: COLUMN profiles.account_status; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.profiles.account_status IS 'Access state managed by administrators: active or suspended.';


--
-- Name: progress_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.progress_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    workout_id uuid,
    completed_at timestamp with time zone DEFAULT now() NOT NULL,
    duration_minutes integer,
    notes text,
    mood_rating integer,
    energy_rating integer,
    client_session_id uuid,
    session_result_snapshot jsonb,
    session_context_snapshot jsonb,
    session_detail_backup jsonb,
    CONSTRAINT progress_logs_energy_rating_check CHECK (((energy_rating >= 1) AND (energy_rating <= 5))),
    CONSTRAINT progress_logs_mood_rating_check CHECK (((mood_rating >= 1) AND (mood_rating <= 5)))
);

ALTER TABLE ONLY public.progress_logs FORCE ROW LEVEL SECURITY;


--
-- Name: public_profiles; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.public_profiles AS
 SELECT id,
    username,
    full_name,
    avatar_url,
    is_private,
    post_count
   FROM public.profiles;


--
-- Name: session_authorizations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.session_authorizations (
    client_session_id uuid NOT NULL,
    user_id uuid NOT NULL,
    workout_id uuid NOT NULL,
    plan_id uuid NOT NULL,
    session_context_snapshot jsonb NOT NULL,
    policy_timezone text NOT NULL,
    policy_date date NOT NULL,
    policy_day_start timestamp with time zone NOT NULL,
    policy_day_end timestamp with time zone NOT NULL,
    workout_window_start timestamp with time zone NOT NULL,
    created_at timestamp with time zone NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    consumed_at timestamp with time zone,
    released_at timestamp with time zone,
    CONSTRAINT session_authorizations_consumed_check CHECK (((consumed_at IS NULL) OR (consumed_at >= created_at))),
    CONSTRAINT session_authorizations_created_in_policy_day_check CHECK (((created_at >= policy_day_start) AND (created_at < policy_day_end))),
    CONSTRAINT session_authorizations_expiry_check CHECK ((expires_at = (created_at + '12:00:00'::interval))),
    CONSTRAINT session_authorizations_policy_date_check CHECK ((policy_date = ((policy_day_start AT TIME ZONE policy_timezone))::date)),
    CONSTRAINT session_authorizations_policy_day_check CHECK ((policy_day_start < policy_day_end)),
    CONSTRAINT session_authorizations_policy_timezone_check CHECK ((policy_timezone <> ''::text)),
    CONSTRAINT session_authorizations_released_check CHECK (((released_at IS NULL) OR ((consumed_at IS NULL) AND (released_at >= created_at)))),
    CONSTRAINT session_authorizations_workout_window_check CHECK ((workout_window_start <= policy_day_start))
);

ALTER TABLE ONLY public.session_authorizations FORCE ROW LEVEL SECURITY;


--
-- Name: social_notification_preferences; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.social_notification_preferences (
    user_id uuid NOT NULL,
    likes_enabled boolean DEFAULT true NOT NULL,
    comments_enabled boolean DEFAULT true NOT NULL,
    follows_enabled boolean DEFAULT true NOT NULL,
    follow_requests_enabled boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: social_push_tokens; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.social_push_tokens (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    token text NOT NULL,
    platform text NOT NULL,
    device_id text,
    enabled boolean DEFAULT true NOT NULL,
    last_seen_at timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT social_push_tokens_platform_check CHECK ((platform = ANY (ARRAY['android'::text, 'ios'::text])))
);


--
-- Name: trainer_application_credentials; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.trainer_application_credentials (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    application_id uuid NOT NULL,
    credential_type text NOT NULL,
    title text NOT NULL,
    issuer text,
    issued_on date,
    expires_on date,
    storage_path text,
    external_url text,
    mime_type text,
    size_bytes bigint,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT trainer_application_credentials_credential_type_check CHECK ((credential_type = ANY (ARRAY['document'::text, 'link'::text]))),
    CONSTRAINT trainer_application_credentials_dates_check CHECK (((expires_on IS NULL) OR (issued_on IS NULL) OR (expires_on >= issued_on))),
    CONSTRAINT trainer_application_credentials_source_check CHECK ((((credential_type = 'document'::text) AND (storage_path IS NOT NULL) AND (external_url IS NULL) AND (mime_type = ANY (ARRAY['application/pdf'::text, 'image/jpeg'::text, 'image/png'::text])) AND ((size_bytes >= 1) AND (size_bytes <= 10485760))) OR ((credential_type = 'link'::text) AND (storage_path IS NULL) AND (external_url ~~ 'https://%'::text) AND (mime_type IS NULL) AND (size_bytes IS NULL)))),
    CONSTRAINT trainer_application_credentials_title_check CHECK (((char_length(title) >= 1) AND (char_length(title) <= 160)))
);

ALTER TABLE ONLY public.trainer_application_credentials FORCE ROW LEVEL SECURITY;


--
-- Name: TABLE trainer_application_credentials; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.trainer_application_credentials IS 'Private certification documents or HTTPS verification links for a trainer application.';


--
-- Name: trainer_application_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.trainer_application_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    application_id uuid NOT NULL,
    from_status text,
    to_status text NOT NULL,
    public_note text,
    internal_note text,
    actor_user_id uuid,
    actor_role text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT trainer_application_events_actor_role_check CHECK ((actor_role = ANY (ARRAY['applicant'::text, 'admin'::text, 'system'::text]))),
    CONSTRAINT trainer_application_events_from_status_check CHECK (((from_status IS NULL) OR (from_status = ANY (ARRAY['draft'::text, 'submitted'::text, 'under_review'::text, 'changes_requested'::text, 'interview_required'::text, 'approved'::text, 'rejected'::text, 'withdrawn'::text])))),
    CONSTRAINT trainer_application_events_to_status_check CHECK ((to_status = ANY (ARRAY['draft'::text, 'submitted'::text, 'under_review'::text, 'changes_requested'::text, 'interview_required'::text, 'approved'::text, 'rejected'::text, 'withdrawn'::text])))
);

ALTER TABLE ONLY public.trainer_application_events FORCE ROW LEVEL SECURITY;


--
-- Name: TABLE trainer_application_events; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.trainer_application_events IS 'Append-oriented trainer application status history including private administrative notes.';


--
-- Name: trainer_applications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.trainer_applications (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    application_kind text DEFAULT 'initial'::text NOT NULL,
    source_profile_id uuid,
    credential_source_application_id uuid,
    status text DEFAULT 'draft'::text NOT NULL,
    professional_name text DEFAULT ''::text NOT NULL,
    professional_photo_url text,
    bio text DEFAULT ''::text NOT NULL,
    specialties text[] DEFAULT '{}'::text[] NOT NULL,
    modalities text[] DEFAULT '{}'::text[] NOT NULL,
    experience_summary text DEFAULT ''::text NOT NULL,
    general_location text,
    languages text[] DEFAULT '{}'::text[] NOT NULL,
    contact_email text DEFAULT ''::text NOT NULL,
    contact_phone text,
    preferred_contact text DEFAULT 'email'::text NOT NULL,
    timezone text DEFAULT 'UTC'::text NOT NULL,
    interview_availability text DEFAULT ''::text NOT NULL,
    submitted_at timestamp with time zone,
    decided_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT trainer_applications_application_kind_check CHECK ((application_kind = ANY (ARRAY['initial'::text, 'profile_update'::text]))),
    CONSTRAINT trainer_applications_modalities_check CHECK ((modalities <@ ARRAY['online'::text, 'in_person'::text, 'hybrid'::text])),
    CONSTRAINT trainer_applications_preferred_contact_check CHECK ((preferred_contact = ANY (ARRAY['email'::text, 'phone'::text, 'whatsapp'::text]))),
    CONSTRAINT trainer_applications_profile_update_references_check CHECK ((((application_kind = 'initial'::text) AND (source_profile_id IS NULL) AND (credential_source_application_id IS NULL)) OR ((application_kind = 'profile_update'::text) AND (source_profile_id IS NOT NULL) AND (credential_source_application_id IS NOT NULL)))),
    CONSTRAINT trainer_applications_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'submitted'::text, 'under_review'::text, 'changes_requested'::text, 'interview_required'::text, 'approved'::text, 'rejected'::text, 'withdrawn'::text])))
);

ALTER TABLE ONLY public.trainer_applications FORCE ROW LEVEL SECURITY;


--
-- Name: TABLE trainer_applications; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.trainer_applications IS 'Private trainer applications containing professional, contact and interview availability data.';


--
-- Name: trainer_application_events_public; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.trainer_application_events_public WITH (security_barrier='true') AS
 SELECT event.id,
    event.application_id,
    event.from_status,
    event.to_status,
    event.public_note,
    event.actor_user_id,
    event.actor_role,
    event.created_at
   FROM (public.trainer_application_events event
     JOIN public.trainer_applications application ON ((application.id = event.application_id)))
  WHERE ((application.user_id = auth.uid()) AND public.is_account_active(auth.uid()));


--
-- Name: VIEW trainer_application_events_public; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON VIEW public.trainer_application_events_public IS 'Applicant-safe application history that intentionally omits internal_note.';


--
-- Name: trainer_assignment_versions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.trainer_assignment_versions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    assignment_id uuid NOT NULL,
    version_number integer NOT NULL,
    snapshot jsonb NOT NULL,
    change_summary text,
    status text DEFAULT 'proposed'::text NOT NULL,
    effective_from timestamp with time zone DEFAULT now() NOT NULL,
    effective_to timestamp with time zone,
    materialized_plan_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    revision_idempotency_key text,
    CONSTRAINT trainer_assignment_versions_change_summary_check CHECK (((change_summary IS NULL) OR ((char_length(btrim(change_summary)) >= 1) AND (char_length(btrim(change_summary)) <= 1000)))),
    CONSTRAINT trainer_assignment_versions_effective_range CHECK (((effective_to IS NULL) OR (effective_to > effective_from))),
    CONSTRAINT trainer_assignment_versions_revision_idempotency_key_check CHECK (((revision_idempotency_key IS NULL) OR ((char_length(btrim(revision_idempotency_key)) >= 1) AND (char_length(btrim(revision_idempotency_key)) <= 200)))),
    CONSTRAINT trainer_assignment_versions_snapshot_check CHECK (((jsonb_typeof(snapshot) = 'object'::text) AND ((snapshot ->> 'schemaVersion'::text) = '1'::text))),
    CONSTRAINT trainer_assignment_versions_status_check CHECK ((status = ANY (ARRAY['proposed'::text, 'active'::text, 'superseded'::text, 'frozen'::text, 'cancelled'::text]))),
    CONSTRAINT trainer_assignment_versions_version_number_check CHECK ((version_number >= 1))
);

ALTER TABLE ONLY public.trainer_assignment_versions FORCE ROW LEVEL SECURITY;


--
-- Name: trainer_credential_storage_cleanup; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.trainer_credential_storage_cleanup (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    application_id uuid NOT NULL,
    credential_id uuid NOT NULL,
    storage_path text NOT NULL,
    reason text NOT NULL,
    attempt_count integer DEFAULT 0 NOT NULL,
    last_error text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT trainer_credential_storage_cleanup_attempt_count_check CHECK ((attempt_count >= 0)),
    CONSTRAINT trainer_credential_storage_cleanup_owner_path_check CHECK ((storage_path ~~ ((((((user_id)::text || '/'::text) || (application_id)::text) || '/'::text) || (credential_id)::text) || '.%'::text))),
    CONSTRAINT trainer_credential_storage_cleanup_reason_check CHECK ((reason = ANY (ARRAY['upload_rollback'::text, 'user_removal'::text])))
);

ALTER TABLE ONLY public.trainer_credential_storage_cleanup FORCE ROW LEVEL SECURITY;


--
-- Name: trainer_interviews; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.trainer_interviews (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    application_id uuid NOT NULL,
    proposed_at timestamp with time zone NOT NULL,
    timezone text NOT NULL,
    medium text NOT NULL,
    external_url text,
    status text DEFAULT 'proposed'::text NOT NULL,
    outcome text,
    public_note text,
    internal_note text,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT trainer_interviews_external_url_check CHECK (((external_url IS NULL) OR (external_url ~~ 'https://%'::text))),
    CONSTRAINT trainer_interviews_medium_check CHECK ((medium = ANY (ARRAY['video_call'::text, 'phone'::text, 'in_person'::text]))),
    CONSTRAINT trainer_interviews_status_check CHECK ((status = ANY (ARRAY['proposed'::text, 'scheduled'::text, 'completed'::text, 'cancelled'::text])))
);

ALTER TABLE ONLY public.trainer_interviews FORCE ROW LEVEL SECURITY;


--
-- Name: TABLE trainer_interviews; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.trainer_interviews IS 'Private proposed trainer interviews, external meeting details and outcomes.';


--
-- Name: trainer_interviews_applicant_public; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.trainer_interviews_applicant_public WITH (security_barrier='true') AS
 SELECT interview.id,
    interview.application_id,
    interview.proposed_at,
    interview.timezone,
    interview.medium,
    interview.external_url,
    interview.status,
    interview.public_note,
    interview.created_at,
    interview.updated_at
   FROM (public.trainer_interviews interview
     JOIN public.trainer_applications application ON ((application.id = interview.application_id)))
  WHERE ((application.user_id = auth.uid()) AND public.is_account_active(auth.uid()));


--
-- Name: VIEW trainer_interviews_applicant_public; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON VIEW public.trainer_interviews_applicant_public IS 'Owner-filtered interview schedule for applicants; omits outcome, internal_note and creator identity.';


--
-- Name: trainer_plan_assignments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.trainer_plan_assignments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    relationship_id uuid NOT NULL,
    trainer_user_id uuid NOT NULL,
    client_user_id uuid NOT NULL,
    source_template_id uuid,
    status text DEFAULT 'proposed'::text NOT NULL,
    accepted_at timestamp with time zone,
    active_version_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    proposal_idempotency_key text,
    acceptance_idempotency_key text,
    decline_idempotency_key text,
    CONSTRAINT trainer_plan_assignments_acceptance_idempotency_key_check CHECK (((acceptance_idempotency_key IS NULL) OR ((char_length(btrim(acceptance_idempotency_key)) >= 1) AND (char_length(btrim(acceptance_idempotency_key)) <= 200)))),
    CONSTRAINT trainer_plan_assignments_client_trainer_distinct CHECK ((client_user_id <> trainer_user_id)),
    CONSTRAINT trainer_plan_assignments_decline_idempotency_key_check CHECK (((decline_idempotency_key IS NULL) OR ((char_length(btrim(decline_idempotency_key)) >= 1) AND (char_length(btrim(decline_idempotency_key)) <= 200)))),
    CONSTRAINT trainer_plan_assignments_proposal_idempotency_key_check CHECK (((proposal_idempotency_key IS NULL) OR ((char_length(btrim(proposal_idempotency_key)) >= 1) AND (char_length(btrim(proposal_idempotency_key)) <= 200)))),
    CONSTRAINT trainer_plan_assignments_status_check CHECK ((status = ANY (ARRAY['proposed'::text, 'active'::text, 'superseded'::text, 'frozen'::text, 'cancelled'::text])))
);

ALTER TABLE ONLY public.trainer_plan_assignments FORCE ROW LEVEL SECURITY;


--
-- Name: trainer_program_templates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.trainer_program_templates (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    trainer_user_id uuid NOT NULL,
    name text NOT NULL,
    goal text,
    description text,
    days_per_week integer NOT NULL,
    status text DEFAULT 'draft'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT trainer_program_templates_days_per_week_check CHECK (((days_per_week >= 1) AND (days_per_week <= 7))),
    CONSTRAINT trainer_program_templates_description_check CHECK (((description IS NULL) OR ((char_length(btrim(description)) >= 1) AND (char_length(btrim(description)) <= 2000)))),
    CONSTRAINT trainer_program_templates_goal_check CHECK (((goal IS NULL) OR ((char_length(btrim(goal)) >= 1) AND (char_length(btrim(goal)) <= 240)))),
    CONSTRAINT trainer_program_templates_name_check CHECK (((char_length(btrim(name)) >= 1) AND (char_length(btrim(name)) <= 120))),
    CONSTRAINT trainer_program_templates_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'active'::text, 'archived'::text])))
);

ALTER TABLE ONLY public.trainer_program_templates FORCE ROW LEVEL SECURITY;


--
-- Name: trainer_template_exercises; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.trainer_template_exercises (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    template_workout_id uuid NOT NULL,
    exercise_id uuid NOT NULL,
    order_index integer NOT NULL,
    sets integer NOT NULL,
    reps integer NOT NULL,
    weight_kg numeric(8,2),
    target_rpe numeric(3,1),
    rest_seconds integer NOT NULL,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT trainer_template_exercises_notes_check CHECK (((notes IS NULL) OR (char_length(btrim(notes)) <= 1000))),
    CONSTRAINT trainer_template_exercises_order_index_check CHECK (((order_index >= 1) AND (order_index <= 30))),
    CONSTRAINT trainer_template_exercises_reps_check CHECK (((reps >= 1) AND (reps <= 100))),
    CONSTRAINT trainer_template_exercises_rest_seconds_check CHECK (((rest_seconds >= 0) AND (rest_seconds <= 3600))),
    CONSTRAINT trainer_template_exercises_sets_check CHECK (((sets >= 1) AND (sets <= 20))),
    CONSTRAINT trainer_template_exercises_target_rpe_check CHECK (((target_rpe IS NULL) OR ((target_rpe >= (1)::numeric) AND (target_rpe <= (10)::numeric)))),
    CONSTRAINT trainer_template_exercises_weight_kg_check CHECK (((weight_kg IS NULL) OR ((weight_kg >= (0)::numeric) AND (weight_kg <= (1000)::numeric))))
);

ALTER TABLE ONLY public.trainer_template_exercises FORCE ROW LEVEL SECURITY;


--
-- Name: trainer_template_workouts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.trainer_template_workouts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    template_id uuid NOT NULL,
    name text NOT NULL,
    day_of_week integer NOT NULL,
    order_in_plan integer NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT trainer_template_workouts_day_of_week_check CHECK (((day_of_week >= 1) AND (day_of_week <= 7))),
    CONSTRAINT trainer_template_workouts_name_check CHECK (((char_length(btrim(name)) >= 1) AND (char_length(btrim(name)) <= 120))),
    CONSTRAINT trainer_template_workouts_order_in_plan_check CHECK (((order_in_plan >= 1) AND (order_in_plan <= 7)))
);

ALTER TABLE ONLY public.trainer_template_workouts FORCE ROW LEVEL SECURITY;


--
-- Name: user_blocks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_blocks (
    blocker_id uuid NOT NULL,
    blocked_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT no_self_block CHECK ((blocker_id <> blocked_id))
);


--
-- Name: workout_exercises; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.workout_exercises (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workout_id uuid NOT NULL,
    exercise_id uuid NOT NULL,
    order_index integer DEFAULT 0 NOT NULL,
    sets integer DEFAULT 3,
    reps integer,
    duration_seconds integer,
    rest_seconds integer DEFAULT 60,
    weight_kg numeric(6,2),
    notes text,
    target_rpe numeric(3,1),
    weight_suggestion_basis text,
    CONSTRAINT workout_exercises_target_rpe_check CHECK (((target_rpe >= (1)::numeric) AND (target_rpe <= (10)::numeric))),
    CONSTRAINT workout_exercises_weight_suggestion_basis_check CHECK ((weight_suggestion_basis = ANY (ARRAY['user_baseline_pending'::text, 'estimated_from_profile'::text, 'based_on_previous_logs'::text])))
);

ALTER TABLE ONLY public.workout_exercises FORCE ROW LEVEL SECURITY;


--
-- Name: COLUMN workout_exercises.target_rpe; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.workout_exercises.target_rpe IS 'RPE objetivo (1-10) asignado por la IA. El usuario registra el RPE real en exercise_logs.';


--
-- Name: COLUMN workout_exercises.weight_suggestion_basis; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.workout_exercises.weight_suggestion_basis IS 'Origen de la sugerencia de peso: user_baseline_pending   = sin datos, usuario establece baseline; estimated_from_profile  = estimado por perfil (solo avanzados, semana 1); based_on_previous_logs  = calculado a partir de logs reales.';


--
-- Name: workouts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.workouts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    plan_id uuid,
    user_id uuid NOT NULL,
    name text NOT NULL,
    day_of_week integer,
    order_in_plan integer,
    estimated_duration_minutes integer,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    focus text,
    CONSTRAINT workouts_day_of_week_check CHECK (((day_of_week >= 1) AND (day_of_week <= 7)))
);

ALTER TABLE ONLY public.workouts FORCE ROW LEVEL SECURITY;


--
-- Name: COLUMN workouts.day_of_week; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.workouts.day_of_week IS 'Día de la semana: 1=lunes, 2=martes, … 7=domingo (ISO 8601). Asignado por assignDaysOfWeek() en el backend, no por la IA.';


--
-- Name: COLUMN workouts.focus; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.workouts.focus IS 'Grupos musculares principales del día en español. Ej: "Cuádriceps · Glúteos · Core". Generado por IA.';


--
-- Name: profile_weight_sync_context profile_weight_sync_context_pkey; Type: CONSTRAINT; Schema: private; Owner: -
--

ALTER TABLE ONLY private.profile_weight_sync_context
    ADD CONSTRAINT profile_weight_sync_context_pkey PRIMARY KEY (transaction_id, backend_pid, profile_id);


--
-- Name: session_completion_analytics_state session_completion_analytics_state_pkey; Type: CONSTRAINT; Schema: private; Owner: -
--

ALTER TABLE ONLY private.session_completion_analytics_state
    ADD CONSTRAINT session_completion_analytics_state_pkey PRIMARY KEY (user_id);


--
-- Name: admin_audit_logs admin_audit_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin_audit_logs
    ADD CONSTRAINT admin_audit_logs_pkey PRIMARY KEY (id);


--
-- Name: ai_conversations ai_conversations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_conversations
    ADD CONSTRAINT ai_conversations_pkey PRIMARY KEY (id);


--
-- Name: ai_messages ai_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_messages
    ADD CONSTRAINT ai_messages_pkey PRIMARY KEY (id);


--
-- Name: ai_usage_logs ai_usage_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_usage_logs
    ADD CONSTRAINT ai_usage_logs_pkey PRIMARY KEY (id);


--
-- Name: coaching_consents coaching_consents_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.coaching_consents
    ADD CONSTRAINT coaching_consents_pkey PRIMARY KEY (id);


--
-- Name: coaching_relationships coaching_relationships_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.coaching_relationships
    ADD CONSTRAINT coaching_relationships_pkey PRIMARY KEY (id);


--
-- Name: coaching_relationships coaching_relationships_source_request_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.coaching_relationships
    ADD CONSTRAINT coaching_relationships_source_request_id_key UNIQUE (source_request_id);


--
-- Name: coaching_requests coaching_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.coaching_requests
    ADD CONSTRAINT coaching_requests_pkey PRIMARY KEY (id);


--
-- Name: dashboard_banners dashboard_banners_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dashboard_banners
    ADD CONSTRAINT dashboard_banners_pkey PRIMARY KEY (slot);


--
-- Name: exercise_logs exercise_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exercise_logs
    ADD CONSTRAINT exercise_logs_pkey PRIMARY KEY (id);


--
-- Name: exercises exercises_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exercises
    ADD CONSTRAINT exercises_pkey PRIMARY KEY (id);


--
-- Name: exercises exercises_wger_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exercises
    ADD CONSTRAINT exercises_wger_id_key UNIQUE (wger_id);


--
-- Name: follows follows_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.follows
    ADD CONSTRAINT follows_pkey PRIMARY KEY (follower_id, following_id);


--
-- Name: measurements measurements_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.measurements
    ADD CONSTRAINT measurements_pkey PRIMARY KEY (id);


--
-- Name: notification_attention_dismissals notification_attention_dismissals_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_attention_dismissals
    ADD CONSTRAINT notification_attention_dismissals_pkey PRIMARY KEY (user_id, notice_key);


--
-- Name: plan_generation_events plan_generation_events_generator_check; Type: CHECK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE public.plan_generation_events
    ADD CONSTRAINT plan_generation_events_generator_check CHECK ((generator = 'evidence_engine'::text)) NOT VALID;


--
-- Name: plan_generation_events plan_generation_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.plan_generation_events
    ADD CONSTRAINT plan_generation_events_pkey PRIMARY KEY (id);


--
-- Name: plan_generation_events plan_generation_events_plan_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.plan_generation_events
    ADD CONSTRAINT plan_generation_events_plan_id_key UNIQUE (plan_id);


--
-- Name: post_comments post_comments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.post_comments
    ADD CONSTRAINT post_comments_pkey PRIMARY KEY (id);


--
-- Name: post_likes post_likes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.post_likes
    ADD CONSTRAINT post_likes_pkey PRIMARY KEY (post_id, user_id);


--
-- Name: post_reports post_reports_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.post_reports
    ADD CONSTRAINT post_reports_pkey PRIMARY KEY (id);


--
-- Name: posts posts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.posts
    ADD CONSTRAINT posts_pkey PRIMARY KEY (id);


--
-- Name: product_events product_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_events
    ADD CONSTRAINT product_events_pkey PRIMARY KEY (id);


--
-- Name: product_notification_preferences product_notification_preferences_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_notification_preferences
    ADD CONSTRAINT product_notification_preferences_pkey PRIMARY KEY (user_id);


--
-- Name: product_notifications product_notifications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_notifications
    ADD CONSTRAINT product_notifications_pkey PRIMARY KEY (id);


--
-- Name: product_notifications product_notifications_user_dedupe_key_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_notifications
    ADD CONSTRAINT product_notifications_user_dedupe_key_unique UNIQUE (user_id, dedupe_key);


--
-- Name: product_push_tokens product_push_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_push_tokens
    ADD CONSTRAINT product_push_tokens_pkey PRIMARY KEY (id);


--
-- Name: product_push_tokens product_push_tokens_token_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_push_tokens
    ADD CONSTRAINT product_push_tokens_token_key UNIQUE (token);


--
-- Name: product_push_tokens product_push_tokens_user_device_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_push_tokens
    ADD CONSTRAINT product_push_tokens_user_device_unique UNIQUE (user_id, device_id);


--
-- Name: professional_audit_logs professional_audit_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.professional_audit_logs
    ADD CONSTRAINT professional_audit_logs_pkey PRIMARY KEY (id);


--
-- Name: profiles profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_pkey PRIMARY KEY (id);


--
-- Name: profiles profiles_username_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_username_key UNIQUE (username);


--
-- Name: progress_logs progress_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.progress_logs
    ADD CONSTRAINT progress_logs_pkey PRIMARY KEY (id);


--
-- Name: session_authorizations session_authorizations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.session_authorizations
    ADD CONSTRAINT session_authorizations_pkey PRIMARY KEY (client_session_id);


--
-- Name: social_notification_preferences social_notification_preferences_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.social_notification_preferences
    ADD CONSTRAINT social_notification_preferences_pkey PRIMARY KEY (user_id);


--
-- Name: social_push_tokens social_push_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.social_push_tokens
    ADD CONSTRAINT social_push_tokens_pkey PRIMARY KEY (id);


--
-- Name: social_push_tokens social_push_tokens_token_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.social_push_tokens
    ADD CONSTRAINT social_push_tokens_token_key UNIQUE (token);


--
-- Name: trainer_application_credentials trainer_application_credentials_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trainer_application_credentials
    ADD CONSTRAINT trainer_application_credentials_pkey PRIMARY KEY (id);


--
-- Name: trainer_application_credentials trainer_application_credentials_storage_path_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trainer_application_credentials
    ADD CONSTRAINT trainer_application_credentials_storage_path_unique UNIQUE (storage_path);


--
-- Name: trainer_application_events trainer_application_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trainer_application_events
    ADD CONSTRAINT trainer_application_events_pkey PRIMARY KEY (id);


--
-- Name: trainer_applications trainer_applications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trainer_applications
    ADD CONSTRAINT trainer_applications_pkey PRIMARY KEY (id);


--
-- Name: trainer_assignment_versions trainer_assignment_versions_assignment_version_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trainer_assignment_versions
    ADD CONSTRAINT trainer_assignment_versions_assignment_version_unique UNIQUE (assignment_id, version_number);


--
-- Name: trainer_assignment_versions trainer_assignment_versions_materialized_plan_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trainer_assignment_versions
    ADD CONSTRAINT trainer_assignment_versions_materialized_plan_id_key UNIQUE (materialized_plan_id);


--
-- Name: trainer_assignment_versions trainer_assignment_versions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trainer_assignment_versions
    ADD CONSTRAINT trainer_assignment_versions_pkey PRIMARY KEY (id);


--
-- Name: trainer_credential_storage_cleanup trainer_credential_storage_cleanup_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trainer_credential_storage_cleanup
    ADD CONSTRAINT trainer_credential_storage_cleanup_pkey PRIMARY KEY (id);


--
-- Name: trainer_credential_storage_cleanup trainer_credential_storage_cleanup_storage_path_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trainer_credential_storage_cleanup
    ADD CONSTRAINT trainer_credential_storage_cleanup_storage_path_key UNIQUE (storage_path);


--
-- Name: trainer_interviews trainer_interviews_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trainer_interviews
    ADD CONSTRAINT trainer_interviews_pkey PRIMARY KEY (id);


--
-- Name: trainer_plan_assignments trainer_plan_assignments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trainer_plan_assignments
    ADD CONSTRAINT trainer_plan_assignments_pkey PRIMARY KEY (id);


--
-- Name: trainer_profiles trainer_profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trainer_profiles
    ADD CONSTRAINT trainer_profiles_pkey PRIMARY KEY (id);


--
-- Name: trainer_profiles trainer_profiles_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trainer_profiles
    ADD CONSTRAINT trainer_profiles_slug_key UNIQUE (slug);


--
-- Name: trainer_profiles trainer_profiles_source_application_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trainer_profiles
    ADD CONSTRAINT trainer_profiles_source_application_id_key UNIQUE (source_application_id);


--
-- Name: trainer_profiles trainer_profiles_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trainer_profiles
    ADD CONSTRAINT trainer_profiles_user_id_key UNIQUE (user_id);


--
-- Name: trainer_program_templates trainer_program_templates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trainer_program_templates
    ADD CONSTRAINT trainer_program_templates_pkey PRIMARY KEY (id);


--
-- Name: trainer_service_offerings trainer_service_offerings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trainer_service_offerings
    ADD CONSTRAINT trainer_service_offerings_pkey PRIMARY KEY (id);


--
-- Name: trainer_template_exercises trainer_template_exercises_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trainer_template_exercises
    ADD CONSTRAINT trainer_template_exercises_pkey PRIMARY KEY (id);


--
-- Name: trainer_template_exercises trainer_template_exercises_workout_order_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trainer_template_exercises
    ADD CONSTRAINT trainer_template_exercises_workout_order_unique UNIQUE (template_workout_id, order_index) DEFERRABLE;


--
-- Name: trainer_template_workouts trainer_template_workouts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trainer_template_workouts
    ADD CONSTRAINT trainer_template_workouts_pkey PRIMARY KEY (id);


--
-- Name: trainer_template_workouts trainer_template_workouts_template_day_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trainer_template_workouts
    ADD CONSTRAINT trainer_template_workouts_template_day_unique UNIQUE (template_id, day_of_week);


--
-- Name: trainer_template_workouts trainer_template_workouts_template_order_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trainer_template_workouts
    ADD CONSTRAINT trainer_template_workouts_template_order_unique UNIQUE (template_id, order_in_plan) DEFERRABLE;


--
-- Name: user_blocks user_blocks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_blocks
    ADD CONSTRAINT user_blocks_pkey PRIMARY KEY (blocker_id, blocked_id);


--
-- Name: workout_exercises workout_exercises_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workout_exercises
    ADD CONSTRAINT workout_exercises_pkey PRIMARY KEY (id);


--
-- Name: workout_plans workout_plans_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workout_plans
    ADD CONSTRAINT workout_plans_pkey PRIMARY KEY (id);


--
-- Name: workouts workouts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workouts
    ADD CONSTRAINT workouts_pkey PRIMARY KEY (id);


--
-- Name: coaching_consents_active_scope_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX coaching_consents_active_scope_idx ON public.coaching_consents USING btree (relationship_id, scope) WHERE (revoked_at IS NULL);


--
-- Name: coaching_consents_active_scope_lookup_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX coaching_consents_active_scope_lookup_idx ON public.coaching_consents USING btree (relationship_id, scope, granted_at DESC, id DESC) WHERE (revoked_at IS NULL);


--
-- Name: coaching_consents_one_active_scope; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX coaching_consents_one_active_scope ON public.coaching_consents USING btree (relationship_id, scope) WHERE (revoked_at IS NULL);


--
-- Name: coaching_relationships_client_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX coaching_relationships_client_status_idx ON public.coaching_relationships USING btree (client_user_id, status, created_at DESC, id DESC);


--
-- Name: coaching_relationships_one_active_client; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX coaching_relationships_one_active_client ON public.coaching_relationships USING btree (client_user_id) WHERE (status = 'active'::text);


--
-- Name: coaching_relationships_trainer_active_started_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX coaching_relationships_trainer_active_started_idx ON public.coaching_relationships USING btree (trainer_user_id, started_at DESC, id DESC) WHERE (status = 'active'::text);


--
-- Name: coaching_relationships_trainer_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX coaching_relationships_trainer_status_idx ON public.coaching_relationships USING btree (trainer_user_id, status, created_at DESC, id DESC);


--
-- Name: coaching_requests_client_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX coaching_requests_client_created_idx ON public.coaching_requests USING btree (client_user_id, created_at DESC, id DESC);


--
-- Name: coaching_requests_client_idempotency_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX coaching_requests_client_idempotency_key ON public.coaching_requests USING btree (client_user_id, idempotency_key);


--
-- Name: coaching_requests_one_pending_equivalent; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX coaching_requests_one_pending_equivalent ON public.coaching_requests USING btree (client_user_id, trainer_user_id, service_id) WHERE (status = 'pending'::text);


--
-- Name: coaching_requests_trainer_pending_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX coaching_requests_trainer_pending_created_idx ON public.coaching_requests USING btree (trainer_user_id, created_at DESC, id DESC) WHERE (status = 'pending'::text);


--
-- Name: idx_admin_audit_logs_target_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_admin_audit_logs_target_created ON public.admin_audit_logs USING btree (target_user_id, created_at DESC);


--
-- Name: idx_ai_conversations_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ai_conversations_user ON public.ai_conversations USING btree (user_id);


--
-- Name: idx_ai_messages_conversation; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ai_messages_conversation ON public.ai_messages USING btree (conversation_id);


--
-- Name: idx_ai_usage_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ai_usage_created ON public.ai_usage_logs USING btree (created_at DESC);


--
-- Name: idx_ai_usage_operation_success; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ai_usage_operation_success ON public.ai_usage_logs USING btree (operation, success, created_at DESC);


--
-- Name: idx_ai_usage_user_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ai_usage_user_created ON public.ai_usage_logs USING btree (user_id, created_at DESC);


--
-- Name: idx_exercise_logs_exercise; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_exercise_logs_exercise ON public.exercise_logs USING btree (exercise_id);


--
-- Name: idx_exercise_logs_exercise_progress; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_exercise_logs_exercise_progress ON public.exercise_logs USING btree (exercise_id, progress_log_id);


--
-- Name: idx_exercise_logs_progress; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_exercise_logs_progress ON public.exercise_logs USING btree (progress_log_id);


--
-- Name: idx_exercise_logs_progress_exercise; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_exercise_logs_progress_exercise ON public.exercise_logs USING btree (progress_log_id, exercise_id);


--
-- Name: idx_exercises_difficulty; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_exercises_difficulty ON public.exercises USING btree (difficulty);


--
-- Name: idx_exercises_muscles; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_exercises_muscles ON public.exercises USING gin (muscle_groups);


--
-- Name: idx_exercises_source_external; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_exercises_source_external ON public.exercises USING btree (source, external_id) WHERE ((source IS NOT NULL) AND (external_id IS NOT NULL));


--
-- Name: idx_exercises_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_exercises_type ON public.exercises USING btree (exercise_type);


--
-- Name: idx_exercises_wger_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_exercises_wger_id ON public.exercises USING btree (wger_id) WHERE (wger_id IS NOT NULL);


--
-- Name: idx_follows_following; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_follows_following ON public.follows USING btree (following_id);


--
-- Name: idx_follows_following_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_follows_following_status ON public.follows USING btree (following_id, status);


--
-- Name: idx_measurements_recorded_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_measurements_recorded_at ON public.measurements USING btree (recorded_at DESC);


--
-- Name: idx_measurements_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_measurements_user ON public.measurements USING btree (user_id);


--
-- Name: idx_plan_generation_events_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_plan_generation_events_created ON public.plan_generation_events USING btree (created_at DESC);


--
-- Name: idx_plan_generation_events_user_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_plan_generation_events_user_created ON public.plan_generation_events USING btree (user_id, created_at DESC);


--
-- Name: idx_post_comments_post; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_post_comments_post ON public.post_comments USING btree (post_id, created_at);


--
-- Name: idx_posts_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_posts_created ON public.posts USING btree (created_at DESC, id DESC);


--
-- Name: idx_posts_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_posts_user ON public.posts USING btree (user_id);


--
-- Name: idx_progress_logs_completed_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_progress_logs_completed_at ON public.progress_logs USING btree (completed_at DESC);


--
-- Name: idx_progress_logs_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_progress_logs_user ON public.progress_logs USING btree (user_id);


--
-- Name: idx_progress_logs_user_completed; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_progress_logs_user_completed ON public.progress_logs USING btree (user_id, completed_at DESC);


--
-- Name: idx_progress_logs_user_workout_completed; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_progress_logs_user_workout_completed ON public.progress_logs USING btree (user_id, workout_id, completed_at DESC) WHERE (workout_id IS NOT NULL);


--
-- Name: idx_social_push_tokens_user_enabled; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_social_push_tokens_user_enabled ON public.social_push_tokens USING btree (user_id, enabled);


--
-- Name: idx_user_blocks_blocked; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_blocks_blocked ON public.user_blocks USING btree (blocked_id, blocker_id);


--
-- Name: idx_workout_exercises_exercise; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_workout_exercises_exercise ON public.workout_exercises USING btree (exercise_id);


--
-- Name: idx_workout_exercises_weight_basis; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_workout_exercises_weight_basis ON public.workout_exercises USING btree (weight_suggestion_basis) WHERE (weight_suggestion_basis IS NOT NULL);


--
-- Name: idx_workout_exercises_workout; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_workout_exercises_workout ON public.workout_exercises USING btree (workout_id);


--
-- Name: idx_workout_exercises_workout_order; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_workout_exercises_workout_order ON public.workout_exercises USING btree (workout_id, order_index);


--
-- Name: idx_workout_plans_one_active_per_user; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_workout_plans_one_active_per_user ON public.workout_plans USING btree (user_id) WHERE (is_active = true);


--
-- Name: idx_workout_plans_parent; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_workout_plans_parent ON public.workout_plans USING btree (parent_plan_id) WHERE (parent_plan_id IS NOT NULL);


--
-- Name: idx_workout_plans_source_post; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_workout_plans_source_post ON public.workout_plans USING btree (source_post_id) WHERE (source_post_id IS NOT NULL);


--
-- Name: idx_workout_plans_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_workout_plans_user ON public.workout_plans USING btree (user_id);


--
-- Name: idx_workout_plans_user_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_workout_plans_user_active ON public.workout_plans USING btree (user_id, is_active) WHERE (is_active = true);


--
-- Name: idx_workout_plans_user_active_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_workout_plans_user_active_created ON public.workout_plans USING btree (user_id, is_active, created_at DESC);


--
-- Name: idx_workout_plans_user_context_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_workout_plans_user_context_created ON public.workout_plans USING btree (user_id, plan_context, created_at DESC);


--
-- Name: idx_workout_plans_user_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_workout_plans_user_created ON public.workout_plans USING btree (user_id, created_at DESC);


--
-- Name: idx_workouts_plan; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_workouts_plan ON public.workouts USING btree (plan_id);


--
-- Name: idx_workouts_plan_day_order; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_workouts_plan_day_order ON public.workouts USING btree (plan_id, day_of_week, order_in_plan) WHERE (plan_id IS NOT NULL);


--
-- Name: idx_workouts_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_workouts_user ON public.workouts USING btree (user_id);


--
-- Name: product_events_name_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX product_events_name_idx ON public.product_events USING btree (event_name, occurred_at DESC);


--
-- Name: product_events_occurred_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX product_events_occurred_at_idx ON public.product_events USING btree (occurred_at DESC);


--
-- Name: product_notifications_user_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX product_notifications_user_created_idx ON public.product_notifications USING btree (user_id, created_at DESC, id DESC);


--
-- Name: product_notifications_user_unread_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX product_notifications_user_unread_idx ON public.product_notifications USING btree (user_id, created_at DESC) WHERE (read_at IS NULL);


--
-- Name: product_notifications_user_visible_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX product_notifications_user_visible_created_idx ON public.product_notifications USING btree (user_id, created_at DESC, id DESC) WHERE (dismissed_at IS NULL);


--
-- Name: product_push_tokens_user_enabled_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX product_push_tokens_user_enabled_idx ON public.product_push_tokens USING btree (user_id, enabled, last_seen_at DESC);


--
-- Name: professional_audit_logs_entity_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX professional_audit_logs_entity_created_idx ON public.professional_audit_logs USING btree (entity_type, entity_id, created_at DESC);


--
-- Name: professional_audit_logs_subject_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX professional_audit_logs_subject_created_idx ON public.professional_audit_logs USING btree (subject_user_id, created_at DESC);


--
-- Name: progress_logs_user_client_session_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX progress_logs_user_client_session_unique ON public.progress_logs USING btree (user_id, client_session_id) WHERE (client_session_id IS NOT NULL);


--
-- Name: progress_logs_user_completed_insights_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX progress_logs_user_completed_insights_idx ON public.progress_logs USING btree (user_id, completed_at DESC, id DESC);


--
-- Name: session_authorizations_user_expiry_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX session_authorizations_user_expiry_idx ON public.session_authorizations USING btree (user_id, expires_at DESC);


--
-- Name: session_authorizations_user_policy_consumed_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX session_authorizations_user_policy_consumed_idx ON public.session_authorizations USING btree (user_id, policy_date, consumed_at, released_at);


--
-- Name: session_authorizations_user_policy_live_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX session_authorizations_user_policy_live_unique ON public.session_authorizations USING btree (user_id, policy_date) WHERE ((consumed_at IS NULL) AND (released_at IS NULL));


--
-- Name: trainer_application_credentials_application_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX trainer_application_credentials_application_created_idx ON public.trainer_application_credentials USING btree (application_id, created_at, id);


--
-- Name: trainer_application_events_application_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX trainer_application_events_application_created_idx ON public.trainer_application_events USING btree (application_id, created_at, id);


--
-- Name: trainer_applications_one_open_per_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX trainer_applications_one_open_per_user_idx ON public.trainer_applications USING btree (user_id) WHERE (status = ANY (ARRAY['draft'::text, 'submitted'::text, 'under_review'::text, 'changes_requested'::text, 'interview_required'::text]));


--
-- Name: trainer_applications_status_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX trainer_applications_status_created_idx ON public.trainer_applications USING btree (status, created_at DESC, id DESC);


--
-- Name: trainer_assignment_versions_assignment_effective_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX trainer_assignment_versions_assignment_effective_idx ON public.trainer_assignment_versions USING btree (assignment_id, effective_from DESC, effective_to, id DESC);


--
-- Name: trainer_assignment_versions_assignment_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX trainer_assignment_versions_assignment_idx ON public.trainer_assignment_versions USING btree (assignment_id, version_number DESC, id DESC);


--
-- Name: trainer_assignment_versions_revision_idempotency_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX trainer_assignment_versions_revision_idempotency_unique ON public.trainer_assignment_versions USING btree (assignment_id, revision_idempotency_key) WHERE (revision_idempotency_key IS NOT NULL);


--
-- Name: trainer_credential_storage_cleanup_user_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX trainer_credential_storage_cleanup_user_created_idx ON public.trainer_credential_storage_cleanup USING btree (user_id, created_at, id);


--
-- Name: trainer_interviews_application_proposed_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX trainer_interviews_application_proposed_idx ON public.trainer_interviews USING btree (application_id, proposed_at DESC, id DESC);


--
-- Name: trainer_plan_assignments_acceptance_idempotency_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX trainer_plan_assignments_acceptance_idempotency_unique ON public.trainer_plan_assignments USING btree (client_user_id, acceptance_idempotency_key) WHERE (acceptance_idempotency_key IS NOT NULL);


--
-- Name: trainer_plan_assignments_decline_idempotency_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX trainer_plan_assignments_decline_idempotency_unique ON public.trainer_plan_assignments USING btree (client_user_id, decline_idempotency_key) WHERE (decline_idempotency_key IS NOT NULL);


--
-- Name: trainer_plan_assignments_one_active_client; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX trainer_plan_assignments_one_active_client ON public.trainer_plan_assignments USING btree (client_user_id) WHERE (status = 'active'::text);


--
-- Name: trainer_plan_assignments_proposal_idempotency_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX trainer_plan_assignments_proposal_idempotency_unique ON public.trainer_plan_assignments USING btree (trainer_user_id, proposal_idempotency_key) WHERE (proposal_idempotency_key IS NOT NULL);


--
-- Name: trainer_plan_assignments_relationship_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX trainer_plan_assignments_relationship_idx ON public.trainer_plan_assignments USING btree (relationship_id, created_at DESC, id DESC);


--
-- Name: trainer_profiles_status_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX trainer_profiles_status_created_idx ON public.trainer_profiles USING btree (status, created_at DESC, id DESC);


--
-- Name: trainer_program_templates_owner_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX trainer_program_templates_owner_status_idx ON public.trainer_program_templates USING btree (trainer_user_id, status, updated_at DESC, id DESC);


--
-- Name: trainer_service_offerings_profile_active_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX trainer_service_offerings_profile_active_idx ON public.trainer_service_offerings USING btree (trainer_profile_id, is_active, created_at DESC, id DESC);


--
-- Name: trainer_template_exercises_workout_order_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX trainer_template_exercises_workout_order_idx ON public.trainer_template_exercises USING btree (template_workout_id, order_index, id);


--
-- Name: trainer_template_workouts_template_order_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX trainer_template_workouts_template_order_idx ON public.trainer_template_workouts USING btree (template_id, day_of_week, order_in_plan, id);


--
-- Name: workout_plans_user_family_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX workout_plans_user_family_idx ON public.workout_plans USING btree (user_id, family_id);


--
-- Name: workout_plans_user_generation_request_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX workout_plans_user_generation_request_unique ON public.workout_plans USING btree (user_id, generation_request_id) WHERE (generation_request_id IS NOT NULL);


--
-- Name: workout_plans_user_lifecycle_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX workout_plans_user_lifecycle_created_idx ON public.workout_plans USING btree (user_id, retired_at, superseded_at, created_at DESC);


--
-- Name: workouts_plan_schedule_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX workouts_plan_schedule_idx ON public.workouts USING btree (plan_id, day_of_week, order_in_plan, id);


--
-- Name: trainer_application_events audit_applicant_trainer_application_event; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER audit_applicant_trainer_application_event AFTER INSERT ON public.trainer_application_events FOR EACH ROW EXECUTE FUNCTION public.audit_applicant_trainer_application_event();


--
-- Name: coaching_consents audit_coaching_materialization; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER audit_coaching_materialization AFTER INSERT ON public.coaching_consents FOR EACH ROW EXECUTE FUNCTION public.audit_coaching_materialization();


--
-- Name: coaching_relationships audit_coaching_materialization; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER audit_coaching_materialization AFTER INSERT ON public.coaching_relationships FOR EACH ROW EXECUTE FUNCTION public.audit_coaching_materialization();


--
-- Name: trainer_applications audit_trainer_application_draft_change; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER audit_trainer_application_draft_change AFTER INSERT OR UPDATE ON public.trainer_applications FOR EACH ROW EXECUTE FUNCTION public.audit_trainer_application_draft_change();


--
-- Name: trainer_plan_assignments audit_trainer_assignment_freeze; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER audit_trainer_assignment_freeze AFTER UPDATE ON public.trainer_plan_assignments FOR EACH ROW EXECUTE FUNCTION public.audit_trainer_assignment_freeze();


--
-- Name: trainer_application_credentials audit_trainer_owned_change; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER audit_trainer_owned_change AFTER INSERT OR DELETE ON public.trainer_application_credentials FOR EACH ROW EXECUTE FUNCTION public.audit_trainer_owned_change();


--
-- Name: trainer_credential_storage_cleanup audit_trainer_owned_change; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER audit_trainer_owned_change AFTER INSERT OR DELETE OR UPDATE ON public.trainer_credential_storage_cleanup FOR EACH ROW EXECUTE FUNCTION public.audit_trainer_owned_change();


--
-- Name: trainer_profiles audit_trainer_owned_change; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER audit_trainer_owned_change AFTER INSERT OR DELETE OR UPDATE ON public.trainer_profiles FOR EACH ROW EXECUTE FUNCTION public.audit_trainer_owned_change();


--
-- Name: trainer_program_templates audit_trainer_owned_change; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER audit_trainer_owned_change AFTER INSERT OR DELETE OR UPDATE ON public.trainer_program_templates FOR EACH ROW EXECUTE FUNCTION public.audit_trainer_owned_change();


--
-- Name: trainer_service_offerings audit_trainer_owned_change; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER audit_trainer_owned_change AFTER INSERT OR DELETE OR UPDATE ON public.trainer_service_offerings FOR EACH ROW EXECUTE FUNCTION public.audit_trainer_owned_change();


--
-- Name: trainer_template_exercises audit_trainer_owned_change; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER audit_trainer_owned_change AFTER INSERT OR DELETE OR UPDATE ON public.trainer_template_exercises FOR EACH ROW EXECUTE FUNCTION public.audit_trainer_owned_change();


--
-- Name: trainer_template_workouts audit_trainer_owned_change; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER audit_trainer_owned_change AFTER INSERT OR DELETE OR UPDATE ON public.trainer_template_workouts FOR EACH ROW EXECUTE FUNCTION public.audit_trainer_owned_change();


--
-- Name: professional_audit_logs reject_professional_audit_log_mutation; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER reject_professional_audit_log_mutation BEFORE DELETE OR UPDATE ON public.professional_audit_logs FOR EACH ROW EXECUTE FUNCTION public.reject_professional_audit_log_mutation();


--
-- Name: professional_audit_logs reject_professional_audit_log_truncate; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER reject_professional_audit_log_truncate BEFORE TRUNCATE ON public.professional_audit_logs FOR EACH STATEMENT EXECUTE FUNCTION public.reject_professional_audit_log_mutation();


--
-- Name: professional_audit_logs sanitize_professional_audit_log_insert; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER sanitize_professional_audit_log_insert BEFORE INSERT ON public.professional_audit_logs FOR EACH ROW EXECUTE FUNCTION public.sanitize_professional_audit_log_insert();


--
-- Name: admin_audit_logs snapshot_admin_audit_identity; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER snapshot_admin_audit_identity BEFORE INSERT ON public.admin_audit_logs FOR EACH ROW EXECUTE FUNCTION public.snapshot_admin_audit_identity();


--
-- Name: workout_plans trg_00_guard_plan_lifecycle_row; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_00_guard_plan_lifecycle_row BEFORE INSERT OR DELETE ON public.workout_plans FOR EACH ROW EXECUTE FUNCTION public.guard_plan_lifecycle_mutation();


--
-- Name: workout_plans trg_00_guard_plan_lifecycle_update; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_00_guard_plan_lifecycle_update BEFORE UPDATE OF family_id, parent_plan_id, generation_request_id, retired_at, superseded_at, is_active, user_id ON public.workout_plans FOR EACH ROW EXECUTE FUNCTION public.guard_plan_lifecycle_mutation();


--
-- Name: profiles trg_00_guard_subscription_tier_request; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_00_guard_subscription_tier_request BEFORE UPDATE OF subscription_tier ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.enforce_subscription_tier_change();


--
-- Name: ai_conversations trg_ai_conversations_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_ai_conversations_updated_at BEFORE UPDATE ON public.ai_conversations FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();


--
-- Name: progress_logs trg_capture_session_completion_milestone; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_capture_session_completion_milestone AFTER INSERT ON public.progress_logs FOR EACH ROW EXECUTE FUNCTION private.capture_session_completion_milestone();


--
-- Name: coaching_consents trg_coaching_consents_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_coaching_consents_updated_at BEFORE UPDATE ON public.coaching_consents FOR EACH ROW EXECUTE FUNCTION public.touch_coaching_relationships_updated_at();


--
-- Name: coaching_relationships trg_coaching_relationships_active_trainer; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_coaching_relationships_active_trainer BEFORE INSERT OR UPDATE OF trainer_user_id ON public.coaching_relationships FOR EACH ROW EXECUTE FUNCTION public.require_active_coaching_trainer();


--
-- Name: coaching_relationships trg_coaching_relationships_service_trainer_match; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_coaching_relationships_service_trainer_match BEFORE INSERT OR UPDATE OF service_id, trainer_user_id ON public.coaching_relationships FOR EACH ROW EXECUTE FUNCTION public.require_coaching_service_trainer_match();


--
-- Name: coaching_relationships trg_coaching_relationships_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_coaching_relationships_updated_at BEFORE UPDATE ON public.coaching_relationships FOR EACH ROW EXECUTE FUNCTION public.touch_coaching_relationships_updated_at();


--
-- Name: coaching_requests trg_coaching_requests_active_trainer; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_coaching_requests_active_trainer BEFORE INSERT OR UPDATE OF trainer_user_id ON public.coaching_requests FOR EACH ROW EXECUTE FUNCTION public.require_active_coaching_trainer();


--
-- Name: coaching_requests trg_coaching_requests_no_active_relationship; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_coaching_requests_no_active_relationship BEFORE INSERT OR UPDATE OF client_user_id, status ON public.coaching_requests FOR EACH ROW EXECUTE FUNCTION public.require_no_active_coaching_relationship_for_pending_request();


--
-- Name: coaching_requests trg_coaching_requests_service_trainer_match; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_coaching_requests_service_trainer_match BEFORE INSERT OR UPDATE OF service_id, trainer_user_id ON public.coaching_requests FOR EACH ROW EXECUTE FUNCTION public.require_coaching_service_trainer_match();


--
-- Name: coaching_requests trg_coaching_requests_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_coaching_requests_updated_at BEFORE UPDATE ON public.coaching_requests FOR EACH ROW EXECUTE FUNCTION public.touch_coaching_relationships_updated_at();


--
-- Name: progress_logs trg_completed_session_snapshot_immutability; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_completed_session_snapshot_immutability BEFORE UPDATE ON public.progress_logs FOR EACH ROW EXECUTE FUNCTION public.enforce_completed_session_snapshot_immutability();


--
-- Name: workout_plans trg_enforce_plan_family_limit; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_enforce_plan_family_limit BEFORE INSERT OR UPDATE OF user_id, family_id, library_slot, retired_at, superseded_at, is_active ON public.workout_plans FOR EACH ROW EXECUTE FUNCTION public.enforce_plan_family_limit();


--
-- Name: profiles trg_enforce_protected_profile_fields; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_enforce_protected_profile_fields BEFORE INSERT OR UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.enforce_protected_profile_fields();


--
-- Name: workouts trg_enforce_trainer_workout_iso_schedule; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_enforce_trainer_workout_iso_schedule BEFORE INSERT OR UPDATE OF plan_id, day_of_week, order_in_plan ON public.workouts FOR EACH ROW EXECUTE FUNCTION public.enforce_trainer_workout_iso_schedule();


--
-- Name: exercise_logs trg_exercise_log_immutability; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_exercise_log_immutability BEFORE UPDATE ON public.exercise_logs FOR EACH ROW EXECUTE FUNCTION public.enforce_exercise_log_immutability();


--
-- Name: coaching_relationships trg_freeze_trainer_assignments_for_relationship; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_freeze_trainer_assignments_for_relationship AFTER UPDATE OF status ON public.coaching_relationships FOR EACH ROW EXECUTE FUNCTION public.freeze_trainer_assignments_for_relationship();


--
-- Name: workout_plans trg_guard_locked_trainer_plan_mutation; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_guard_locked_trainer_plan_mutation BEFORE DELETE OR UPDATE ON public.workout_plans FOR EACH ROW EXECUTE FUNCTION public.guard_locked_trainer_plan_mutation();


--
-- Name: workout_exercises trg_guard_locked_trainer_workout_exercise_mutation; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_guard_locked_trainer_workout_exercise_mutation BEFORE INSERT OR DELETE OR UPDATE ON public.workout_exercises FOR EACH ROW EXECUTE FUNCTION public.guard_locked_trainer_workout_exercise_mutation();


--
-- Name: workouts trg_guard_locked_trainer_workout_mutation; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_guard_locked_trainer_workout_mutation BEFORE INSERT OR DELETE OR UPDATE ON public.workouts FOR EACH ROW EXECUTE FUNCTION public.guard_locked_trainer_workout_mutation();


--
-- Name: measurements trg_measurements_sync_profile_weight; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_measurements_sync_profile_weight AFTER INSERT OR DELETE OR UPDATE OF weight_kg, recorded_at, id, user_id ON public.measurements FOR EACH ROW EXECUTE FUNCTION public.sync_profile_weight_from_measurements();


--
-- Name: post_comments trg_post_comments_count; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_post_comments_count AFTER INSERT OR DELETE ON public.post_comments FOR EACH ROW EXECUTE FUNCTION public.bump_post_comment_count();


--
-- Name: post_likes trg_post_likes_count; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_post_likes_count AFTER INSERT OR DELETE ON public.post_likes FOR EACH ROW EXECUTE FUNCTION public.bump_post_like_count();


--
-- Name: posts trg_posts_profile_count; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_posts_profile_count AFTER INSERT OR DELETE ON public.posts FOR EACH ROW EXECUTE FUNCTION public.bump_profile_post_count();


--
-- Name: product_notification_preferences trg_product_notification_preferences_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_product_notification_preferences_updated_at BEFORE UPDATE ON public.product_notification_preferences FOR EACH ROW EXECUTE FUNCTION public.touch_product_notification_updated_at();


--
-- Name: product_push_tokens trg_product_push_tokens_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_product_push_tokens_updated_at BEFORE UPDATE ON public.product_push_tokens FOR EACH ROW EXECUTE FUNCTION public.touch_product_notification_updated_at();


--
-- Name: profiles trg_profiles_guard_derived_weight; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_profiles_guard_derived_weight BEFORE UPDATE OF weight_kg, onboarding_done ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.guard_profile_weight_derived();


--
-- Name: profiles trg_profiles_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();


--
-- Name: profiles trg_provision_product_notification_preferences; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_provision_product_notification_preferences AFTER INSERT ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.provision_product_notification_preferences();


--
-- Name: social_notification_preferences trg_social_notification_preferences_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_social_notification_preferences_updated_at BEFORE UPDATE ON public.social_notification_preferences FOR EACH ROW EXECUTE FUNCTION public.touch_social_push_updated_at();


--
-- Name: social_push_tokens trg_social_push_tokens_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_social_push_tokens_updated_at BEFORE UPDATE ON public.social_push_tokens FOR EACH ROW EXECUTE FUNCTION public.touch_social_push_updated_at();


--
-- Name: trainer_application_credentials trg_trainer_application_credentials_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_trainer_application_credentials_updated_at BEFORE UPDATE ON public.trainer_application_credentials FOR EACH ROW EXECUTE FUNCTION public.touch_trainer_verification_updated_at();


--
-- Name: trainer_applications trg_trainer_applications_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_trainer_applications_updated_at BEFORE UPDATE ON public.trainer_applications FOR EACH ROW EXECUTE FUNCTION public.touch_trainer_verification_updated_at();


--
-- Name: trainer_assignment_versions trg_trainer_assignment_versions_immutable; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_trainer_assignment_versions_immutable BEFORE UPDATE ON public.trainer_assignment_versions FOR EACH ROW EXECUTE FUNCTION public.guard_trainer_assignment_version_immutability();


--
-- Name: trainer_assignment_versions trg_trainer_assignment_versions_referenced_delete; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_trainer_assignment_versions_referenced_delete BEFORE DELETE ON public.trainer_assignment_versions FOR EACH ROW EXECUTE FUNCTION public.guard_referenced_trainer_assignment_version_delete();


--
-- Name: trainer_credential_storage_cleanup trg_trainer_credential_storage_cleanup_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_trainer_credential_storage_cleanup_updated_at BEFORE UPDATE ON public.trainer_credential_storage_cleanup FOR EACH ROW EXECUTE FUNCTION public.touch_trainer_verification_updated_at();


--
-- Name: trainer_interviews trg_trainer_interviews_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_trainer_interviews_updated_at BEFORE UPDATE ON public.trainer_interviews FOR EACH ROW EXECUTE FUNCTION public.touch_trainer_verification_updated_at();


--
-- Name: trainer_plan_assignments trg_trainer_plan_assignments_relationship_match; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_trainer_plan_assignments_relationship_match BEFORE INSERT OR UPDATE OF relationship_id, trainer_user_id, client_user_id, source_template_id ON public.trainer_plan_assignments FOR EACH ROW EXECUTE FUNCTION public.require_trainer_assignment_relationship_match();


--
-- Name: trainer_plan_assignments trg_trainer_plan_assignments_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_trainer_plan_assignments_updated_at BEFORE UPDATE ON public.trainer_plan_assignments FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();


--
-- Name: trainer_profiles trg_trainer_profiles_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_trainer_profiles_updated_at BEFORE UPDATE ON public.trainer_profiles FOR EACH ROW EXECUTE FUNCTION public.touch_trainer_verification_updated_at();


--
-- Name: trainer_program_templates trg_trainer_program_templates_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_trainer_program_templates_updated_at BEFORE UPDATE ON public.trainer_program_templates FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();


--
-- Name: trainer_service_offerings trg_trainer_service_offerings_active_profile; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_trainer_service_offerings_active_profile BEFORE INSERT OR UPDATE OF trainer_profile_id ON public.trainer_service_offerings FOR EACH ROW EXECUTE FUNCTION public.require_active_trainer_service_profile();


--
-- Name: trainer_service_offerings trg_trainer_service_offerings_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_trainer_service_offerings_updated_at BEFORE UPDATE ON public.trainer_service_offerings FOR EACH ROW EXECUTE FUNCTION public.touch_coaching_relationships_updated_at();


--
-- Name: trainer_template_exercises trg_trainer_template_exercises_public_catalog; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_trainer_template_exercises_public_catalog BEFORE INSERT OR UPDATE OF exercise_id ON public.trainer_template_exercises FOR EACH ROW EXECUTE FUNCTION public.require_public_trainer_template_exercise();


--
-- Name: trainer_template_exercises trg_trainer_template_exercises_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_trainer_template_exercises_updated_at BEFORE UPDATE ON public.trainer_template_exercises FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();


--
-- Name: trainer_template_workouts trg_trainer_template_workouts_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_trainer_template_workouts_updated_at BEFORE UPDATE ON public.trainer_template_workouts FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();


--
-- Name: trainer_plan_assignments trg_validate_materialized_assignment_identity; Type: TRIGGER; Schema: public; Owner: -
--

CREATE CONSTRAINT TRIGGER trg_validate_materialized_assignment_identity AFTER UPDATE OF relationship_id, trainer_user_id, client_user_id ON public.trainer_plan_assignments DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.validate_materialized_assignment_identity();


--
-- Name: trainer_assignment_versions trg_validate_materialized_assignment_version_identity; Type: TRIGGER; Schema: public; Owner: -
--

CREATE CONSTRAINT TRIGGER trg_validate_materialized_assignment_version_identity AFTER UPDATE OF materialized_plan_id, assignment_id ON public.trainer_assignment_versions DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.validate_materialized_assignment_version_identity();


--
-- Name: workout_plans trg_validate_trainer_assigned_plan; Type: TRIGGER; Schema: public; Owner: -
--

CREATE CONSTRAINT TRIGGER trg_validate_trainer_assigned_plan AFTER INSERT OR UPDATE OF source_type, library_slot, prescription_locked, trainer_relationship_id, trainer_assignment_id, trainer_assignment_version_id, user_id ON public.workout_plans DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.validate_trainer_assigned_plan_identity();


--
-- Name: workout_plans trg_workout_plans_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_workout_plans_updated_at BEFORE UPDATE ON public.workout_plans FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();


--
-- Name: profiles trg_zz_guard_subscription_tier_result; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_zz_guard_subscription_tier_result BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.enforce_subscription_tier_change();


--
-- Name: session_completion_analytics_state session_completion_analytics_state_user_id_fkey; Type: FK CONSTRAINT; Schema: private; Owner: -
--

ALTER TABLE ONLY private.session_completion_analytics_state
    ADD CONSTRAINT session_completion_analytics_state_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: admin_audit_logs admin_audit_logs_admin_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin_audit_logs
    ADD CONSTRAINT admin_audit_logs_admin_user_id_fkey FOREIGN KEY (admin_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: admin_audit_logs admin_audit_logs_target_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin_audit_logs
    ADD CONSTRAINT admin_audit_logs_target_user_id_fkey FOREIGN KEY (target_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: ai_conversations ai_conversations_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_conversations
    ADD CONSTRAINT ai_conversations_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: ai_messages ai_messages_conversation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_messages
    ADD CONSTRAINT ai_messages_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES public.ai_conversations(id) ON DELETE CASCADE;


--
-- Name: ai_messages ai_messages_generated_plan_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_messages
    ADD CONSTRAINT ai_messages_generated_plan_id_fkey FOREIGN KEY (generated_plan_id) REFERENCES public.workout_plans(id) ON DELETE SET NULL;


--
-- Name: ai_usage_logs ai_usage_logs_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_usage_logs
    ADD CONSTRAINT ai_usage_logs_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: coaching_consents coaching_consents_granted_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.coaching_consents
    ADD CONSTRAINT coaching_consents_granted_by_fkey FOREIGN KEY (granted_by) REFERENCES public.profiles(id) ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED;


--
-- Name: coaching_consents coaching_consents_relationship_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.coaching_consents
    ADD CONSTRAINT coaching_consents_relationship_id_fkey FOREIGN KEY (relationship_id) REFERENCES public.coaching_relationships(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED;


--
-- Name: coaching_consents coaching_consents_revoked_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.coaching_consents
    ADD CONSTRAINT coaching_consents_revoked_by_fkey FOREIGN KEY (revoked_by) REFERENCES public.profiles(id) ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED;


--
-- Name: coaching_relationships coaching_relationships_client_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.coaching_relationships
    ADD CONSTRAINT coaching_relationships_client_user_id_fkey FOREIGN KEY (client_user_id) REFERENCES public.profiles(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED;


--
-- Name: coaching_relationships coaching_relationships_ended_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.coaching_relationships
    ADD CONSTRAINT coaching_relationships_ended_by_fkey FOREIGN KEY (ended_by) REFERENCES public.profiles(id) ON DELETE SET NULL DEFERRABLE INITIALLY DEFERRED;


--
-- Name: coaching_relationships coaching_relationships_service_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.coaching_relationships
    ADD CONSTRAINT coaching_relationships_service_id_fkey FOREIGN KEY (service_id) REFERENCES public.trainer_service_offerings(id) ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED;


--
-- Name: coaching_relationships coaching_relationships_source_request_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.coaching_relationships
    ADD CONSTRAINT coaching_relationships_source_request_id_fkey FOREIGN KEY (source_request_id) REFERENCES public.coaching_requests(id) ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED;


--
-- Name: coaching_relationships coaching_relationships_trainer_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.coaching_relationships
    ADD CONSTRAINT coaching_relationships_trainer_user_id_fkey FOREIGN KEY (trainer_user_id) REFERENCES public.profiles(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED;


--
-- Name: coaching_requests coaching_requests_client_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.coaching_requests
    ADD CONSTRAINT coaching_requests_client_user_id_fkey FOREIGN KEY (client_user_id) REFERENCES public.profiles(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED;


--
-- Name: coaching_requests coaching_requests_service_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.coaching_requests
    ADD CONSTRAINT coaching_requests_service_id_fkey FOREIGN KEY (service_id) REFERENCES public.trainer_service_offerings(id) ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED;


--
-- Name: coaching_requests coaching_requests_trainer_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.coaching_requests
    ADD CONSTRAINT coaching_requests_trainer_user_id_fkey FOREIGN KEY (trainer_user_id) REFERENCES public.profiles(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED;


--
-- Name: dashboard_banners dashboard_banners_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dashboard_banners
    ADD CONSTRAINT dashboard_banners_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: exercise_logs exercise_logs_exercise_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exercise_logs
    ADD CONSTRAINT exercise_logs_exercise_id_fkey FOREIGN KEY (exercise_id) REFERENCES public.exercises(id) ON DELETE RESTRICT;


--
-- Name: exercise_logs exercise_logs_progress_log_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exercise_logs
    ADD CONSTRAINT exercise_logs_progress_log_id_fkey FOREIGN KEY (progress_log_id) REFERENCES public.progress_logs(id) ON DELETE CASCADE;


--
-- Name: follows follows_follower_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.follows
    ADD CONSTRAINT follows_follower_id_fkey FOREIGN KEY (follower_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: follows follows_following_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.follows
    ADD CONSTRAINT follows_following_id_fkey FOREIGN KEY (following_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: measurements measurements_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.measurements
    ADD CONSTRAINT measurements_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: notification_attention_dismissals notification_attention_dismissals_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_attention_dismissals
    ADD CONSTRAINT notification_attention_dismissals_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: plan_generation_events plan_generation_events_plan_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.plan_generation_events
    ADD CONSTRAINT plan_generation_events_plan_id_fkey FOREIGN KEY (plan_id) REFERENCES public.workout_plans(id) ON DELETE SET NULL;


--
-- Name: plan_generation_events plan_generation_events_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.plan_generation_events
    ADD CONSTRAINT plan_generation_events_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: post_comments post_comments_post_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.post_comments
    ADD CONSTRAINT post_comments_post_id_fkey FOREIGN KEY (post_id) REFERENCES public.posts(id) ON DELETE CASCADE;


--
-- Name: post_comments post_comments_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.post_comments
    ADD CONSTRAINT post_comments_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: post_likes post_likes_post_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.post_likes
    ADD CONSTRAINT post_likes_post_id_fkey FOREIGN KEY (post_id) REFERENCES public.posts(id) ON DELETE CASCADE;


--
-- Name: post_likes post_likes_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.post_likes
    ADD CONSTRAINT post_likes_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: post_reports post_reports_comment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.post_reports
    ADD CONSTRAINT post_reports_comment_id_fkey FOREIGN KEY (comment_id) REFERENCES public.post_comments(id) ON DELETE CASCADE;


--
-- Name: post_reports post_reports_post_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.post_reports
    ADD CONSTRAINT post_reports_post_id_fkey FOREIGN KEY (post_id) REFERENCES public.posts(id) ON DELETE CASCADE;


--
-- Name: post_reports post_reports_reporter_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.post_reports
    ADD CONSTRAINT post_reports_reporter_id_fkey FOREIGN KEY (reporter_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: posts posts_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.posts
    ADD CONSTRAINT posts_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: product_events product_events_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_events
    ADD CONSTRAINT product_events_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: product_notification_preferences product_notification_preferences_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_notification_preferences
    ADD CONSTRAINT product_notification_preferences_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: product_notifications product_notifications_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_notifications
    ADD CONSTRAINT product_notifications_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: product_push_tokens product_push_tokens_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_push_tokens
    ADD CONSTRAINT product_push_tokens_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: profiles profiles_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: profiles profiles_suspended_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_suspended_by_fkey FOREIGN KEY (suspended_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: progress_logs progress_logs_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.progress_logs
    ADD CONSTRAINT progress_logs_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: progress_logs progress_logs_workout_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.progress_logs
    ADD CONSTRAINT progress_logs_workout_id_fkey FOREIGN KEY (workout_id) REFERENCES public.workouts(id) ON DELETE SET NULL;


--
-- Name: session_authorizations session_authorizations_plan_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.session_authorizations
    ADD CONSTRAINT session_authorizations_plan_id_fkey FOREIGN KEY (plan_id) REFERENCES public.workout_plans(id) ON DELETE CASCADE;


--
-- Name: session_authorizations session_authorizations_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.session_authorizations
    ADD CONSTRAINT session_authorizations_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: session_authorizations session_authorizations_workout_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.session_authorizations
    ADD CONSTRAINT session_authorizations_workout_id_fkey FOREIGN KEY (workout_id) REFERENCES public.workouts(id) ON DELETE CASCADE;


--
-- Name: social_notification_preferences social_notification_preferences_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.social_notification_preferences
    ADD CONSTRAINT social_notification_preferences_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: social_push_tokens social_push_tokens_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.social_push_tokens
    ADD CONSTRAINT social_push_tokens_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: trainer_application_credentials trainer_application_credentials_application_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trainer_application_credentials
    ADD CONSTRAINT trainer_application_credentials_application_id_fkey FOREIGN KEY (application_id) REFERENCES public.trainer_applications(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED;


--
-- Name: trainer_application_events trainer_application_events_actor_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trainer_application_events
    ADD CONSTRAINT trainer_application_events_actor_user_id_fkey FOREIGN KEY (actor_user_id) REFERENCES auth.users(id) ON DELETE SET NULL DEFERRABLE INITIALLY DEFERRED;


--
-- Name: trainer_application_events trainer_application_events_application_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trainer_application_events
    ADD CONSTRAINT trainer_application_events_application_id_fkey FOREIGN KEY (application_id) REFERENCES public.trainer_applications(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED;


--
-- Name: trainer_applications trainer_applications_credential_source_application_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trainer_applications
    ADD CONSTRAINT trainer_applications_credential_source_application_id_fkey FOREIGN KEY (credential_source_application_id) REFERENCES public.trainer_applications(id) DEFERRABLE INITIALLY DEFERRED;


--
-- Name: trainer_applications trainer_applications_source_profile_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trainer_applications
    ADD CONSTRAINT trainer_applications_source_profile_fk FOREIGN KEY (source_profile_id) REFERENCES public.trainer_profiles(id) DEFERRABLE INITIALLY DEFERRED;


--
-- Name: trainer_applications trainer_applications_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trainer_applications
    ADD CONSTRAINT trainer_applications_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED;


--
-- Name: trainer_assignment_versions trainer_assignment_versions_assignment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trainer_assignment_versions
    ADD CONSTRAINT trainer_assignment_versions_assignment_id_fkey FOREIGN KEY (assignment_id) REFERENCES public.trainer_plan_assignments(id) ON DELETE CASCADE;


--
-- Name: trainer_assignment_versions trainer_assignment_versions_materialized_plan_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trainer_assignment_versions
    ADD CONSTRAINT trainer_assignment_versions_materialized_plan_id_fkey FOREIGN KEY (materialized_plan_id) REFERENCES public.workout_plans(id) ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED;


--
-- Name: trainer_credential_storage_cleanup trainer_credential_storage_cleanup_application_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trainer_credential_storage_cleanup
    ADD CONSTRAINT trainer_credential_storage_cleanup_application_id_fkey FOREIGN KEY (application_id) REFERENCES public.trainer_applications(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED;


--
-- Name: trainer_credential_storage_cleanup trainer_credential_storage_cleanup_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trainer_credential_storage_cleanup
    ADD CONSTRAINT trainer_credential_storage_cleanup_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED;


--
-- Name: trainer_interviews trainer_interviews_application_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trainer_interviews
    ADD CONSTRAINT trainer_interviews_application_id_fkey FOREIGN KEY (application_id) REFERENCES public.trainer_applications(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED;


--
-- Name: trainer_interviews trainer_interviews_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trainer_interviews
    ADD CONSTRAINT trainer_interviews_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL DEFERRABLE INITIALLY DEFERRED;


--
-- Name: trainer_plan_assignments trainer_plan_assignments_active_version_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trainer_plan_assignments
    ADD CONSTRAINT trainer_plan_assignments_active_version_id_fkey FOREIGN KEY (active_version_id) REFERENCES public.trainer_assignment_versions(id) ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED;


--
-- Name: trainer_plan_assignments trainer_plan_assignments_client_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trainer_plan_assignments
    ADD CONSTRAINT trainer_plan_assignments_client_user_id_fkey FOREIGN KEY (client_user_id) REFERENCES public.profiles(id) ON DELETE RESTRICT;


--
-- Name: trainer_plan_assignments trainer_plan_assignments_relationship_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trainer_plan_assignments
    ADD CONSTRAINT trainer_plan_assignments_relationship_id_fkey FOREIGN KEY (relationship_id) REFERENCES public.coaching_relationships(id) ON DELETE RESTRICT;


--
-- Name: trainer_plan_assignments trainer_plan_assignments_source_template_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trainer_plan_assignments
    ADD CONSTRAINT trainer_plan_assignments_source_template_id_fkey FOREIGN KEY (source_template_id) REFERENCES public.trainer_program_templates(id) ON DELETE RESTRICT;


--
-- Name: trainer_plan_assignments trainer_plan_assignments_trainer_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trainer_plan_assignments
    ADD CONSTRAINT trainer_plan_assignments_trainer_user_id_fkey FOREIGN KEY (trainer_user_id) REFERENCES public.profiles(id) ON DELETE RESTRICT;


--
-- Name: trainer_profiles trainer_profiles_source_application_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trainer_profiles
    ADD CONSTRAINT trainer_profiles_source_application_id_fkey FOREIGN KEY (source_application_id) REFERENCES public.trainer_applications(id) DEFERRABLE INITIALLY DEFERRED;


--
-- Name: trainer_profiles trainer_profiles_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trainer_profiles
    ADD CONSTRAINT trainer_profiles_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED;


--
-- Name: trainer_program_templates trainer_program_templates_trainer_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trainer_program_templates
    ADD CONSTRAINT trainer_program_templates_trainer_user_id_fkey FOREIGN KEY (trainer_user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: trainer_service_offerings trainer_service_offerings_trainer_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trainer_service_offerings
    ADD CONSTRAINT trainer_service_offerings_trainer_profile_id_fkey FOREIGN KEY (trainer_profile_id) REFERENCES public.trainer_profiles(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED;


--
-- Name: trainer_template_exercises trainer_template_exercises_exercise_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trainer_template_exercises
    ADD CONSTRAINT trainer_template_exercises_exercise_id_fkey FOREIGN KEY (exercise_id) REFERENCES public.exercises(id) ON DELETE RESTRICT;


--
-- Name: trainer_template_exercises trainer_template_exercises_template_workout_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trainer_template_exercises
    ADD CONSTRAINT trainer_template_exercises_template_workout_id_fkey FOREIGN KEY (template_workout_id) REFERENCES public.trainer_template_workouts(id) ON DELETE CASCADE;


--
-- Name: trainer_template_workouts trainer_template_workouts_template_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trainer_template_workouts
    ADD CONSTRAINT trainer_template_workouts_template_id_fkey FOREIGN KEY (template_id) REFERENCES public.trainer_program_templates(id) ON DELETE CASCADE;


--
-- Name: user_blocks user_blocks_blocked_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_blocks
    ADD CONSTRAINT user_blocks_blocked_id_fkey FOREIGN KEY (blocked_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: user_blocks user_blocks_blocker_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_blocks
    ADD CONSTRAINT user_blocks_blocker_id_fkey FOREIGN KEY (blocker_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: workout_exercises workout_exercises_exercise_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workout_exercises
    ADD CONSTRAINT workout_exercises_exercise_id_fkey FOREIGN KEY (exercise_id) REFERENCES public.exercises(id) ON DELETE RESTRICT;


--
-- Name: workout_exercises workout_exercises_workout_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workout_exercises
    ADD CONSTRAINT workout_exercises_workout_id_fkey FOREIGN KEY (workout_id) REFERENCES public.workouts(id) ON DELETE CASCADE;


--
-- Name: workout_plans workout_plans_parent_plan_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workout_plans
    ADD CONSTRAINT workout_plans_parent_plan_id_fkey FOREIGN KEY (parent_plan_id) REFERENCES public.workout_plans(id) ON DELETE SET NULL;


--
-- Name: workout_plans workout_plans_source_post_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workout_plans
    ADD CONSTRAINT workout_plans_source_post_id_fkey FOREIGN KEY (source_post_id) REFERENCES public.posts(id) ON DELETE SET NULL;


--
-- Name: workout_plans workout_plans_source_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workout_plans
    ADD CONSTRAINT workout_plans_source_user_id_fkey FOREIGN KEY (source_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: workout_plans workout_plans_trainer_assignment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workout_plans
    ADD CONSTRAINT workout_plans_trainer_assignment_id_fkey FOREIGN KEY (trainer_assignment_id) REFERENCES public.trainer_plan_assignments(id) ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED;


--
-- Name: workout_plans workout_plans_trainer_assignment_version_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workout_plans
    ADD CONSTRAINT workout_plans_trainer_assignment_version_id_fkey FOREIGN KEY (trainer_assignment_version_id) REFERENCES public.trainer_assignment_versions(id) ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED;


--
-- Name: workout_plans workout_plans_trainer_relationship_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workout_plans
    ADD CONSTRAINT workout_plans_trainer_relationship_id_fkey FOREIGN KEY (trainer_relationship_id) REFERENCES public.coaching_relationships(id) ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED;


--
-- Name: workout_plans workout_plans_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workout_plans
    ADD CONSTRAINT workout_plans_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: workouts workouts_plan_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workouts
    ADD CONSTRAINT workouts_plan_id_fkey FOREIGN KEY (plan_id) REFERENCES public.workout_plans(id) ON DELETE SET NULL;


--
-- Name: workouts workouts_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workouts
    ADD CONSTRAINT workouts_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: ai_conversations account must be active; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "account must be active" ON public.ai_conversations AS RESTRICTIVE TO authenticated USING (public.is_account_active(auth.uid())) WITH CHECK (public.is_account_active(auth.uid()));


--
-- Name: ai_messages account must be active; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "account must be active" ON public.ai_messages AS RESTRICTIVE TO authenticated USING (public.is_account_active(auth.uid())) WITH CHECK (public.is_account_active(auth.uid()));


--
-- Name: exercise_logs account must be active; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "account must be active" ON public.exercise_logs AS RESTRICTIVE TO authenticated USING (public.is_account_active(auth.uid())) WITH CHECK (public.is_account_active(auth.uid()));


--
-- Name: exercises account must be active; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "account must be active" ON public.exercises AS RESTRICTIVE TO authenticated USING (public.is_account_active(auth.uid())) WITH CHECK (public.is_account_active(auth.uid()));


--
-- Name: follows account must be active; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "account must be active" ON public.follows AS RESTRICTIVE TO authenticated USING (public.is_account_active(auth.uid())) WITH CHECK (public.is_account_active(auth.uid()));


--
-- Name: measurements account must be active; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "account must be active" ON public.measurements AS RESTRICTIVE TO authenticated USING (public.is_account_active(auth.uid())) WITH CHECK (public.is_account_active(auth.uid()));


--
-- Name: post_comments account must be active; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "account must be active" ON public.post_comments AS RESTRICTIVE TO authenticated USING (public.is_account_active(auth.uid())) WITH CHECK (public.is_account_active(auth.uid()));


--
-- Name: post_likes account must be active; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "account must be active" ON public.post_likes AS RESTRICTIVE TO authenticated USING (public.is_account_active(auth.uid())) WITH CHECK (public.is_account_active(auth.uid()));


--
-- Name: post_reports account must be active; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "account must be active" ON public.post_reports AS RESTRICTIVE TO authenticated USING (public.is_account_active(auth.uid())) WITH CHECK (public.is_account_active(auth.uid()));


--
-- Name: posts account must be active; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "account must be active" ON public.posts AS RESTRICTIVE TO authenticated USING (public.is_account_active(auth.uid())) WITH CHECK (public.is_account_active(auth.uid()));


--
-- Name: progress_logs account must be active; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "account must be active" ON public.progress_logs AS RESTRICTIVE TO authenticated USING (public.is_account_active(auth.uid())) WITH CHECK (public.is_account_active(auth.uid()));


--
-- Name: social_notification_preferences account must be active; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "account must be active" ON public.social_notification_preferences AS RESTRICTIVE TO authenticated USING (public.is_account_active(auth.uid())) WITH CHECK (public.is_account_active(auth.uid()));


--
-- Name: social_push_tokens account must be active; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "account must be active" ON public.social_push_tokens AS RESTRICTIVE TO authenticated USING (public.is_account_active(auth.uid())) WITH CHECK (public.is_account_active(auth.uid()));


--
-- Name: user_blocks account must be active; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "account must be active" ON public.user_blocks AS RESTRICTIVE TO authenticated USING (public.is_account_active(auth.uid())) WITH CHECK (public.is_account_active(auth.uid()));


--
-- Name: workout_exercises account must be active; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "account must be active" ON public.workout_exercises AS RESTRICTIVE TO authenticated USING (public.is_account_active(auth.uid())) WITH CHECK (public.is_account_active(auth.uid()));


--
-- Name: workout_plans account must be active; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "account must be active" ON public.workout_plans AS RESTRICTIVE TO authenticated USING (public.is_account_active(auth.uid())) WITH CHECK (public.is_account_active(auth.uid()));


--
-- Name: workouts account must be active; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "account must be active" ON public.workouts AS RESTRICTIVE TO authenticated USING (public.is_account_active(auth.uid())) WITH CHECK (public.is_account_active(auth.uid()));


--
-- Name: profiles active account profile updates; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "active account profile updates" ON public.profiles AS RESTRICTIVE FOR UPDATE TO authenticated USING (public.is_account_active(auth.uid())) WITH CHECK (public.is_account_active(auth.uid()));


--
-- Name: admin_audit_logs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.admin_audit_logs ENABLE ROW LEVEL SECURITY;

--
-- Name: ai_conversations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.ai_conversations ENABLE ROW LEVEL SECURITY;

--
-- Name: ai_conversations ai_conversations: own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "ai_conversations: own" ON public.ai_conversations USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));


--
-- Name: ai_messages; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.ai_messages ENABLE ROW LEVEL SECURITY;

--
-- Name: ai_messages ai_messages: own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "ai_messages: own" ON public.ai_messages USING ((EXISTS ( SELECT 1
   FROM public.ai_conversations c
  WHERE ((c.id = ai_messages.conversation_id) AND (c.user_id = auth.uid())))));


--
-- Name: ai_usage_logs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.ai_usage_logs ENABLE ROW LEVEL SECURITY;

--
-- Name: dashboard_banners authenticated users read active dashboard banner; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "authenticated users read active dashboard banner" ON public.dashboard_banners FOR SELECT TO authenticated USING (((status = 'active'::text) AND ((starts_on IS NULL) OR (starts_on <= CURRENT_DATE)) AND ((ends_on IS NULL) OR (ends_on >= CURRENT_DATE))));


--
-- Name: coaching_consents; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.coaching_consents ENABLE ROW LEVEL SECURITY;

--
-- Name: coaching_consents coaching_consents: consent-bound participants; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "coaching_consents: consent-bound participants" ON public.coaching_consents FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.coaching_relationships relationship
  WHERE ((relationship.id = coaching_consents.relationship_id) AND ((relationship.client_user_id = auth.uid()) OR public.has_active_coaching_scope(relationship.trainer_user_id, relationship.client_user_id, 'training_profile'::text))))));


--
-- Name: coaching_relationships; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.coaching_relationships ENABLE ROW LEVEL SECURITY;

--
-- Name: coaching_relationships coaching_relationships: consent-bound participants; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "coaching_relationships: consent-bound participants" ON public.coaching_relationships FOR SELECT TO authenticated USING (((auth.uid() = client_user_id) OR public.has_active_coaching_scope(trainer_user_id, client_user_id, 'training_profile'::text)));


--
-- Name: coaching_requests; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.coaching_requests ENABLE ROW LEVEL SECURITY;

--
-- Name: coaching_requests coaching_requests: consent-bound participants; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "coaching_requests: consent-bound participants" ON public.coaching_requests FOR SELECT TO authenticated USING (((auth.uid() = client_user_id) OR ((auth.uid() = trainer_user_id) AND (((status = 'pending'::text) AND (EXISTS ( SELECT 1
   FROM (public.trainer_profiles trainer_profile
     JOIN public.profiles trainer_account ON ((trainer_account.id = trainer_profile.user_id)))
  WHERE ((trainer_profile.user_id = auth.uid()) AND (trainer_profile.status = 'active'::text) AND (trainer_account.account_status = 'active'::text))))) OR (EXISTS ( SELECT 1
   FROM public.coaching_relationships relationship
  WHERE ((relationship.source_request_id = coaching_requests.id) AND public.has_active_coaching_scope(coaching_requests.trainer_user_id, coaching_requests.client_user_id, 'training_profile'::text))))))));


--
-- Name: dashboard_banners; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.dashboard_banners ENABLE ROW LEVEL SECURITY;

--
-- Name: exercise_logs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.exercise_logs ENABLE ROW LEVEL SECURITY;

--
-- Name: exercise_logs exercise_logs: own insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "exercise_logs: own insert" ON public.exercise_logs FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM public.progress_logs progress_log
  WHERE ((progress_log.id = exercise_logs.progress_log_id) AND (progress_log.user_id = auth.uid())))));


--
-- Name: exercise_logs exercise_logs: own read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "exercise_logs: own read" ON public.exercise_logs FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.progress_logs progress_log
  WHERE ((progress_log.id = exercise_logs.progress_log_id) AND (progress_log.user_id = auth.uid())))));


--
-- Name: exercises; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.exercises ENABLE ROW LEVEL SECURITY;

--
-- Name: exercises exercises: public read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "exercises: public read" ON public.exercises FOR SELECT USING ((is_public = true));


--
-- Name: follows; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.follows ENABLE ROW LEVEL SECURITY;

--
-- Name: follows follows: delete own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "follows: delete own" ON public.follows FOR DELETE TO authenticated USING ((auth.uid() = follower_id));


--
-- Name: follows follows: followed can accept; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "follows: followed can accept" ON public.follows FOR UPDATE TO authenticated USING ((auth.uid() = following_id)) WITH CHECK ((auth.uid() = following_id));


--
-- Name: follows follows: followed can reject; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "follows: followed can reject" ON public.follows FOR DELETE TO authenticated USING ((auth.uid() = following_id));


--
-- Name: follows follows: insert own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "follows: insert own" ON public.follows FOR INSERT TO authenticated WITH CHECK ((auth.uid() = follower_id));


--
-- Name: follows follows: read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "follows: read" ON public.follows FOR SELECT TO authenticated USING (true);


--
-- Name: measurements; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.measurements ENABLE ROW LEVEL SECURITY;

--
-- Name: measurements measurements: own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "measurements: own" ON public.measurements USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));


--
-- Name: notification_attention_dismissals; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.notification_attention_dismissals ENABLE ROW LEVEL SECURITY;

--
-- Name: notification_attention_dismissals notification_attention_dismissals: insert own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "notification_attention_dismissals: insert own" ON public.notification_attention_dismissals FOR INSERT TO authenticated WITH CHECK ((auth.uid() = user_id));


--
-- Name: notification_attention_dismissals notification_attention_dismissals: read own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "notification_attention_dismissals: read own" ON public.notification_attention_dismissals FOR SELECT TO authenticated USING ((auth.uid() = user_id));


--
-- Name: plan_generation_events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.plan_generation_events ENABLE ROW LEVEL SECURITY;

--
-- Name: post_comments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.post_comments ENABLE ROW LEVEL SECURITY;

--
-- Name: post_comments post_comments: delete own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "post_comments: delete own" ON public.post_comments FOR DELETE TO authenticated USING ((auth.uid() = user_id));


--
-- Name: post_comments post_comments: insert own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "post_comments: insert own" ON public.post_comments FOR INSERT TO authenticated WITH CHECK (((auth.uid() = user_id) AND (EXISTS ( SELECT 1
   FROM public.posts p
  WHERE ((p.id = post_comments.post_id) AND (p.removed_at IS NULL) AND (NOT (EXISTS ( SELECT 1
           FROM public.user_blocks b
          WHERE (((b.blocker_id = auth.uid()) AND (b.blocked_id = p.user_id)) OR ((b.blocker_id = p.user_id) AND (b.blocked_id = auth.uid())))))))))));


--
-- Name: post_comments post_comments: read visible; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "post_comments: read visible" ON public.post_comments FOR SELECT TO authenticated USING (((removed_at IS NULL) AND (NOT (EXISTS ( SELECT 1
   FROM public.user_blocks b
  WHERE (((b.blocker_id = auth.uid()) AND (b.blocked_id = post_comments.user_id)) OR ((b.blocker_id = post_comments.user_id) AND (b.blocked_id = auth.uid()))))))));


--
-- Name: post_likes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.post_likes ENABLE ROW LEVEL SECURITY;

--
-- Name: post_likes post_likes: delete own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "post_likes: delete own" ON public.post_likes FOR DELETE TO authenticated USING ((auth.uid() = user_id));


--
-- Name: post_likes post_likes: insert own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "post_likes: insert own" ON public.post_likes FOR INSERT TO authenticated WITH CHECK (((auth.uid() = user_id) AND (EXISTS ( SELECT 1
   FROM public.posts p
  WHERE ((p.id = post_likes.post_id) AND (p.removed_at IS NULL) AND (NOT (EXISTS ( SELECT 1
           FROM public.user_blocks b
          WHERE (((b.blocker_id = auth.uid()) AND (b.blocked_id = p.user_id)) OR ((b.blocker_id = p.user_id) AND (b.blocked_id = auth.uid())))))))))));


--
-- Name: post_likes post_likes: read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "post_likes: read" ON public.post_likes FOR SELECT TO authenticated USING (true);


--
-- Name: post_reports; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.post_reports ENABLE ROW LEVEL SECURITY;

--
-- Name: post_reports post_reports: insert own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "post_reports: insert own" ON public.post_reports FOR INSERT TO authenticated WITH CHECK ((auth.uid() = reporter_id));


--
-- Name: posts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.posts ENABLE ROW LEVEL SECURITY;

--
-- Name: posts posts: delete own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "posts: delete own" ON public.posts FOR DELETE TO authenticated USING ((auth.uid() = user_id));


--
-- Name: posts posts: insert own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "posts: insert own" ON public.posts FOR INSERT TO authenticated WITH CHECK ((auth.uid() = user_id));


--
-- Name: posts posts: read visible; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "posts: read visible" ON public.posts FOR SELECT TO authenticated USING (((removed_at IS NULL) AND (NOT (EXISTS ( SELECT 1
   FROM public.user_blocks b
  WHERE (((b.blocker_id = auth.uid()) AND (b.blocked_id = posts.user_id)) OR ((b.blocker_id = posts.user_id) AND (b.blocked_id = auth.uid())))))) AND ((auth.uid() = user_id) OR (EXISTS ( SELECT 1
   FROM public.public_profiles pp
  WHERE ((pp.id = posts.user_id) AND (pp.is_private = false)))) OR (EXISTS ( SELECT 1
   FROM public.follows f
  WHERE ((f.follower_id = auth.uid()) AND (f.following_id = posts.user_id) AND (f.status = 'accepted'::text)))))));


--
-- Name: product_events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.product_events ENABLE ROW LEVEL SECURITY;

--
-- Name: product_notification_preferences; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.product_notification_preferences ENABLE ROW LEVEL SECURITY;

--
-- Name: product_notification_preferences product_notification_preferences: insert own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "product_notification_preferences: insert own" ON public.product_notification_preferences FOR INSERT TO authenticated WITH CHECK ((auth.uid() = user_id));


--
-- Name: product_notification_preferences product_notification_preferences: read own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "product_notification_preferences: read own" ON public.product_notification_preferences FOR SELECT TO authenticated USING ((auth.uid() = user_id));


--
-- Name: product_notification_preferences product_notification_preferences: update own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "product_notification_preferences: update own" ON public.product_notification_preferences FOR UPDATE TO authenticated USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));


--
-- Name: product_notifications; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.product_notifications ENABLE ROW LEVEL SECURITY;

--
-- Name: product_notifications product_notifications: read own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "product_notifications: read own" ON public.product_notifications FOR SELECT TO authenticated USING ((auth.uid() = user_id));


--
-- Name: product_notifications product_notifications: update own read state; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "product_notifications: update own read state" ON public.product_notifications FOR UPDATE TO authenticated USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));


--
-- Name: product_push_tokens; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.product_push_tokens ENABLE ROW LEVEL SECURITY;

--
-- Name: product_push_tokens product_push_tokens: insert own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "product_push_tokens: insert own" ON public.product_push_tokens FOR INSERT TO authenticated WITH CHECK ((auth.uid() = user_id));


--
-- Name: product_push_tokens product_push_tokens: read own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "product_push_tokens: read own" ON public.product_push_tokens FOR SELECT TO authenticated USING ((auth.uid() = user_id));


--
-- Name: product_push_tokens product_push_tokens: update own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "product_push_tokens: update own" ON public.product_push_tokens FOR UPDATE TO authenticated USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));


--
-- Name: professional_audit_logs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.professional_audit_logs ENABLE ROW LEVEL SECURITY;

--
-- Name: profiles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

--
-- Name: profiles profiles: own row; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "profiles: own row" ON public.profiles USING ((auth.uid() = id)) WITH CHECK ((auth.uid() = id));


--
-- Name: progress_logs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.progress_logs ENABLE ROW LEVEL SECURITY;

--
-- Name: progress_logs progress_logs: own insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "progress_logs: own insert" ON public.progress_logs FOR INSERT TO authenticated WITH CHECK ((auth.uid() = user_id));


--
-- Name: progress_logs progress_logs: own read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "progress_logs: own read" ON public.progress_logs FOR SELECT TO authenticated USING ((auth.uid() = user_id));


--
-- Name: progress_logs progress_logs: own update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "progress_logs: own update" ON public.progress_logs FOR UPDATE TO authenticated USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));


--
-- Name: session_authorizations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.session_authorizations ENABLE ROW LEVEL SECURITY;

--
-- Name: session_authorizations session_authorizations: own read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "session_authorizations: own read" ON public.session_authorizations FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: social_notification_preferences; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.social_notification_preferences ENABLE ROW LEVEL SECURITY;

--
-- Name: social_notification_preferences social_notification_preferences: insert own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "social_notification_preferences: insert own" ON public.social_notification_preferences FOR INSERT TO authenticated WITH CHECK ((auth.uid() = user_id));


--
-- Name: social_notification_preferences social_notification_preferences: read own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "social_notification_preferences: read own" ON public.social_notification_preferences FOR SELECT TO authenticated USING ((auth.uid() = user_id));


--
-- Name: social_notification_preferences social_notification_preferences: update own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "social_notification_preferences: update own" ON public.social_notification_preferences FOR UPDATE TO authenticated USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));


--
-- Name: social_push_tokens; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.social_push_tokens ENABLE ROW LEVEL SECURITY;

--
-- Name: social_push_tokens social_push_tokens: delete own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "social_push_tokens: delete own" ON public.social_push_tokens FOR DELETE TO authenticated USING ((auth.uid() = user_id));


--
-- Name: social_push_tokens social_push_tokens: insert own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "social_push_tokens: insert own" ON public.social_push_tokens FOR INSERT TO authenticated WITH CHECK ((auth.uid() = user_id));


--
-- Name: social_push_tokens social_push_tokens: read own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "social_push_tokens: read own" ON public.social_push_tokens FOR SELECT TO authenticated USING ((auth.uid() = user_id));


--
-- Name: social_push_tokens social_push_tokens: update own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "social_push_tokens: update own" ON public.social_push_tokens FOR UPDATE TO authenticated USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));


--
-- Name: trainer_application_credentials; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.trainer_application_credentials ENABLE ROW LEVEL SECURITY;

--
-- Name: trainer_application_credentials trainer_application_credentials: active account; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "trainer_application_credentials: active account" ON public.trainer_application_credentials AS RESTRICTIVE TO authenticated USING (public.is_account_active(auth.uid())) WITH CHECK (public.is_account_active(auth.uid()));


--
-- Name: trainer_application_credentials trainer_application_credentials: delete own editable; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "trainer_application_credentials: delete own editable" ON public.trainer_application_credentials FOR DELETE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.trainer_applications application
  WHERE ((application.id = trainer_application_credentials.application_id) AND (application.user_id = auth.uid()) AND (application.application_kind = 'initial'::text) AND (application.status = ANY (ARRAY['draft'::text, 'changes_requested'::text]))))));


--
-- Name: trainer_application_credentials trainer_application_credentials: insert own editable; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "trainer_application_credentials: insert own editable" ON public.trainer_application_credentials FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM public.trainer_applications application
  WHERE ((application.id = trainer_application_credentials.application_id) AND (application.user_id = auth.uid()) AND (application.application_kind = 'initial'::text) AND (application.status = ANY (ARRAY['draft'::text, 'changes_requested'::text]))))));


--
-- Name: trainer_application_credentials trainer_application_credentials: select own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "trainer_application_credentials: select own" ON public.trainer_application_credentials FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.trainer_applications application
  WHERE ((application.id = trainer_application_credentials.application_id) AND (application.user_id = auth.uid())))));


--
-- Name: trainer_application_credentials trainer_application_credentials: update own editable; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "trainer_application_credentials: update own editable" ON public.trainer_application_credentials FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.trainer_applications application
  WHERE ((application.id = trainer_application_credentials.application_id) AND (application.user_id = auth.uid()) AND (application.application_kind = 'initial'::text) AND (application.status = ANY (ARRAY['draft'::text, 'changes_requested'::text])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.trainer_applications application
  WHERE ((application.id = trainer_application_credentials.application_id) AND (application.user_id = auth.uid()) AND (application.application_kind = 'initial'::text) AND (application.status = ANY (ARRAY['draft'::text, 'changes_requested'::text]))))));


--
-- Name: trainer_application_events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.trainer_application_events ENABLE ROW LEVEL SECURITY;

--
-- Name: trainer_applications; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.trainer_applications ENABLE ROW LEVEL SECURITY;

--
-- Name: trainer_applications trainer_applications: active account; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "trainer_applications: active account" ON public.trainer_applications AS RESTRICTIVE TO authenticated USING (public.is_account_active(auth.uid())) WITH CHECK (public.is_account_active(auth.uid()));


--
-- Name: trainer_applications trainer_applications: delete own editable; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "trainer_applications: delete own editable" ON public.trainer_applications FOR DELETE TO authenticated USING (((auth.uid() = user_id) AND (application_kind = 'initial'::text) AND (status = ANY (ARRAY['draft'::text, 'changes_requested'::text]))));


--
-- Name: trainer_applications trainer_applications: insert own draft; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "trainer_applications: insert own draft" ON public.trainer_applications FOR INSERT TO authenticated WITH CHECK (((auth.uid() = user_id) AND (application_kind = 'initial'::text) AND (status = 'draft'::text) AND (NOT (EXISTS ( SELECT 1
   FROM public.trainer_profiles trainer_profile
  WHERE (trainer_profile.user_id = auth.uid())))) AND (EXISTS ( SELECT 1
   FROM public.profiles profile
  WHERE ((profile.id = auth.uid()) AND (profile.onboarding_done = true))))));


--
-- Name: trainer_applications trainer_applications: read own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "trainer_applications: read own" ON public.trainer_applications FOR SELECT TO authenticated USING ((auth.uid() = user_id));


--
-- Name: trainer_applications trainer_applications: update own editable; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "trainer_applications: update own editable" ON public.trainer_applications FOR UPDATE TO authenticated USING (((auth.uid() = user_id) AND (application_kind = 'initial'::text) AND (status = ANY (ARRAY['draft'::text, 'changes_requested'::text])))) WITH CHECK (((auth.uid() = user_id) AND (application_kind = 'initial'::text) AND (status = ANY (ARRAY['draft'::text, 'changes_requested'::text]))));


--
-- Name: trainer_assignment_versions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.trainer_assignment_versions ENABLE ROW LEVEL SECURITY;

--
-- Name: trainer_assignment_versions trainer_assignment_versions: consent-bound participants; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "trainer_assignment_versions: consent-bound participants" ON public.trainer_assignment_versions FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.trainer_plan_assignments assignment
  WHERE ((assignment.id = trainer_assignment_versions.assignment_id) AND ((auth.uid() = assignment.client_user_id) OR public.has_active_coaching_scope(assignment.trainer_user_id, assignment.client_user_id, 'training_profile'::text))))));


--
-- Name: trainer_credential_storage_cleanup; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.trainer_credential_storage_cleanup ENABLE ROW LEVEL SECURITY;

--
-- Name: trainer_interviews; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.trainer_interviews ENABLE ROW LEVEL SECURITY;

--
-- Name: trainer_plan_assignments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.trainer_plan_assignments ENABLE ROW LEVEL SECURITY;

--
-- Name: trainer_plan_assignments trainer_plan_assignments: consent-bound participants; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "trainer_plan_assignments: consent-bound participants" ON public.trainer_plan_assignments FOR SELECT TO authenticated USING (((auth.uid() = client_user_id) OR public.has_active_coaching_scope(trainer_user_id, client_user_id, 'training_profile'::text)));


--
-- Name: trainer_profiles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.trainer_profiles ENABLE ROW LEVEL SECURITY;

--
-- Name: trainer_profiles trainer_profiles: active account; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "trainer_profiles: active account" ON public.trainer_profiles AS RESTRICTIVE FOR SELECT TO authenticated USING (public.is_account_active(auth.uid()));


--
-- Name: trainer_profiles trainer_profiles: read own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "trainer_profiles: read own" ON public.trainer_profiles FOR SELECT TO authenticated USING ((auth.uid() = user_id));


--
-- Name: trainer_program_templates; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.trainer_program_templates ENABLE ROW LEVEL SECURITY;

--
-- Name: trainer_program_templates trainer_program_templates: manage active owner; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "trainer_program_templates: manage active owner" ON public.trainer_program_templates TO authenticated USING (((trainer_user_id = auth.uid()) AND (EXISTS ( SELECT 1
   FROM public.trainer_profiles trainer_profile
  WHERE ((trainer_profile.user_id = auth.uid()) AND (trainer_profile.status = 'active'::text) AND public.is_account_active(auth.uid())))))) WITH CHECK (((trainer_user_id = auth.uid()) AND (EXISTS ( SELECT 1
   FROM public.trainer_profiles trainer_profile
  WHERE ((trainer_profile.user_id = auth.uid()) AND (trainer_profile.status = 'active'::text) AND public.is_account_active(auth.uid()))))));


--
-- Name: trainer_service_offerings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.trainer_service_offerings ENABLE ROW LEVEL SECURITY;

--
-- Name: trainer_service_offerings trainer_service_offerings: manage own active profile; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "trainer_service_offerings: manage own active profile" ON public.trainer_service_offerings TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.trainer_profiles trainer_profile
  WHERE ((trainer_profile.id = trainer_service_offerings.trainer_profile_id) AND (trainer_profile.user_id = auth.uid()) AND (trainer_profile.status = 'active'::text))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.trainer_profiles trainer_profile
  WHERE ((trainer_profile.id = trainer_service_offerings.trainer_profile_id) AND (trainer_profile.user_id = auth.uid()) AND (trainer_profile.status = 'active'::text)))));


--
-- Name: trainer_template_exercises; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.trainer_template_exercises ENABLE ROW LEVEL SECURITY;

--
-- Name: trainer_template_exercises trainer_template_exercises: manage template owner; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "trainer_template_exercises: manage template owner" ON public.trainer_template_exercises TO authenticated USING ((EXISTS ( SELECT 1
   FROM ((public.trainer_template_workouts template_workout
     JOIN public.trainer_program_templates template ON ((template.id = template_workout.template_id)))
     JOIN public.trainer_profiles trainer_profile ON ((trainer_profile.user_id = template.trainer_user_id)))
  WHERE ((template_workout.id = trainer_template_exercises.template_workout_id) AND (template.trainer_user_id = auth.uid()) AND (trainer_profile.status = 'active'::text) AND public.is_account_active(auth.uid()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM ((public.trainer_template_workouts template_workout
     JOIN public.trainer_program_templates template ON ((template.id = template_workout.template_id)))
     JOIN public.trainer_profiles trainer_profile ON ((trainer_profile.user_id = template.trainer_user_id)))
  WHERE ((template_workout.id = trainer_template_exercises.template_workout_id) AND (template.trainer_user_id = auth.uid()) AND (trainer_profile.status = 'active'::text) AND public.is_account_active(auth.uid())))));


--
-- Name: trainer_template_workouts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.trainer_template_workouts ENABLE ROW LEVEL SECURITY;

--
-- Name: trainer_template_workouts trainer_template_workouts: manage template owner; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "trainer_template_workouts: manage template owner" ON public.trainer_template_workouts TO authenticated USING ((EXISTS ( SELECT 1
   FROM (public.trainer_program_templates template
     JOIN public.trainer_profiles trainer_profile ON ((trainer_profile.user_id = template.trainer_user_id)))
  WHERE ((template.id = trainer_template_workouts.template_id) AND (template.trainer_user_id = auth.uid()) AND (trainer_profile.status = 'active'::text) AND public.is_account_active(auth.uid()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM (public.trainer_program_templates template
     JOIN public.trainer_profiles trainer_profile ON ((trainer_profile.user_id = template.trainer_user_id)))
  WHERE ((template.id = trainer_template_workouts.template_id) AND (template.trainer_user_id = auth.uid()) AND (trainer_profile.status = 'active'::text) AND public.is_account_active(auth.uid())))));


--
-- Name: user_blocks; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.user_blocks ENABLE ROW LEVEL SECURITY;

--
-- Name: user_blocks user_blocks: own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "user_blocks: own" ON public.user_blocks TO authenticated USING ((auth.uid() = blocker_id)) WITH CHECK ((auth.uid() = blocker_id));


--
-- Name: workout_exercises; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.workout_exercises ENABLE ROW LEVEL SECURITY;

--
-- Name: workout_exercises workout_exercises: own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "workout_exercises: own" ON public.workout_exercises USING ((EXISTS ( SELECT 1
   FROM public.workouts w
  WHERE ((w.id = workout_exercises.workout_id) AND (w.user_id = auth.uid())))));


--
-- Name: workout_plans; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.workout_plans ENABLE ROW LEVEL SECURITY;

--
-- Name: workout_plans workout_plans: own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "workout_plans: own" ON public.workout_plans USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));


--
-- Name: workouts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.workouts ENABLE ROW LEVEL SECURITY;

--
-- Name: workouts workouts: own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "workouts: own" ON public.workouts USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));


--
-- Name: SCHEMA public; Type: ACL; Schema: -; Owner: -
--

GRANT USAGE ON SCHEMA public TO postgres;
GRANT USAGE ON SCHEMA public TO anon;
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT USAGE ON SCHEMA public TO service_role;


--
-- Name: FUNCTION capture_session_completion_milestone(); Type: ACL; Schema: private; Owner: -
--

REVOKE ALL ON FUNCTION private.capture_session_completion_milestone() FROM PUBLIC;


--
-- Name: FUNCTION accept_coaching_request(request_id uuid, idempotency_key uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.accept_coaching_request(request_id uuid, idempotency_key uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.accept_coaching_request(request_id uuid, idempotency_key uuid) TO authenticated;


--
-- Name: FUNCTION accept_trainer_assignment(p_assignment_id uuid, p_idempotency_key text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.accept_trainer_assignment(p_assignment_id uuid, p_idempotency_key text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.accept_trainer_assignment(p_assignment_id uuid, p_idempotency_key text) TO authenticated;
GRANT ALL ON FUNCTION public.accept_trainer_assignment(p_assignment_id uuid, p_idempotency_key text) TO service_role;


--
-- Name: FUNCTION activate_plan_version(p_plan_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.activate_plan_version(p_plan_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.activate_plan_version(p_plan_id uuid) TO anon;
GRANT ALL ON FUNCTION public.activate_plan_version(p_plan_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.activate_plan_version(p_plan_id uuid) TO service_role;


--
-- Name: FUNCTION append_trainer_template_exercises(p_template_workout_id uuid, p_exercises jsonb); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.append_trainer_template_exercises(p_template_workout_id uuid, p_exercises jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.append_trainer_template_exercises(p_template_workout_id uuid, p_exercises jsonb) TO authenticated;
GRANT ALL ON FUNCTION public.append_trainer_template_exercises(p_template_workout_id uuid, p_exercises jsonb) TO service_role;


--
-- Name: FUNCTION apply_workout_adjustment_atomic(p_workout_id uuid, p_changes jsonb); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.apply_workout_adjustment_atomic(p_workout_id uuid, p_changes jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.apply_workout_adjustment_atomic(p_workout_id uuid, p_changes jsonb) TO service_role;
GRANT ALL ON FUNCTION public.apply_workout_adjustment_atomic(p_workout_id uuid, p_changes jsonb) TO authenticated;


--
-- Name: FUNCTION assert_professional_plan_replaceable(p_user_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.assert_professional_plan_replaceable(p_user_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.assert_professional_plan_replaceable(p_user_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.assert_professional_plan_replaceable(p_user_id uuid) TO service_role;


--
-- Name: FUNCTION audit_applicant_trainer_application_event(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.audit_applicant_trainer_application_event() FROM PUBLIC;


--
-- Name: FUNCTION audit_coaching_materialization(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.audit_coaching_materialization() FROM PUBLIC;


--
-- Name: FUNCTION audit_trainer_application_draft_change(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.audit_trainer_application_draft_change() FROM PUBLIC;


--
-- Name: FUNCTION audit_trainer_assignment_freeze(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.audit_trainer_assignment_freeze() FROM PUBLIC;


--
-- Name: FUNCTION audit_trainer_owned_change(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.audit_trainer_owned_change() FROM PUBLIC;


--
-- Name: FUNCTION authorize_session_start(p_client_session_id uuid, p_workout_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.authorize_session_start(p_client_session_id uuid, p_workout_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.authorize_session_start(p_client_session_id uuid, p_workout_id uuid) TO anon;
GRANT ALL ON FUNCTION public.authorize_session_start(p_client_session_id uuid, p_workout_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.authorize_session_start(p_client_session_id uuid, p_workout_id uuid) TO service_role;


--
-- Name: FUNCTION authorize_session_start_legacy_v1(p_client_session_id uuid, p_workout_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.authorize_session_start_legacy_v1(p_client_session_id uuid, p_workout_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.authorize_session_start_legacy_v1(p_client_session_id uuid, p_workout_id uuid) TO anon;
GRANT ALL ON FUNCTION public.authorize_session_start_legacy_v1(p_client_session_id uuid, p_workout_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.authorize_session_start_legacy_v1(p_client_session_id uuid, p_workout_id uuid) TO service_role;


--
-- Name: FUNCTION bump_post_comment_count(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.bump_post_comment_count() TO anon;
GRANT ALL ON FUNCTION public.bump_post_comment_count() TO authenticated;
GRANT ALL ON FUNCTION public.bump_post_comment_count() TO service_role;


--
-- Name: FUNCTION bump_post_like_count(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.bump_post_like_count() TO anon;
GRANT ALL ON FUNCTION public.bump_post_like_count() TO authenticated;
GRANT ALL ON FUNCTION public.bump_post_like_count() TO service_role;


--
-- Name: FUNCTION bump_profile_post_count(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.bump_profile_post_count() TO anon;
GRANT ALL ON FUNCTION public.bump_profile_post_count() TO authenticated;
GRANT ALL ON FUNCTION public.bump_profile_post_count() TO service_role;


--
-- Name: FUNCTION cancel_coaching_request(p_request_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.cancel_coaching_request(p_request_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.cancel_coaching_request(p_request_id uuid) TO authenticated;


--
-- Name: FUNCTION cleanup_trainer_security_e2e_fixture(p_run_id text, p_user_ids uuid[]); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.cleanup_trainer_security_e2e_fixture(p_run_id text, p_user_ids uuid[]) FROM PUBLIC;
GRANT ALL ON FUNCTION public.cleanup_trainer_security_e2e_fixture(p_run_id text, p_user_ids uuid[]) TO service_role;


--
-- Name: FUNCTION clone_plan_from_post_atomic(p_post_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.clone_plan_from_post_atomic(p_post_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.clone_plan_from_post_atomic(p_post_id uuid) TO anon;
GRANT ALL ON FUNCTION public.clone_plan_from_post_atomic(p_post_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.clone_plan_from_post_atomic(p_post_id uuid) TO service_role;


--
-- Name: FUNCTION create_coaching_request(service_id uuid, message text, consent_version text, idempotency_key uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.create_coaching_request(service_id uuid, message text, consent_version text, idempotency_key uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.create_coaching_request(service_id uuid, message text, consent_version text, idempotency_key uuid) TO authenticated;


--
-- Name: FUNCTION create_engine_plan(p_plan jsonb, p_metadata jsonb, p_week_number integer, p_plan_context text, p_parent_plan_id uuid, p_profile_updates jsonb); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.create_engine_plan(p_plan jsonb, p_metadata jsonb, p_week_number integer, p_plan_context text, p_parent_plan_id uuid, p_profile_updates jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.create_engine_plan(p_plan jsonb, p_metadata jsonb, p_week_number integer, p_plan_context text, p_parent_plan_id uuid, p_profile_updates jsonb) TO anon;
GRANT ALL ON FUNCTION public.create_engine_plan(p_plan jsonb, p_metadata jsonb, p_week_number integer, p_plan_context text, p_parent_plan_id uuid, p_profile_updates jsonb) TO authenticated;
GRANT ALL ON FUNCTION public.create_engine_plan(p_plan jsonb, p_metadata jsonb, p_week_number integer, p_plan_context text, p_parent_plan_id uuid, p_profile_updates jsonb) TO service_role;


--
-- Name: FUNCTION create_engine_plan_v2(p_plan jsonb, p_metadata jsonb, p_week_number integer, p_plan_context text, p_expected_parent_plan_id uuid, p_generation_request_id uuid, p_profile_updates jsonb); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.create_engine_plan_v2(p_plan jsonb, p_metadata jsonb, p_week_number integer, p_plan_context text, p_expected_parent_plan_id uuid, p_generation_request_id uuid, p_profile_updates jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.create_engine_plan_v2(p_plan jsonb, p_metadata jsonb, p_week_number integer, p_plan_context text, p_expected_parent_plan_id uuid, p_generation_request_id uuid, p_profile_updates jsonb) TO anon;
GRANT ALL ON FUNCTION public.create_engine_plan_v2(p_plan jsonb, p_metadata jsonb, p_week_number integer, p_plan_context text, p_expected_parent_plan_id uuid, p_generation_request_id uuid, p_profile_updates jsonb) TO authenticated;
GRANT ALL ON FUNCTION public.create_engine_plan_v2(p_plan jsonb, p_metadata jsonb, p_week_number integer, p_plan_context text, p_expected_parent_plan_id uuid, p_generation_request_id uuid, p_profile_updates jsonb) TO service_role;


--
-- Name: FUNCTION create_manual_plan_atomic(p_plan jsonb, p_workouts jsonb, p_make_active boolean); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.create_manual_plan_atomic(p_plan jsonb, p_workouts jsonb, p_make_active boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION public.create_manual_plan_atomic(p_plan jsonb, p_workouts jsonb, p_make_active boolean) TO anon;
GRANT ALL ON FUNCTION public.create_manual_plan_atomic(p_plan jsonb, p_workouts jsonb, p_make_active boolean) TO authenticated;
GRANT ALL ON FUNCTION public.create_manual_plan_atomic(p_plan jsonb, p_workouts jsonb, p_make_active boolean) TO service_role;


--
-- Name: TABLE product_notifications; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.product_notifications TO service_role;
GRANT SELECT ON TABLE public.product_notifications TO authenticated;


--
-- Name: COLUMN product_notifications.read_at; Type: ACL; Schema: public; Owner: -
--

GRANT UPDATE(read_at) ON TABLE public.product_notifications TO authenticated;


--
-- Name: COLUMN product_notifications.dismissed_at; Type: ACL; Schema: public; Owner: -
--

GRANT UPDATE(dismissed_at) ON TABLE public.product_notifications TO authenticated;


--
-- Name: FUNCTION create_product_notification(p_user_id uuid, p_type text, p_title text, p_body text, p_url text, p_dedupe_key text, p_payload jsonb); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.create_product_notification(p_user_id uuid, p_type text, p_title text, p_body text, p_url text, p_dedupe_key text, p_payload jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.create_product_notification(p_user_id uuid, p_type text, p_title text, p_body text, p_url text, p_dedupe_key text, p_payload jsonb) TO service_role;


--
-- Name: FUNCTION create_trainer_application_credential(p_credential_id uuid, p_application_id uuid, p_credential_type text, p_title text, p_issuer text, p_issued_on date, p_expires_on date, p_external_url text, p_mime_type text, p_size_bytes bigint); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.create_trainer_application_credential(p_credential_id uuid, p_application_id uuid, p_credential_type text, p_title text, p_issuer text, p_issued_on date, p_expires_on date, p_external_url text, p_mime_type text, p_size_bytes bigint) FROM PUBLIC;
GRANT ALL ON FUNCTION public.create_trainer_application_credential(p_credential_id uuid, p_application_id uuid, p_credential_type text, p_title text, p_issuer text, p_issued_on date, p_expires_on date, p_external_url text, p_mime_type text, p_size_bytes bigint) TO authenticated;


--
-- Name: FUNCTION decline_coaching_request(request_id uuid, reason text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.decline_coaching_request(request_id uuid, reason text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.decline_coaching_request(request_id uuid, reason text) TO authenticated;


--
-- Name: FUNCTION decline_trainer_assignment(p_assignment_id uuid, p_reason text, p_idempotency_key text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.decline_trainer_assignment(p_assignment_id uuid, p_reason text, p_idempotency_key text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.decline_trainer_assignment(p_assignment_id uuid, p_reason text, p_idempotency_key text) TO authenticated;
GRANT ALL ON FUNCTION public.decline_trainer_assignment(p_assignment_id uuid, p_reason text, p_idempotency_key text) TO service_role;


--
-- Name: FUNCTION dismiss_current_notification_attention(p_notice_key text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.dismiss_current_notification_attention(p_notice_key text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.dismiss_current_notification_attention(p_notice_key text) TO authenticated;


--
-- Name: FUNCTION end_coaching_relationship(p_relationship_id uuid, p_reason text, p_idempotency_key uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.end_coaching_relationship(p_relationship_id uuid, p_reason text, p_idempotency_key uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.end_coaching_relationship(p_relationship_id uuid, p_reason text, p_idempotency_key uuid) TO authenticated;


--
-- Name: FUNCTION enforce_completed_session_snapshot_immutability(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.enforce_completed_session_snapshot_immutability() FROM PUBLIC;
GRANT ALL ON FUNCTION public.enforce_completed_session_snapshot_immutability() TO anon;
GRANT ALL ON FUNCTION public.enforce_completed_session_snapshot_immutability() TO authenticated;
GRANT ALL ON FUNCTION public.enforce_completed_session_snapshot_immutability() TO service_role;


--
-- Name: FUNCTION enforce_exercise_log_immutability(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.enforce_exercise_log_immutability() FROM PUBLIC;
GRANT ALL ON FUNCTION public.enforce_exercise_log_immutability() TO anon;
GRANT ALL ON FUNCTION public.enforce_exercise_log_immutability() TO authenticated;
GRANT ALL ON FUNCTION public.enforce_exercise_log_immutability() TO service_role;


--
-- Name: FUNCTION enforce_plan_family_limit(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.enforce_plan_family_limit() FROM PUBLIC;
GRANT ALL ON FUNCTION public.enforce_plan_family_limit() TO anon;
GRANT ALL ON FUNCTION public.enforce_plan_family_limit() TO authenticated;
GRANT ALL ON FUNCTION public.enforce_plan_family_limit() TO service_role;


--
-- Name: FUNCTION enforce_protected_profile_fields(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.enforce_protected_profile_fields() TO anon;
GRANT ALL ON FUNCTION public.enforce_protected_profile_fields() TO authenticated;
GRANT ALL ON FUNCTION public.enforce_protected_profile_fields() TO service_role;


--
-- Name: FUNCTION enforce_subscription_tier_change(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.enforce_subscription_tier_change() FROM PUBLIC;
GRANT ALL ON FUNCTION public.enforce_subscription_tier_change() TO anon;
GRANT ALL ON FUNCTION public.enforce_subscription_tier_change() TO authenticated;
GRANT ALL ON FUNCTION public.enforce_subscription_tier_change() TO service_role;


--
-- Name: FUNCTION enforce_trainer_workout_iso_schedule(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.enforce_trainer_workout_iso_schedule() FROM PUBLIC;


--
-- Name: FUNCTION finalize_trainer_credential_cleanup(p_cleanup_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.finalize_trainer_credential_cleanup(p_cleanup_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.finalize_trainer_credential_cleanup(p_cleanup_id uuid) TO authenticated;


--
-- Name: FUNCTION freeze_trainer_assignments_for_relationship(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.freeze_trainer_assignments_for_relationship() TO anon;
GRANT ALL ON FUNCTION public.freeze_trainer_assignments_for_relationship() TO authenticated;
GRANT ALL ON FUNCTION public.freeze_trainer_assignments_for_relationship() TO service_role;


--
-- Name: FUNCTION get_calendar_payload(p_time_zone text, p_from timestamp with time zone); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.get_calendar_payload(p_time_zone text, p_from timestamp with time zone) TO anon;
GRANT ALL ON FUNCTION public.get_calendar_payload(p_time_zone text, p_from timestamp with time zone) TO authenticated;
GRANT ALL ON FUNCTION public.get_calendar_payload(p_time_zone text, p_from timestamp with time zone) TO service_role;


--
-- Name: FUNCTION get_coach_client_insights(p_client_id uuid, p_from_date date, p_to_date date); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.get_coach_client_insights(p_client_id uuid, p_from_date date, p_to_date date) FROM PUBLIC;
GRANT ALL ON FUNCTION public.get_coach_client_insights(p_client_id uuid, p_from_date date, p_to_date date) TO authenticated;


--
-- Name: FUNCTION get_coach_client_measurements(p_client_id uuid, p_from_date date, p_to_date date); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.get_coach_client_measurements(p_client_id uuid, p_from_date date, p_to_date date) FROM PUBLIC;
GRANT ALL ON FUNCTION public.get_coach_client_measurements(p_client_id uuid, p_from_date date, p_to_date date) TO authenticated;


--
-- Name: FUNCTION get_coach_clients_summary(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.get_coach_clients_summary() FROM PUBLIC;
GRANT ALL ON FUNCTION public.get_coach_clients_summary() TO authenticated;


--
-- Name: FUNCTION get_dashboard_payload(p_week_start timestamp with time zone, p_recent_start timestamp with time zone); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.get_dashboard_payload(p_week_start timestamp with time zone, p_recent_start timestamp with time zone) TO anon;
GRANT ALL ON FUNCTION public.get_dashboard_payload(p_week_start timestamp with time zone, p_recent_start timestamp with time zone) TO authenticated;
GRANT ALL ON FUNCTION public.get_dashboard_payload(p_week_start timestamp with time zone, p_recent_start timestamp with time zone) TO service_role;


--
-- Name: FUNCTION get_exercise_detail_payload(p_exercise_id uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.get_exercise_detail_payload(p_exercise_id uuid) TO anon;
GRANT ALL ON FUNCTION public.get_exercise_detail_payload(p_exercise_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.get_exercise_detail_payload(p_exercise_id uuid) TO service_role;


--
-- Name: FUNCTION get_history_payload(p_limit integer); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.get_history_payload(p_limit integer) TO anon;
GRANT ALL ON FUNCTION public.get_history_payload(p_limit integer) TO authenticated;
GRANT ALL ON FUNCTION public.get_history_payload(p_limit integer) TO service_role;


--
-- Name: FUNCTION get_plan_history_continuity_schema_version(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.get_plan_history_continuity_schema_version() FROM PUBLIC;
GRANT ALL ON FUNCTION public.get_plan_history_continuity_schema_version() TO anon;
GRANT ALL ON FUNCTION public.get_plan_history_continuity_schema_version() TO authenticated;
GRANT ALL ON FUNCTION public.get_plan_history_continuity_schema_version() TO service_role;


--
-- Name: FUNCTION get_requestable_trainer_services(trainer_slug text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.get_requestable_trainer_services(trainer_slug text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.get_requestable_trainer_services(trainer_slug text) TO authenticated;


--
-- Name: FUNCTION grant_body_measurements_consent(p_relationship_id uuid, p_consent_version text, p_idempotency_key uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.grant_body_measurements_consent(p_relationship_id uuid, p_consent_version text, p_idempotency_key uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.grant_body_measurements_consent(p_relationship_id uuid, p_consent_version text, p_idempotency_key uuid) TO authenticated;


--
-- Name: FUNCTION grant_training_profile_consent(p_relationship_id uuid, p_consent_version text, p_idempotency_key uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.grant_training_profile_consent(p_relationship_id uuid, p_consent_version text, p_idempotency_key uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.grant_training_profile_consent(p_relationship_id uuid, p_consent_version text, p_idempotency_key uuid) TO authenticated;
GRANT ALL ON FUNCTION public.grant_training_profile_consent(p_relationship_id uuid, p_consent_version text, p_idempotency_key uuid) TO service_role;


--
-- Name: FUNCTION guard_locked_trainer_plan_mutation(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.guard_locked_trainer_plan_mutation() TO anon;
GRANT ALL ON FUNCTION public.guard_locked_trainer_plan_mutation() TO authenticated;
GRANT ALL ON FUNCTION public.guard_locked_trainer_plan_mutation() TO service_role;


--
-- Name: FUNCTION guard_locked_trainer_workout_exercise_mutation(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.guard_locked_trainer_workout_exercise_mutation() TO anon;
GRANT ALL ON FUNCTION public.guard_locked_trainer_workout_exercise_mutation() TO authenticated;
GRANT ALL ON FUNCTION public.guard_locked_trainer_workout_exercise_mutation() TO service_role;


--
-- Name: FUNCTION guard_locked_trainer_workout_mutation(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.guard_locked_trainer_workout_mutation() TO anon;
GRANT ALL ON FUNCTION public.guard_locked_trainer_workout_mutation() TO authenticated;
GRANT ALL ON FUNCTION public.guard_locked_trainer_workout_mutation() TO service_role;


--
-- Name: FUNCTION guard_plan_lifecycle_mutation(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.guard_plan_lifecycle_mutation() FROM PUBLIC;
GRANT ALL ON FUNCTION public.guard_plan_lifecycle_mutation() TO anon;
GRANT ALL ON FUNCTION public.guard_plan_lifecycle_mutation() TO authenticated;
GRANT ALL ON FUNCTION public.guard_plan_lifecycle_mutation() TO service_role;


--
-- Name: FUNCTION guard_profile_weight_derived(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.guard_profile_weight_derived() FROM PUBLIC;
GRANT ALL ON FUNCTION public.guard_profile_weight_derived() TO anon;
GRANT ALL ON FUNCTION public.guard_profile_weight_derived() TO authenticated;
GRANT ALL ON FUNCTION public.guard_profile_weight_derived() TO service_role;


--
-- Name: FUNCTION guard_referenced_trainer_assignment_version_delete(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.guard_referenced_trainer_assignment_version_delete() TO anon;
GRANT ALL ON FUNCTION public.guard_referenced_trainer_assignment_version_delete() TO authenticated;
GRANT ALL ON FUNCTION public.guard_referenced_trainer_assignment_version_delete() TO service_role;


--
-- Name: FUNCTION guard_trainer_assignment_version_immutability(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.guard_trainer_assignment_version_immutability() TO anon;
GRANT ALL ON FUNCTION public.guard_trainer_assignment_version_immutability() TO authenticated;
GRANT ALL ON FUNCTION public.guard_trainer_assignment_version_immutability() TO service_role;


--
-- Name: FUNCTION handle_new_user(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.handle_new_user() TO anon;
GRANT ALL ON FUNCTION public.handle_new_user() TO authenticated;
GRANT ALL ON FUNCTION public.handle_new_user() TO service_role;


--
-- Name: FUNCTION has_active_coaching_scope(p_trainer_id uuid, p_client_id uuid, p_scope text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.has_active_coaching_scope(p_trainer_id uuid, p_client_id uuid, p_scope text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.has_active_coaching_scope(p_trainer_id uuid, p_client_id uuid, p_scope text) TO authenticated;


--
-- Name: FUNCTION is_account_active(p_user_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.is_account_active(p_user_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.is_account_active(p_user_id uuid) TO anon;
GRANT ALL ON FUNCTION public.is_account_active(p_user_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.is_account_active(p_user_id uuid) TO service_role;


--
-- Name: FUNCTION is_professional_audit_event_allowed(p_entity_type text, p_action text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.is_professional_audit_event_allowed(p_entity_type text, p_action text) FROM PUBLIC;


--
-- Name: FUNCTION list_trainer_credential_cleanup(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.list_trainer_credential_cleanup() FROM PUBLIC;
GRANT ALL ON FUNCTION public.list_trainer_credential_cleanup() TO authenticated;


--
-- Name: FUNCTION notify_trainer_application_admins(p_application_id uuid, p_event_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.notify_trainer_application_admins(p_application_id uuid, p_event_id uuid) FROM PUBLIC;


--
-- Name: FUNCTION prepare_trainer_credential_removal(p_application_id uuid, p_credential_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.prepare_trainer_credential_removal(p_application_id uuid, p_credential_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.prepare_trainer_credential_removal(p_application_id uuid, p_credential_id uuid) TO authenticated;


--
-- Name: FUNCTION propose_trainer_assignment(p_relationship_id uuid, p_template_id uuid, p_change_summary text, p_idempotency_key text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.propose_trainer_assignment(p_relationship_id uuid, p_template_id uuid, p_change_summary text, p_idempotency_key text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.propose_trainer_assignment(p_relationship_id uuid, p_template_id uuid, p_change_summary text, p_idempotency_key text) TO authenticated;
GRANT ALL ON FUNCTION public.propose_trainer_assignment(p_relationship_id uuid, p_template_id uuid, p_change_summary text, p_idempotency_key text) TO service_role;


--
-- Name: FUNCTION provision_product_notification_preferences(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.provision_product_notification_preferences() TO anon;
GRANT ALL ON FUNCTION public.provision_product_notification_preferences() TO authenticated;
GRANT ALL ON FUNCTION public.provision_product_notification_preferences() TO service_role;


--
-- Name: FUNCTION publish_trainer_assignment_revision(p_assignment_id uuid, p_template_id uuid, p_change_summary text, p_idempotency_key text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.publish_trainer_assignment_revision(p_assignment_id uuid, p_template_id uuid, p_change_summary text, p_idempotency_key text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.publish_trainer_assignment_revision(p_assignment_id uuid, p_template_id uuid, p_change_summary text, p_idempotency_key text) TO authenticated;
GRANT ALL ON FUNCTION public.publish_trainer_assignment_revision(p_assignment_id uuid, p_template_id uuid, p_change_summary text, p_idempotency_key text) TO service_role;


--
-- Name: FUNCTION queue_trainer_credential_cleanup(p_application_id uuid, p_credential_id uuid, p_storage_path text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.queue_trainer_credential_cleanup(p_application_id uuid, p_credential_id uuid, p_storage_path text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.queue_trainer_credential_cleanup(p_application_id uuid, p_credential_id uuid, p_storage_path text) TO authenticated;


--
-- Name: FUNCTION reactivate_and_reinstate_trainer(p_user_id uuid, p_admin_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.reactivate_and_reinstate_trainer(p_user_id uuid, p_admin_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.reactivate_and_reinstate_trainer(p_user_id uuid, p_admin_id uuid) TO service_role;


--
-- Name: FUNCTION record_plan_generation_failure(p_mode text, p_engine_version text, p_error_code text, p_metadata jsonb); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.record_plan_generation_failure(p_mode text, p_engine_version text, p_error_code text, p_metadata jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.record_plan_generation_failure(p_mode text, p_engine_version text, p_error_code text, p_metadata jsonb) TO anon;
GRANT ALL ON FUNCTION public.record_plan_generation_failure(p_mode text, p_engine_version text, p_error_code text, p_metadata jsonb) TO authenticated;
GRANT ALL ON FUNCTION public.record_plan_generation_failure(p_mode text, p_engine_version text, p_error_code text, p_metadata jsonb) TO service_role;


--
-- Name: FUNCTION record_plan_generation_success(p_plan_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.record_plan_generation_success(p_plan_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.record_plan_generation_success(p_plan_id uuid) TO anon;
GRANT ALL ON FUNCTION public.record_plan_generation_success(p_plan_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.record_plan_generation_success(p_plan_id uuid) TO service_role;


--
-- Name: FUNCTION record_trainer_credential_cleanup_failure(p_cleanup_id uuid, p_error text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.record_trainer_credential_cleanup_failure(p_cleanup_id uuid, p_error text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.record_trainer_credential_cleanup_failure(p_cleanup_id uuid, p_error text) TO authenticated;


--
-- Name: FUNCTION reinstate_trainer_profile(p_user_id uuid, p_admin_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.reinstate_trainer_profile(p_user_id uuid, p_admin_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.reinstate_trainer_profile(p_user_id uuid, p_admin_id uuid) TO service_role;


--
-- Name: FUNCTION reject_professional_audit_log_mutation(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.reject_professional_audit_log_mutation() FROM PUBLIC;


--
-- Name: FUNCTION release_session_authorization(p_client_session_id uuid, p_workout_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.release_session_authorization(p_client_session_id uuid, p_workout_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.release_session_authorization(p_client_session_id uuid, p_workout_id uuid) TO anon;
GRANT ALL ON FUNCTION public.release_session_authorization(p_client_session_id uuid, p_workout_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.release_session_authorization(p_client_session_id uuid, p_workout_id uuid) TO service_role;


--
-- Name: FUNCTION reorder_trainer_template_exercises(p_template_workout_id uuid, p_template_exercise_ids uuid[]); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.reorder_trainer_template_exercises(p_template_workout_id uuid, p_template_exercise_ids uuid[]) FROM PUBLIC;
GRANT ALL ON FUNCTION public.reorder_trainer_template_exercises(p_template_workout_id uuid, p_template_exercise_ids uuid[]) TO authenticated;
GRANT ALL ON FUNCTION public.reorder_trainer_template_exercises(p_template_workout_id uuid, p_template_exercise_ids uuid[]) TO service_role;


--
-- Name: FUNCTION reorder_trainer_template_workouts(p_template_id uuid, p_workout_ids uuid[]); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.reorder_trainer_template_workouts(p_template_id uuid, p_workout_ids uuid[]) FROM PUBLIC;
GRANT ALL ON FUNCTION public.reorder_trainer_template_workouts(p_template_id uuid, p_workout_ids uuid[]) TO authenticated;
GRANT ALL ON FUNCTION public.reorder_trainer_template_workouts(p_template_id uuid, p_workout_ids uuid[]) TO service_role;


--
-- Name: FUNCTION require_active_coaching_admin(p_admin_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.require_active_coaching_admin(p_admin_id uuid) FROM PUBLIC;


--
-- Name: FUNCTION require_active_coaching_trainer(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.require_active_coaching_trainer() FROM PUBLIC;
GRANT ALL ON FUNCTION public.require_active_coaching_trainer() TO service_role;


--
-- Name: FUNCTION require_active_trainer_service_profile(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.require_active_trainer_service_profile() FROM PUBLIC;
GRANT ALL ON FUNCTION public.require_active_trainer_service_profile() TO service_role;


--
-- Name: FUNCTION require_coaching_service_trainer_match(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.require_coaching_service_trainer_match() FROM PUBLIC;
GRANT ALL ON FUNCTION public.require_coaching_service_trainer_match() TO service_role;


--
-- Name: FUNCTION require_no_active_coaching_relationship_for_pending_request(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.require_no_active_coaching_relationship_for_pending_request() FROM PUBLIC;
GRANT ALL ON FUNCTION public.require_no_active_coaching_relationship_for_pending_request() TO service_role;


--
-- Name: FUNCTION require_public_trainer_template_exercise(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.require_public_trainer_template_exercise() TO anon;
GRANT ALL ON FUNCTION public.require_public_trainer_template_exercise() TO authenticated;
GRANT ALL ON FUNCTION public.require_public_trainer_template_exercise() TO service_role;


--
-- Name: FUNCTION require_trainer_assignment_relationship_match(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.require_trainer_assignment_relationship_match() TO anon;
GRANT ALL ON FUNCTION public.require_trainer_assignment_relationship_match() TO authenticated;
GRANT ALL ON FUNCTION public.require_trainer_assignment_relationship_match() TO service_role;


--
-- Name: FUNCTION resume_paused_coaching_relationship(p_relationship_id uuid, p_idempotency_key uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.resume_paused_coaching_relationship(p_relationship_id uuid, p_idempotency_key uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.resume_paused_coaching_relationship(p_relationship_id uuid, p_idempotency_key uuid) TO authenticated;
GRANT ALL ON FUNCTION public.resume_paused_coaching_relationship(p_relationship_id uuid, p_idempotency_key uuid) TO service_role;


--
-- Name: FUNCTION retire_plan_family(p_plan_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.retire_plan_family(p_plan_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.retire_plan_family(p_plan_id uuid) TO anon;
GRANT ALL ON FUNCTION public.retire_plan_family(p_plan_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.retire_plan_family(p_plan_id uuid) TO service_role;


--
-- Name: FUNCTION revoke_body_measurements_consent(p_relationship_id uuid, p_idempotency_key uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.revoke_body_measurements_consent(p_relationship_id uuid, p_idempotency_key uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.revoke_body_measurements_consent(p_relationship_id uuid, p_idempotency_key uuid) TO authenticated;


--
-- Name: FUNCTION revoke_training_profile_consent(p_relationship_id uuid, p_idempotency_key uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.revoke_training_profile_consent(p_relationship_id uuid, p_idempotency_key uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.revoke_training_profile_consent(p_relationship_id uuid, p_idempotency_key uuid) TO authenticated;


--
-- Name: FUNCTION sanitize_professional_audit_log_insert(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.sanitize_professional_audit_log_insert() FROM PUBLIC;


--
-- Name: FUNCTION sanitize_professional_audit_metadata(p_entity_type text, p_action text, p_metadata jsonb); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.sanitize_professional_audit_metadata(p_entity_type text, p_action text, p_metadata jsonb) FROM PUBLIC;


--
-- Name: FUNCTION save_session_log_atomic(p_client_session_id uuid, p_workout_id uuid, p_completed_at timestamp with time zone, p_duration_minutes integer, p_mood_rating integer, p_exercise_logs jsonb, p_result_snapshot jsonb); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.save_session_log_atomic(p_client_session_id uuid, p_workout_id uuid, p_completed_at timestamp with time zone, p_duration_minutes integer, p_mood_rating integer, p_exercise_logs jsonb, p_result_snapshot jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.save_session_log_atomic(p_client_session_id uuid, p_workout_id uuid, p_completed_at timestamp with time zone, p_duration_minutes integer, p_mood_rating integer, p_exercise_logs jsonb, p_result_snapshot jsonb) TO anon;
GRANT ALL ON FUNCTION public.save_session_log_atomic(p_client_session_id uuid, p_workout_id uuid, p_completed_at timestamp with time zone, p_duration_minutes integer, p_mood_rating integer, p_exercise_logs jsonb, p_result_snapshot jsonb) TO service_role;


--
-- Name: FUNCTION save_session_log_atomic_v2(p_client_session_id uuid, p_workout_id uuid, p_completed_at timestamp with time zone, p_duration_minutes integer, p_mood_rating integer, p_exercise_logs jsonb, p_result_snapshot jsonb); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.save_session_log_atomic_v2(p_client_session_id uuid, p_workout_id uuid, p_completed_at timestamp with time zone, p_duration_minutes integer, p_mood_rating integer, p_exercise_logs jsonb, p_result_snapshot jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.save_session_log_atomic_v2(p_client_session_id uuid, p_workout_id uuid, p_completed_at timestamp with time zone, p_duration_minutes integer, p_mood_rating integer, p_exercise_logs jsonb, p_result_snapshot jsonb) TO anon;
GRANT ALL ON FUNCTION public.save_session_log_atomic_v2(p_client_session_id uuid, p_workout_id uuid, p_completed_at timestamp with time zone, p_duration_minutes integer, p_mood_rating integer, p_exercise_logs jsonb, p_result_snapshot jsonb) TO service_role;


--
-- Name: FUNCTION save_session_log_atomic_v3(p_client_session_id uuid, p_workout_id uuid, p_completed_at timestamp with time zone, p_duration_minutes integer, p_mood_rating integer, p_exercise_logs jsonb, p_result_snapshot jsonb); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.save_session_log_atomic_v3(p_client_session_id uuid, p_workout_id uuid, p_completed_at timestamp with time zone, p_duration_minutes integer, p_mood_rating integer, p_exercise_logs jsonb, p_result_snapshot jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.save_session_log_atomic_v3(p_client_session_id uuid, p_workout_id uuid, p_completed_at timestamp with time zone, p_duration_minutes integer, p_mood_rating integer, p_exercise_logs jsonb, p_result_snapshot jsonb) TO authenticated;
GRANT ALL ON FUNCTION public.save_session_log_atomic_v3(p_client_session_id uuid, p_workout_id uuid, p_completed_at timestamp with time zone, p_duration_minutes integer, p_mood_rating integer, p_exercise_logs jsonb, p_result_snapshot jsonb) TO service_role;


--
-- Name: FUNCTION save_trainer_application_draft(p_payload jsonb); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.save_trainer_application_draft(p_payload jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.save_trainer_application_draft(p_payload jsonb) TO authenticated;


--
-- Name: FUNCTION save_trainer_profile_changes(p_payload jsonb); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.save_trainer_profile_changes(p_payload jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.save_trainer_profile_changes(p_payload jsonb) TO authenticated;


--
-- Name: FUNCTION set_subscription_tier_atomic(p_user_id uuid, p_subscription_tier text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.set_subscription_tier_atomic(p_user_id uuid, p_subscription_tier text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.set_subscription_tier_atomic(p_user_id uuid, p_subscription_tier text) TO anon;
GRANT ALL ON FUNCTION public.set_subscription_tier_atomic(p_user_id uuid, p_subscription_tier text) TO authenticated;
GRANT ALL ON FUNCTION public.set_subscription_tier_atomic(p_user_id uuid, p_subscription_tier text) TO service_role;


--
-- Name: FUNCTION snapshot_admin_audit_identity(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.snapshot_admin_audit_identity() FROM PUBLIC;


--
-- Name: FUNCTION submit_trainer_application(p_application_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.submit_trainer_application(p_application_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.submit_trainer_application(p_application_id uuid) TO authenticated;


--
-- Name: FUNCTION suspend_account_and_professional(p_user_id uuid, p_admin_id uuid, p_reason text, p_until timestamp with time zone); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.suspend_account_and_professional(p_user_id uuid, p_admin_id uuid, p_reason text, p_until timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION public.suspend_account_and_professional(p_user_id uuid, p_admin_id uuid, p_reason text, p_until timestamp with time zone) TO service_role;


--
-- Name: FUNCTION sync_profile_weight_from_measurements(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.sync_profile_weight_from_measurements() FROM PUBLIC;
GRANT ALL ON FUNCTION public.sync_profile_weight_from_measurements() TO anon;
GRANT ALL ON FUNCTION public.sync_profile_weight_from_measurements() TO authenticated;
GRANT ALL ON FUNCTION public.sync_profile_weight_from_measurements() TO service_role;


--
-- Name: FUNCTION touch_coaching_relationships_updated_at(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.touch_coaching_relationships_updated_at() FROM PUBLIC;
GRANT ALL ON FUNCTION public.touch_coaching_relationships_updated_at() TO service_role;


--
-- Name: FUNCTION touch_product_notification_updated_at(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.touch_product_notification_updated_at() TO anon;
GRANT ALL ON FUNCTION public.touch_product_notification_updated_at() TO authenticated;
GRANT ALL ON FUNCTION public.touch_product_notification_updated_at() TO service_role;


--
-- Name: FUNCTION touch_social_push_updated_at(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.touch_social_push_updated_at() TO anon;
GRANT ALL ON FUNCTION public.touch_social_push_updated_at() TO authenticated;
GRANT ALL ON FUNCTION public.touch_social_push_updated_at() TO service_role;


--
-- Name: FUNCTION touch_trainer_verification_updated_at(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.touch_trainer_verification_updated_at() FROM PUBLIC;
GRANT ALL ON FUNCTION public.touch_trainer_verification_updated_at() TO service_role;


--
-- Name: FUNCTION trainer_application_has_eligible_credentials(p_application_id uuid, p_user_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.trainer_application_has_eligible_credentials(p_application_id uuid, p_user_id uuid) FROM PUBLIC;


--
-- Name: FUNCTION trainer_photo_url_is_owned(p_user_id uuid, p_photo_url text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.trainer_photo_url_is_owned(p_user_id uuid, p_photo_url text) FROM PUBLIC;


--
-- Name: FUNCTION trainer_security_preflight(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.trainer_security_preflight() FROM PUBLIC;
GRANT ALL ON FUNCTION public.trainer_security_preflight() TO authenticated;
GRANT ALL ON FUNCTION public.trainer_security_preflight() TO service_role;


--
-- Name: FUNCTION transition_trainer_application(p_application_id uuid, p_actor_user_id uuid, p_action text, p_payload jsonb); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.transition_trainer_application(p_application_id uuid, p_actor_user_id uuid, p_action text, p_payload jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.transition_trainer_application(p_application_id uuid, p_actor_user_id uuid, p_action text, p_payload jsonb) TO service_role;


--
-- Name: FUNCTION update_updated_at(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.update_updated_at() TO anon;
GRANT ALL ON FUNCTION public.update_updated_at() TO authenticated;
GRANT ALL ON FUNCTION public.update_updated_at() TO service_role;


--
-- Name: FUNCTION validate_materialized_assignment_identity(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.validate_materialized_assignment_identity() TO anon;
GRANT ALL ON FUNCTION public.validate_materialized_assignment_identity() TO authenticated;
GRANT ALL ON FUNCTION public.validate_materialized_assignment_identity() TO service_role;


--
-- Name: FUNCTION validate_materialized_assignment_version_identity(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.validate_materialized_assignment_version_identity() TO anon;
GRANT ALL ON FUNCTION public.validate_materialized_assignment_version_identity() TO authenticated;
GRANT ALL ON FUNCTION public.validate_materialized_assignment_version_identity() TO service_role;


--
-- Name: FUNCTION validate_trainer_assigned_plan_identity(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.validate_trainer_assigned_plan_identity() TO anon;
GRANT ALL ON FUNCTION public.validate_trainer_assigned_plan_identity() TO authenticated;
GRANT ALL ON FUNCTION public.validate_trainer_assigned_plan_identity() TO service_role;


--
-- Name: FUNCTION withdraw_trainer_application(p_application_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.withdraw_trainer_application(p_application_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.withdraw_trainer_application(p_application_id uuid) TO authenticated;


--
-- Name: TABLE trainer_profiles; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.trainer_profiles TO service_role;
GRANT SELECT ON TABLE public.trainer_profiles TO authenticated;


--
-- Name: TABLE trainer_service_offerings; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.trainer_service_offerings TO service_role;
GRANT SELECT,DELETE ON TABLE public.trainer_service_offerings TO authenticated;


--
-- Name: COLUMN trainer_service_offerings.trainer_profile_id; Type: ACL; Schema: public; Owner: -
--

GRANT INSERT(trainer_profile_id) ON TABLE public.trainer_service_offerings TO authenticated;


--
-- Name: COLUMN trainer_service_offerings.name; Type: ACL; Schema: public; Owner: -
--

GRANT INSERT(name),UPDATE(name) ON TABLE public.trainer_service_offerings TO authenticated;


--
-- Name: COLUMN trainer_service_offerings.description; Type: ACL; Schema: public; Owner: -
--

GRANT INSERT(description),UPDATE(description) ON TABLE public.trainer_service_offerings TO authenticated;


--
-- Name: COLUMN trainer_service_offerings.modality; Type: ACL; Schema: public; Owner: -
--

GRANT INSERT(modality),UPDATE(modality) ON TABLE public.trainer_service_offerings TO authenticated;


--
-- Name: COLUMN trainer_service_offerings.duration_minutes; Type: ACL; Schema: public; Owner: -
--

GRANT INSERT(duration_minutes),UPDATE(duration_minutes) ON TABLE public.trainer_service_offerings TO authenticated;


--
-- Name: COLUMN trainer_service_offerings.content; Type: ACL; Schema: public; Owner: -
--

GRANT INSERT(content),UPDATE(content) ON TABLE public.trainer_service_offerings TO authenticated;


--
-- Name: COLUMN trainer_service_offerings.capacity; Type: ACL; Schema: public; Owner: -
--

GRANT INSERT(capacity),UPDATE(capacity) ON TABLE public.trainer_service_offerings TO authenticated;


--
-- Name: COLUMN trainer_service_offerings.is_active; Type: ACL; Schema: public; Owner: -
--

GRANT INSERT(is_active),UPDATE(is_active) ON TABLE public.trainer_service_offerings TO authenticated;


--
-- Name: TABLE active_trainer_directory; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.active_trainer_directory TO service_role;
GRANT SELECT ON TABLE public.active_trainer_directory TO authenticated;


--
-- Name: TABLE admin_audit_logs; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.admin_audit_logs TO service_role;


--
-- Name: TABLE ai_conversations; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.ai_conversations TO anon;
GRANT ALL ON TABLE public.ai_conversations TO authenticated;
GRANT ALL ON TABLE public.ai_conversations TO service_role;


--
-- Name: TABLE ai_messages; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.ai_messages TO anon;
GRANT ALL ON TABLE public.ai_messages TO authenticated;
GRANT ALL ON TABLE public.ai_messages TO service_role;


--
-- Name: TABLE ai_usage_logs; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.ai_usage_logs TO anon;
GRANT ALL ON TABLE public.ai_usage_logs TO authenticated;
GRANT ALL ON TABLE public.ai_usage_logs TO service_role;


--
-- Name: TABLE ai_usage_daily; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.ai_usage_daily TO service_role;


--
-- Name: TABLE coaching_consents; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.coaching_consents TO service_role;
GRANT SELECT ON TABLE public.coaching_consents TO authenticated;


--
-- Name: TABLE coaching_relationships; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.coaching_relationships TO service_role;
GRANT SELECT ON TABLE public.coaching_relationships TO authenticated;


--
-- Name: TABLE coaching_requests; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.coaching_requests TO service_role;
GRANT SELECT ON TABLE public.coaching_requests TO authenticated;


--
-- Name: TABLE dashboard_banners; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.dashboard_banners TO authenticated;
GRANT ALL ON TABLE public.dashboard_banners TO service_role;


--
-- Name: TABLE exercise_logs; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.exercise_logs TO service_role;
GRANT SELECT,INSERT ON TABLE public.exercise_logs TO authenticated;


--
-- Name: TABLE exercises; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.exercises TO anon;
GRANT ALL ON TABLE public.exercises TO authenticated;
GRANT ALL ON TABLE public.exercises TO service_role;


--
-- Name: TABLE follows; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.follows TO anon;
GRANT ALL ON TABLE public.follows TO authenticated;
GRANT ALL ON TABLE public.follows TO service_role;


--
-- Name: TABLE measurements; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.measurements TO service_role;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.measurements TO authenticated;


--
-- Name: TABLE notification_attention_dismissals; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.notification_attention_dismissals TO service_role;
GRANT SELECT ON TABLE public.notification_attention_dismissals TO authenticated;


--
-- Name: COLUMN notification_attention_dismissals.notice_key; Type: ACL; Schema: public; Owner: -
--

GRANT INSERT(notice_key) ON TABLE public.notification_attention_dismissals TO authenticated;


--
-- Name: TABLE workout_plans; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.workout_plans TO service_role;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.workout_plans TO authenticated;


--
-- Name: TABLE plan_generation_daily; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.plan_generation_daily TO service_role;


--
-- Name: TABLE plan_generation_events; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.plan_generation_events TO anon;
GRANT ALL ON TABLE public.plan_generation_events TO authenticated;
GRANT ALL ON TABLE public.plan_generation_events TO service_role;


--
-- Name: TABLE plan_generation_health_daily; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.plan_generation_health_daily TO service_role;


--
-- Name: TABLE post_comments; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.post_comments TO anon;
GRANT ALL ON TABLE public.post_comments TO authenticated;
GRANT ALL ON TABLE public.post_comments TO service_role;


--
-- Name: TABLE post_likes; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.post_likes TO anon;
GRANT ALL ON TABLE public.post_likes TO authenticated;
GRANT ALL ON TABLE public.post_likes TO service_role;


--
-- Name: TABLE post_reports; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.post_reports TO anon;
GRANT ALL ON TABLE public.post_reports TO authenticated;
GRANT ALL ON TABLE public.post_reports TO service_role;


--
-- Name: TABLE posts; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.posts TO anon;
GRANT ALL ON TABLE public.posts TO authenticated;
GRANT ALL ON TABLE public.posts TO service_role;


--
-- Name: TABLE product_events; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.product_events TO anon;
GRANT ALL ON TABLE public.product_events TO authenticated;
GRANT ALL ON TABLE public.product_events TO service_role;


--
-- Name: TABLE product_notification_preferences; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.product_notification_preferences TO service_role;
GRANT SELECT ON TABLE public.product_notification_preferences TO authenticated;


--
-- Name: COLUMN product_notification_preferences.professional_enabled; Type: ACL; Schema: public; Owner: -
--

GRANT INSERT(professional_enabled),UPDATE(professional_enabled) ON TABLE public.product_notification_preferences TO authenticated;


--
-- Name: COLUMN product_notification_preferences.push_enabled; Type: ACL; Schema: public; Owner: -
--

GRANT INSERT(push_enabled),UPDATE(push_enabled) ON TABLE public.product_notification_preferences TO authenticated;


--
-- Name: TABLE product_push_tokens; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.product_push_tokens TO service_role;
GRANT SELECT,INSERT ON TABLE public.product_push_tokens TO authenticated;


--
-- Name: COLUMN product_push_tokens.token; Type: ACL; Schema: public; Owner: -
--

GRANT UPDATE(token) ON TABLE public.product_push_tokens TO authenticated;


--
-- Name: COLUMN product_push_tokens.platform; Type: ACL; Schema: public; Owner: -
--

GRANT UPDATE(platform) ON TABLE public.product_push_tokens TO authenticated;


--
-- Name: COLUMN product_push_tokens.device_id; Type: ACL; Schema: public; Owner: -
--

GRANT UPDATE(device_id) ON TABLE public.product_push_tokens TO authenticated;


--
-- Name: COLUMN product_push_tokens.enabled; Type: ACL; Schema: public; Owner: -
--

GRANT UPDATE(enabled) ON TABLE public.product_push_tokens TO authenticated;


--
-- Name: COLUMN product_push_tokens.last_seen_at; Type: ACL; Schema: public; Owner: -
--

GRANT UPDATE(last_seen_at) ON TABLE public.product_push_tokens TO authenticated;


--
-- Name: TABLE professional_audit_logs; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT ON TABLE public.professional_audit_logs TO service_role;


--
-- Name: TABLE profiles; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.profiles TO service_role;
GRANT SELECT,INSERT,UPDATE ON TABLE public.profiles TO authenticated;


--
-- Name: TABLE progress_logs; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.progress_logs TO service_role;
GRANT SELECT,INSERT,UPDATE ON TABLE public.progress_logs TO authenticated;


--
-- Name: TABLE public_profiles; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.public_profiles TO anon;
GRANT ALL ON TABLE public.public_profiles TO authenticated;
GRANT ALL ON TABLE public.public_profiles TO service_role;


--
-- Name: TABLE session_authorizations; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.session_authorizations TO service_role;
GRANT SELECT ON TABLE public.session_authorizations TO authenticated;


--
-- Name: TABLE social_notification_preferences; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.social_notification_preferences TO anon;
GRANT ALL ON TABLE public.social_notification_preferences TO authenticated;
GRANT ALL ON TABLE public.social_notification_preferences TO service_role;


--
-- Name: TABLE social_push_tokens; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.social_push_tokens TO anon;
GRANT ALL ON TABLE public.social_push_tokens TO authenticated;
GRANT ALL ON TABLE public.social_push_tokens TO service_role;


--
-- Name: TABLE trainer_application_credentials; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.trainer_application_credentials TO service_role;
GRANT SELECT ON TABLE public.trainer_application_credentials TO authenticated;


--
-- Name: TABLE trainer_application_events; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.trainer_application_events TO service_role;


--
-- Name: TABLE trainer_applications; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.trainer_applications TO service_role;
GRANT SELECT ON TABLE public.trainer_applications TO authenticated;


--
-- Name: COLUMN trainer_applications.professional_name; Type: ACL; Schema: public; Owner: -
--

GRANT UPDATE(professional_name) ON TABLE public.trainer_applications TO authenticated;


--
-- Name: COLUMN trainer_applications.professional_photo_url; Type: ACL; Schema: public; Owner: -
--

GRANT UPDATE(professional_photo_url) ON TABLE public.trainer_applications TO authenticated;


--
-- Name: COLUMN trainer_applications.bio; Type: ACL; Schema: public; Owner: -
--

GRANT UPDATE(bio) ON TABLE public.trainer_applications TO authenticated;


--
-- Name: COLUMN trainer_applications.specialties; Type: ACL; Schema: public; Owner: -
--

GRANT UPDATE(specialties) ON TABLE public.trainer_applications TO authenticated;


--
-- Name: COLUMN trainer_applications.modalities; Type: ACL; Schema: public; Owner: -
--

GRANT UPDATE(modalities) ON TABLE public.trainer_applications TO authenticated;


--
-- Name: COLUMN trainer_applications.experience_summary; Type: ACL; Schema: public; Owner: -
--

GRANT UPDATE(experience_summary) ON TABLE public.trainer_applications TO authenticated;


--
-- Name: COLUMN trainer_applications.general_location; Type: ACL; Schema: public; Owner: -
--

GRANT UPDATE(general_location) ON TABLE public.trainer_applications TO authenticated;


--
-- Name: COLUMN trainer_applications.languages; Type: ACL; Schema: public; Owner: -
--

GRANT UPDATE(languages) ON TABLE public.trainer_applications TO authenticated;


--
-- Name: COLUMN trainer_applications.contact_email; Type: ACL; Schema: public; Owner: -
--

GRANT UPDATE(contact_email) ON TABLE public.trainer_applications TO authenticated;


--
-- Name: COLUMN trainer_applications.contact_phone; Type: ACL; Schema: public; Owner: -
--

GRANT UPDATE(contact_phone) ON TABLE public.trainer_applications TO authenticated;


--
-- Name: COLUMN trainer_applications.preferred_contact; Type: ACL; Schema: public; Owner: -
--

GRANT UPDATE(preferred_contact) ON TABLE public.trainer_applications TO authenticated;


--
-- Name: COLUMN trainer_applications.timezone; Type: ACL; Schema: public; Owner: -
--

GRANT UPDATE(timezone) ON TABLE public.trainer_applications TO authenticated;


--
-- Name: COLUMN trainer_applications.interview_availability; Type: ACL; Schema: public; Owner: -
--

GRANT UPDATE(interview_availability) ON TABLE public.trainer_applications TO authenticated;


--
-- Name: TABLE trainer_application_events_public; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.trainer_application_events_public TO service_role;
GRANT SELECT ON TABLE public.trainer_application_events_public TO authenticated;


--
-- Name: TABLE trainer_assignment_versions; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.trainer_assignment_versions TO service_role;
GRANT SELECT ON TABLE public.trainer_assignment_versions TO authenticated;


--
-- Name: TABLE trainer_credential_storage_cleanup; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.trainer_credential_storage_cleanup TO service_role;


--
-- Name: TABLE trainer_interviews; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.trainer_interviews TO service_role;


--
-- Name: TABLE trainer_interviews_applicant_public; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.trainer_interviews_applicant_public TO service_role;
GRANT SELECT ON TABLE public.trainer_interviews_applicant_public TO authenticated;


--
-- Name: TABLE trainer_plan_assignments; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.trainer_plan_assignments TO service_role;
GRANT SELECT ON TABLE public.trainer_plan_assignments TO authenticated;


--
-- Name: TABLE trainer_program_templates; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.trainer_program_templates TO service_role;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.trainer_program_templates TO authenticated;


--
-- Name: TABLE trainer_template_exercises; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.trainer_template_exercises TO service_role;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.trainer_template_exercises TO authenticated;


--
-- Name: TABLE trainer_template_workouts; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.trainer_template_workouts TO service_role;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.trainer_template_workouts TO authenticated;


--
-- Name: TABLE user_blocks; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.user_blocks TO anon;
GRANT ALL ON TABLE public.user_blocks TO authenticated;
GRANT ALL ON TABLE public.user_blocks TO service_role;


--
-- Name: TABLE workout_exercises; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.workout_exercises TO service_role;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.workout_exercises TO authenticated;


--
-- Name: TABLE workouts; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.workouts TO service_role;
GRANT SELECT,INSERT,UPDATE ON TABLE public.workouts TO authenticated;


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO service_role;
--
-- PostgreSQL database dump complete
--
-- Bootstrap application storage buckets observed in the linked remote database.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
    ('avatars', 'avatars', true, NULL, NULL),
    ('dashboard-banners', 'dashboard-banners', true, NULL, NULL),
    ('exercise-images', 'exercise-images', true, NULL, NULL),
    ('posts', 'posts', true, NULL, NULL),
    ('trainer-credentials', 'trainer-credentials', false, 10485760, ARRAY['application/pdf', 'image/jpeg', 'image/png'])
ON CONFLICT (id) DO UPDATE
SET name = EXCLUDED.name,
    public = EXCLUDED.public,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;
