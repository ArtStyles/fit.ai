-- Additive mobile backup. Does not authorize or insert web progress/session rows.
BEGIN;

CREATE TABLE public.mobile_sync_entities (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('plan','session','measurement','profile')),
  entity_id uuid NOT NULL,
  payload jsonb NOT NULL CHECK (jsonb_typeof(payload) = 'object' AND octet_length(payload::text) <= 2097152),
  client_updated_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(user_id, kind, entity_id)
);
CREATE TABLE public.mobile_sync_operations (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  operation_id uuid NOT NULL,
  kind text NOT NULL,
  entity_id uuid NOT NULL,
  payload jsonb NOT NULL,
  client_updated_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(user_id, operation_id)
);
ALTER TABLE public.mobile_sync_entities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mobile_sync_entities FORCE ROW LEVEL SECURITY;
ALTER TABLE public.mobile_sync_operations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mobile_sync_operations FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.mobile_sync_entities, public.mobile_sync_operations FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.mobile_sync_entities TO authenticated;
CREATE POLICY mobile_backup_owner_read ON public.mobile_sync_entities FOR SELECT TO authenticated
  USING (user_id = auth.uid() AND public.is_account_active(auth.uid()));

CREATE FUNCTION public.mobile_number_valid(value jsonb, minimum numeric, maximum numeric, nullable boolean DEFAULT false, whole boolean DEFAULT false)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT CASE WHEN value = 'null'::jsonb THEN nullable
    WHEN jsonb_typeof(value) = 'number' THEN (value::text)::numeric BETWEEN minimum AND maximum
      AND (NOT whole OR trunc((value::text)::numeric) = (value::text)::numeric)
    ELSE false END
$$;
CREATE FUNCTION public.mobile_prescription_key(value jsonb) RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT jsonb_build_object('id',value->'id','exerciseId',value->'exerciseId','sets',value->'sets','reps',value->'reps',
    'durationSeconds',value->'durationSeconds','restSeconds',value->'restSeconds','weightKg',value->'weightKg','targetRpe',value->'targetRpe')
$$;
CREATE FUNCTION public.mobile_prescription_valid(value jsonb) RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT coalesce(jsonb_typeof(value) = 'object' AND length(value->>'id') BETWEEN 1 AND 100
    AND length(value->>'exerciseId') BETWEEN 1 AND 160 AND length(value->>'name') BETWEEN 1 AND 300
    AND public.mobile_number_valid(value->'sets',1,100,false,true)
    AND public.mobile_number_valid(value->'reps',0,10000,true,true)
    AND public.mobile_number_valid(value->'durationSeconds',0,86400,true,true)
    AND public.mobile_number_valid(value->'restSeconds',0,86400,false,true)
    AND public.mobile_number_valid(value->'weightKg',0,1500,true)
    AND public.mobile_number_valid(value->'targetRpe',0,10,true),false)
$$;

CREATE FUNCTION public.mobile_sync_push_v1(p_operation_id uuid, p_kind text, p_entity_id uuid, p_payload jsonb, p_client_updated_at timestamptz)
RETURNS TABLE(operation_id uuid) LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_user uuid := auth.uid();
  v_previous public.mobile_sync_operations%ROWTYPE;
  v_entity public.mobile_sync_entities%ROWTYPE;
  v_workout jsonb; v_exercise jsonb; v_set jsonb; v_canonical jsonb; v_plan jsonb;
  v_web_plan public.workout_plans%ROWTYPE;
  v_seen text[]; v_count integer; v_has_completed boolean := false;
BEGIN
  IF v_user IS NULL OR NOT public.is_account_active(v_user) THEN RAISE EXCEPTION 'MOBILE_SYNC_AUTH_REQUIRED'; END IF;
  IF p_operation_id IS NULL OR p_entity_id IS NULL OR p_kind IS NULL OR p_kind NOT IN ('plan','session','measurement','profile')
    OR p_payload IS NULL OR jsonb_typeof(p_payload) <> 'object' OR octet_length(p_payload::text) > 2097152
    OR p_client_updated_at IS NULL OR p_client_updated_at > now() + interval '5 minutes' THEN
    RAISE EXCEPTION 'MOBILE_SYNC_INVALID_PAYLOAD';
  END IF;
  IF (p_payload->>'id') IS DISTINCT FROM p_entity_id::text
    OR (p_kind = 'profile' AND (p_entity_id <> v_user OR (p_payload->>'remoteUserId') IS DISTINCT FROM v_user::text))
    OR (p_kind <> 'profile' AND (p_payload->>'accountId') IS DISTINCT FROM v_user::text) THEN
    RAISE EXCEPTION 'MOBILE_SYNC_OWNER_MISMATCH';
  END IF;
  IF p_kind IN ('profile','plan') THEN
    IF jsonb_typeof(p_payload->'name') IS DISTINCT FROM 'string' OR length(trim(p_payload->>'name')) NOT BETWEEN 1 AND 300
      OR jsonb_typeof(p_payload->'createdAt') IS DISTINCT FROM 'string' THEN RAISE EXCEPTION 'MOBILE_SYNC_INVALID_PAYLOAD'; END IF;
    PERFORM (p_payload->>'createdAt')::timestamptz;
  END IF;
  IF p_kind <> 'session' THEN
    IF jsonb_typeof(p_payload->'updatedAt') IS DISTINCT FROM 'string' THEN RAISE EXCEPTION 'MOBILE_SYNC_INVALID_PAYLOAD'; END IF;
    PERFORM (p_payload->>'updatedAt')::timestamptz;
  END IF;
  IF p_kind <> 'profile' AND jsonb_typeof(p_payload->'notes') IS DISTINCT FROM 'string' THEN RAISE EXCEPTION 'MOBILE_SYNC_INVALID_PAYLOAD'; END IF;
  -- Serialize all operations per owner, including independent concurrent devices and lost-response retries.
  PERFORM pg_advisory_xact_lock(hashtextextended(v_user::text, 79013));
  SELECT * INTO v_previous FROM public.mobile_sync_operations o WHERE o.user_id = v_user AND o.operation_id = p_operation_id;
  IF FOUND THEN
    IF v_previous.kind <> p_kind OR v_previous.entity_id <> p_entity_id OR v_previous.payload <> p_payload OR v_previous.client_updated_at <> p_client_updated_at THEN
      RAISE EXCEPTION 'MOBILE_SYNC_IDEMPOTENCY_MISMATCH';
    END IF;
    RETURN QUERY SELECT p_operation_id; RETURN;
  END IF;

  IF p_kind = 'plan' THEN
    -- Only newly generated personal mobile plans can be authored here. Trainer plans come from web's secured materialization.
    IF (p_payload->>'source') IS DISTINCT FROM 'personal' OR p_payload->'remoteId' IS DISTINCT FROM 'null'::jsonb
      OR jsonb_typeof(p_payload->'workouts') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'MOBILE_SYNC_INVALID_PAYLOAD'; END IF;
    IF jsonb_array_length(p_payload->'workouts') NOT BETWEEN 1 AND 7 THEN RAISE EXCEPTION 'MOBILE_SYNC_INVALID_PAYLOAD'; END IF;
    v_seen := ARRAY[]::text[];
    FOR v_workout IN SELECT value FROM jsonb_array_elements(p_payload->'workouts') LOOP
      IF jsonb_typeof(v_workout) <> 'object' OR (v_workout->>'id') IS NULL OR (v_workout->>'id') = ANY(v_seen)
        OR jsonb_typeof(v_workout->'name') IS DISTINCT FROM 'string' OR length(trim(v_workout->>'name')) NOT BETWEEN 1 AND 300
        OR NOT public.mobile_number_valid(v_workout->'dayOfWeek',1,7,false,true)
        OR jsonb_typeof(v_workout->'exercises') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'MOBILE_SYNC_INVALID_PAYLOAD'; END IF;
      PERFORM (v_workout->>'id')::uuid;
      v_seen := array_append(v_seen,v_workout->>'id');
      IF jsonb_array_length(v_workout->'exercises') NOT BETWEEN 1 AND 50 THEN RAISE EXCEPTION 'MOBILE_SYNC_INVALID_PAYLOAD'; END IF;
      IF (SELECT count(DISTINCT value->>'id') FROM jsonb_array_elements(v_workout->'exercises')) <> jsonb_array_length(v_workout->'exercises') THEN
        RAISE EXCEPTION 'MOBILE_SYNC_INVALID_PAYLOAD'; END IF;
      FOR v_exercise IN SELECT value FROM jsonb_array_elements(v_workout->'exercises') LOOP
        IF NOT public.mobile_prescription_valid(v_exercise) THEN RAISE EXCEPTION 'MOBILE_SYNC_INVALID_PAYLOAD'; END IF;
      END LOOP;
    END LOOP;
  ELSIF p_kind = 'session' THEN
    IF jsonb_typeof(p_payload->'exercises') IS DISTINCT FROM 'array'
      OR p_payload->>'finishedAt' IS NULL OR p_payload->>'startedAt' IS NULL
      OR coalesce(p_payload->>'source','') NOT IN ('personal','trainer')
      OR jsonb_typeof(p_payload->'workoutName') IS DISTINCT FROM 'string'
      OR length(trim(p_payload->>'workoutName')) NOT BETWEEN 1 AND 300 THEN RAISE EXCEPTION 'MOBILE_SYNC_INVALID_PAYLOAD'; END IF;
    IF (p_payload->>'finishedAt')::timestamptz < (p_payload->>'startedAt')::timestamptz
      OR (p_payload->>'finishedAt')::timestamptz > now() + interval '5 minutes'
      OR (p_payload->>'finishedAt')::timestamptz - (p_payload->>'startedAt')::timestamptz > interval '7 days'
      OR NOT public.mobile_number_valid(p_payload->'rpe',0,10,true) THEN RAISE EXCEPTION 'MOBILE_SYNC_INVALID_PAYLOAD'; END IF;
    SELECT payload INTO v_plan FROM public.mobile_sync_entities e WHERE e.user_id=v_user AND e.kind='plan' AND e.entity_id=(p_payload->>'planId')::uuid;
    IF FOUND THEN
      IF (p_payload->>'source') IS DISTINCT FROM 'personal' THEN RAISE EXCEPTION 'MOBILE_SYNC_CANONICAL_MISMATCH'; END IF;
      SELECT value INTO v_workout FROM jsonb_array_elements(v_plan->'workouts') WHERE value->>'id'=p_payload->>'workoutId';
      IF NOT FOUND THEN RAISE EXCEPTION 'MOBILE_SYNC_CANONICAL_MISMATCH'; END IF;
      v_canonical := v_workout->'exercises';
    ELSE
      SELECT p.* INTO v_web_plan FROM public.workout_plans p JOIN public.workouts w ON w.plan_id=p.id
        WHERE p.id=(p_payload->>'planId')::uuid AND p.user_id=v_user AND w.user_id=v_user AND w.id=(p_payload->>'workoutId')::uuid;
      IF NOT FOUND OR (p_payload->>'source'='trainer') IS DISTINCT FROM (v_web_plan.source_type='trainer_assigned') THEN
        RAISE EXCEPTION 'MOBILE_SYNC_CANONICAL_MISMATCH'; END IF;
      SELECT coalesce(jsonb_agg(jsonb_build_object('id',e.id,'exerciseId',e.exercise_id,'sets',coalesce(e.sets,1),'reps',e.reps,
        'durationSeconds',e.duration_seconds,'restSeconds',coalesce(e.rest_seconds,60),'weightKg',e.weight_kg,'targetRpe',e.target_rpe)), '[]'::jsonb)
        INTO v_canonical FROM public.workout_exercises e WHERE e.workout_id=(p_payload->>'workoutId')::uuid;
    END IF;
    IF jsonb_array_length(p_payload->'exercises') <> jsonb_array_length(v_canonical) OR jsonb_array_length(v_canonical) NOT BETWEEN 1 AND 50 THEN
      RAISE EXCEPTION 'MOBILE_SYNC_CANONICAL_MISMATCH'; END IF;
    v_seen := ARRAY[]::text[];
    FOR v_exercise IN SELECT value FROM jsonb_array_elements(p_payload->'exercises') LOOP
      IF NOT public.mobile_prescription_valid(v_exercise->'prescription') OR jsonb_typeof(v_exercise->'sets') IS DISTINCT FROM 'array' THEN
        RAISE EXCEPTION 'MOBILE_SYNC_INVALID_PAYLOAD'; END IF;
      IF (v_exercise->'prescription'->>'id') = ANY(v_seen) OR NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_canonical) c WHERE
        public.mobile_prescription_key(c) = public.mobile_prescription_key(v_exercise->'prescription')) THEN RAISE EXCEPTION 'MOBILE_SYNC_CANONICAL_MISMATCH'; END IF;
      v_seen := array_append(v_seen,v_exercise->'prescription'->>'id');
      IF jsonb_array_length(v_exercise->'sets') <> (v_exercise->'prescription'->>'sets')::integer THEN RAISE EXCEPTION 'MOBILE_SYNC_INVALID_PAYLOAD'; END IF;
      IF (SELECT count(DISTINCT value->>'id') FROM jsonb_array_elements(v_exercise->'sets')) <> jsonb_array_length(v_exercise->'sets') THEN RAISE EXCEPTION 'MOBILE_SYNC_INVALID_PAYLOAD'; END IF;
      FOR v_set IN SELECT value FROM jsonb_array_elements(v_exercise->'sets') LOOP
        IF jsonb_typeof(v_set->'id') IS DISTINCT FROM 'string' OR length(v_set->>'id') NOT BETWEEN 1 AND 100
          OR jsonb_typeof(v_set->'completed') IS DISTINCT FROM 'boolean'
          OR NOT public.mobile_number_valid(v_set->'reps',0,10000,true,true)
          OR NOT public.mobile_number_valid(v_set->'weightKg',0,1500,true)
          OR NOT public.mobile_number_valid(v_set->'durationSeconds',0,86400,true,true) THEN RAISE EXCEPTION 'MOBILE_SYNC_INVALID_PAYLOAD'; END IF;
        v_has_completed := v_has_completed OR (v_set->>'completed')::boolean;
      END LOOP;
    END LOOP;
    IF NOT v_has_completed THEN RAISE EXCEPTION 'MOBILE_SYNC_INVALID_PAYLOAD'; END IF;
  ELSIF p_kind = 'measurement' THEN
    IF NOT public.mobile_number_valid(p_payload->'weightKg',1,700) OR NOT public.mobile_number_valid(p_payload->'waistCm',1,400,true)
      OR p_payload->>'date' IS NULL THEN RAISE EXCEPTION 'MOBILE_SYNC_INVALID_PAYLOAD'; END IF;
    PERFORM (p_payload->>'date')::date;
    IF p_payload->>'deletedAt' IS NOT NULL THEN PERFORM (p_payload->>'deletedAt')::timestamptz; END IF;
  ELSE
    IF jsonb_typeof(p_payload->'profile') IS DISTINCT FROM 'object' OR length(p_payload->>'name') NOT BETWEEN 1 AND 300
      OR jsonb_typeof(p_payload->'profile'->'readiness') IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'MOBILE_SYNC_INVALID_PAYLOAD'; END IF;
    v_plan := p_payload->'profile';
    IF coalesce(v_plan->>'language','') NOT IN ('es','en')
      OR coalesce(v_plan->>'fitnessLevel','') NOT IN ('beginner','intermediate','advanced')
      OR coalesce(v_plan->>'primaryGoal','') NOT IN ('lose_weight','build_muscle','gain_strength','improve_endurance','stay_active','other')
      OR coalesce(v_plan->>'gymType','') NOT IN ('home_no_equipment','home_basic','full_gym')
      OR NOT public.mobile_number_valid(v_plan->'daysPerWeek',1,7,false,true)
      OR NOT public.mobile_number_valid(v_plan->'sessionDurationMinutes',1,480,false,true)
      OR NOT public.mobile_number_valid(v_plan->'age',0,150,true,true)
      OR jsonb_typeof(v_plan->'availableEquipment') IS DISTINCT FROM 'array'
      OR jsonb_typeof(v_plan->'cardioPreferences') IS DISTINCT FROM 'array'
      OR (v_plan->'preferredWorkoutDays' IS DISTINCT FROM 'null'::jsonb AND jsonb_typeof(v_plan->'preferredWorkoutDays') IS DISTINCT FROM 'array')
      THEN RAISE EXCEPTION 'MOBILE_SYNC_INVALID_PAYLOAD'; END IF;
    v_workout := v_plan->'readiness';
    IF coalesce(v_workout->>'status','') NOT IN ('pending','cleared','modified','professional_clearance_required')
      OR jsonb_typeof(v_workout->'currentlyActive') IS DISTINCT FROM 'boolean'
      OR jsonb_typeof(v_workout->'knownCardiovascularMetabolicOrRenalDisease') IS DISTINCT FROM 'boolean'
      OR jsonb_typeof(v_workout->'medicallyCleared') IS DISTINCT FROM 'boolean'
      OR jsonb_typeof(v_workout->'recentSurgery') IS DISTINCT FROM 'boolean'
      OR jsonb_typeof(v_workout->'warningSymptoms') IS DISTINCT FROM 'array'
      OR jsonb_typeof(v_workout->'limitations') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'MOBILE_SYNC_INVALID_PAYLOAD'; END IF;
  END IF;

  SELECT * INTO v_entity FROM public.mobile_sync_entities e WHERE e.user_id=v_user AND e.kind=p_kind AND e.entity_id=p_entity_id;
  IF FOUND THEN
    IF p_kind='plan' AND v_entity.payload->'workouts' IS DISTINCT FROM p_payload->'workouts' THEN RAISE EXCEPTION 'MOBILE_SYNC_CANONICAL_MISMATCH'; END IF;
    IF p_kind='session' AND v_entity.payload IS DISTINCT FROM p_payload THEN RAISE EXCEPTION 'MOBILE_SYNC_IDEMPOTENCY_MISMATCH'; END IF;
    IF v_entity.client_updated_at = p_client_updated_at AND v_entity.payload IS DISTINCT FROM p_payload THEN RAISE EXCEPTION 'MOBILE_SYNC_VERSION_CONFLICT'; END IF;
  END IF;
  INSERT INTO public.mobile_sync_entities(user_id,kind,entity_id,payload,client_updated_at)
    VALUES(v_user,p_kind,p_entity_id,p_payload,p_client_updated_at)
    ON CONFLICT(user_id,kind,entity_id) DO UPDATE SET payload=EXCLUDED.payload,client_updated_at=EXCLUDED.client_updated_at,updated_at=now()
    WHERE public.mobile_sync_entities.client_updated_at < EXCLUDED.client_updated_at;
  INSERT INTO public.mobile_sync_operations(user_id,operation_id,kind,entity_id,payload,client_updated_at)
    VALUES(v_user,p_operation_id,p_kind,p_entity_id,p_payload,p_client_updated_at);
  RETURN QUERY SELECT p_operation_id;
END $$;
REVOKE ALL ON FUNCTION public.mobile_number_valid(jsonb,numeric,numeric,boolean,boolean), public.mobile_prescription_key(jsonb), public.mobile_prescription_valid(jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.mobile_sync_push_v1(uuid,text,uuid,jsonb,timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mobile_sync_push_v1(uuid,text,uuid,jsonb,timestamptz) TO authenticated;
COMMENT ON FUNCTION public.mobile_sync_push_v1(uuid,text,uuid,jsonb,timestamptz) IS 'Versioned mobile-only backup; owner-scoped immutable retry receipts and canonical session prescription validation. Does not write web progress.';
COMMIT;
