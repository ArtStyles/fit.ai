-- Catalog V1 schema, media storage, history continuity, and atomic cutover.

ALTER TABLE public.exercises
  ADD COLUMN IF NOT EXISTS motion_preview_url TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_exercises_source_external
  ON public.exercises (source, external_id)
  WHERE source IS NOT NULL AND external_id IS NOT NULL;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'exercise-media',
  'exercise-media',
  true,
  1048576,
  ARRAY['image/webp']::TEXT[]
)
ON CONFLICT (id) DO UPDATE
SET name = EXCLUDED.name,
    public = EXCLUDED.public,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "exercise-media: public read" ON storage.objects;
CREATE POLICY "exercise-media: public read"
  ON storage.objects
  FOR SELECT
  TO PUBLIC
  USING (bucket_id = 'exercise-media');

CREATE OR REPLACE FUNCTION public.can_read_referenced_private_exercise(p_exercise_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT auth.uid() IS NOT NULL
    AND (
      EXISTS (
        SELECT 1
        FROM public.workout_exercises AS workout_exercise
        JOIN public.workouts AS workout
          ON workout.id = workout_exercise.workout_id
        WHERE workout_exercise.exercise_id = p_exercise_id
          AND workout.user_id = auth.uid()
      )
      OR EXISTS (
        SELECT 1
        FROM public.exercise_logs AS exercise_log
        JOIN public.progress_logs AS progress
          ON progress.id = exercise_log.progress_log_id
        WHERE exercise_log.exercise_id = p_exercise_id
          AND progress.user_id = auth.uid()
      )
      OR EXISTS (
        SELECT 1
        FROM public.trainer_template_exercises AS template_exercise
        JOIN public.trainer_template_workouts AS template_workout
          ON template_workout.id = template_exercise.template_workout_id
        JOIN public.trainer_program_templates AS template
          ON template.id = template_workout.template_id
        WHERE template_exercise.exercise_id = p_exercise_id
          AND template.trainer_user_id = auth.uid()
      )
    );
$$;

REVOKE ALL ON FUNCTION public.can_read_referenced_private_exercise(UUID) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_read_referenced_private_exercise(UUID) TO authenticated;

DROP POLICY IF EXISTS "exercises: referenced private read" ON public.exercises;
CREATE POLICY "exercises: referenced private read"
  ON public.exercises
  FOR SELECT TO authenticated
  USING (is_public = FALSE AND public.can_read_referenced_private_exercise(id));

CREATE OR REPLACE FUNCTION public.get_exercise_detail_payload(p_exercise_id UUID)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
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
    e.video_url, e.image_url, e.motion_preview_url
  FROM exercises e
  WHERE e.id = p_exercise_id
    AND (
      e.is_public = true
      OR public.can_read_referenced_private_exercise(e.id)
    )
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

GRANT EXECUTE ON FUNCTION public.get_exercise_detail_payload(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.enforce_exercise_log_immutability()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF current_setting('app.exercise_catalog_v1_remap', TRUE) = 'authorized'
    AND (
      current_user = 'postgres'
      OR (
        auth.role() = 'service_role'
        AND session_user IN ('postgres', 'supabase_admin')
      )
    )
    AND NEW.exercise_id IS DISTINCT FROM OLD.exercise_id
    AND (to_jsonb(NEW) - 'exercise_id') IS NOT DISTINCT FROM (to_jsonb(OLD) - 'exercise_id')
  THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'SESSION_EXERCISE_EVIDENCE_IMMUTABLE';
END;
$$;

CREATE OR REPLACE FUNCTION public.replace_exercise_catalog_v1(p_exercises JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor_role TEXT := COALESCE(
    NULLIF(current_setting('request.jwt.claim.role', true), ''),
    auth.role()
  );
  v_expected_slugs CONSTANT JSONB := $slugs$["apertura-inversa-maquina","aperturas-pecho-maquina","aperturas-pecho-polea","arnold-press-mancuernas","bicicleta-estatica","caminata-cinta","crunch-polea-rodillas","curl-biceps-barra-ez","curl-biceps-barra-recta","curl-biceps-polea-pie","curl-femoral-tumbado-maquina","curl-martillo-mancuernas","curl-predicador-barra-ez","dominada-asistida-maquina","dominadas-pronas","elevacion-frontal-mancuernas","elevacion-gemelos-pie-maquina","elevacion-lateral-mancuernas","elevacion-rodillas-colgado","eliptica","extension-cuadriceps-maquina","extension-triceps-cuerda","extension-triceps-sobre-cabeza-polea","face-pull-polea","flexiones-pecho","fondos-paralelas-pecho","hip-thrust-barra","jalon-brazos-rectos-polea","jalon-pecho-polea","peso-muerto-convencional-barra","peso-muerto-rumano-barra","plancha-frontal","plancha-lateral","prensa-piernas-45","press-banca-barra","press-frances-tumbado-barra-ez","press-inclinado-mancuernas","press-militar-pie-barra","press-pecho-maquina","press-plano-mancuernas","remo-estacionario","remo-inclinado-barra","remo-mancuerna-un-brazo","remo-sentado-polea","remo-t-agarre","rueda-abdominal-rodillas","sentadilla-bulgara-mancuernas","sentadilla-goblet-kettlebell","sentadilla-trasera-barra","zancadas-caminando-mancuernas"]$slugs$::JSONB;
  v_expected_legacy_aliases CONSTANT JSONB := $aliases$[["free-exercise-db","Barbell_Curl","curl-biceps-barra-recta"],["free-exercise-db","Barbell_Deadlift","peso-muerto-convencional-barra"],["free-exercise-db","Bent_Over_Barbell_Row","remo-inclinado-barra"],["free-exercise-db","Butterfly","aperturas-pecho-maquina"],["free-exercise-db","Dips_-_Chest_Version","fondos-paralelas-pecho"],["free-exercise-db","Dumbbell_Bench_Press","press-plano-mancuernas"],["free-exercise-db","Elliptical_Trainer","eliptica"],["free-exercise-db","Face_Pull","face-pull-polea"],["free-exercise-db","Front_Dumbbell_Raise","elevacion-frontal-mancuernas"],["free-exercise-db","Goblet_Squat","sentadilla-goblet-kettlebell"],["free-exercise-db","Leg_Extensions","extension-cuadriceps-maquina"],["free-exercise-db","Lying_Triceps_Press","press-frances-tumbado-barra-ez"],["free-exercise-db","Pullups","dominadas-pronas"],["free-exercise-db","Pushups","flexiones-pecho"],["free-exercise-db","Rowing_Stationary","remo-estacionario"],["free-exercise-db","Side_Bridge","plancha-lateral"],["free-exercise-db","Standing_Biceps_Cable_Curl","curl-biceps-polea-pie"],["free-exercise-db","Standing_Calf_Raises","elevacion-gemelos-pie-maquina"],["free-exercise-db","Standing_Military_Press","press-militar-pie-barra"],["free-exercise-db","Straight-Arm_Pulldown","jalon-brazos-rectos-polea"],["free-exercise-db","T-Bar_Row_with_Handle","remo-t-agarre"]]$aliases$::JSONB;
  v_updated_count INTEGER := 0;
  v_inserted_count INTEGER := 0;
  v_exercise_logs_remapped_count INTEGER := 0;
  v_workout_exercises_remapped_count INTEGER := 0;
  v_trainer_template_exercises_remapped_count INTEGER := 0;
  v_legacy_public_ids UUID[] := ARRAY[]::UUID[];
  v_legacy_public_count INTEGER := 0;
  v_deleted_count INTEGER := 0;
  v_hidden_count INTEGER := 0;
  v_public_v1_count INTEGER := 0;
  v_public_legacy_count INTEGER := 0;
BEGIN
  IF v_actor_role IS DISTINCT FROM 'service_role' THEN
    RAISE insufficient_privilege USING MESSAGE = 'replace_exercise_catalog_v1 requires service_role';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('replace_exercise_catalog_v1', 0));

  -- Keep catalog writes and new references outside the short cutover window.
  LOCK TABLE public.exercises,
    public.exercise_logs,
    public.workout_exercises,
    public.trainer_template_exercises
    IN SHARE ROW EXCLUSIVE MODE;

  IF p_exercises IS NULL OR jsonb_typeof(p_exercises) <> 'array' THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'catalog V1 payload must be a JSON array';
  END IF;

  IF jsonb_array_length(p_exercises) <> 50 THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'catalog V1 payload must contain exactly 50 exercises';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_exercises) AS item(value)
    WHERE jsonb_typeof(item.value) <> 'object'
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'every catalog V1 payload entry must be an object';
  END IF;

  DROP TABLE IF EXISTS pg_temp.catalog_v1_payload;
  CREATE TEMP TABLE catalog_v1_payload (
    wger_id INTEGER,
    name TEXT,
    name_es TEXT,
    description TEXT,
    description_es TEXT,
    muscle_groups TEXT[],
    equipment TEXT[],
    equipment_es TEXT[],
    muscle_groups_es TEXT[],
    difficulty TEXT,
    exercise_type TEXT,
    is_compound BOOLEAN,
    instructions TEXT,
    instructions_es TEXT,
    video_url TEXT,
    image_url TEXT,
    motion_preview_url TEXT,
    is_public BOOLEAN,
    source TEXT,
    external_id TEXT,
    movement_patterns TEXT[],
    cardio_modality TEXT,
    impact_level TEXT,
    joint_stress_tags TEXT[],
    legacy_source TEXT,
    legacy_external_id TEXT
  ) ON COMMIT DROP;

  INSERT INTO pg_temp.catalog_v1_payload
  SELECT payload.*
  FROM jsonb_to_recordset(p_exercises) AS payload(
    wger_id INTEGER,
    name TEXT,
    name_es TEXT,
    description TEXT,
    description_es TEXT,
    muscle_groups TEXT[],
    equipment TEXT[],
    equipment_es TEXT[],
    muscle_groups_es TEXT[],
    difficulty TEXT,
    exercise_type TEXT,
    is_compound BOOLEAN,
    instructions TEXT,
    instructions_es TEXT,
    video_url TEXT,
    image_url TEXT,
    motion_preview_url TEXT,
    is_public BOOLEAN,
    source TEXT,
    external_id TEXT,
    movement_patterns TEXT[],
    cardio_modality TEXT,
    impact_level TEXT,
    joint_stress_tags TEXT[],
    legacy_source TEXT,
    legacy_external_id TEXT
  );

  IF EXISTS (
    SELECT 1
    FROM pg_temp.catalog_v1_payload AS payload
    WHERE payload.source IS DISTINCT FROM 'vekira-catalog-v1'
      OR payload.external_id IS NULL
      OR btrim(payload.external_id) !~ '^[a-z0-9]+(-[a-z0-9]+)*$'
      OR payload.name IS NULL
      OR btrim(payload.name) = ''
      OR payload.name_es IS NULL
      OR btrim(payload.name_es) = ''
      OR payload.description_es IS NULL
      OR btrim(payload.description_es) = ''
      OR payload.instructions_es IS NULL
      OR btrim(payload.instructions_es) = ''
      OR payload.muscle_groups IS NULL
      OR payload.muscle_groups_es IS NULL
      OR payload.equipment IS NULL
      OR payload.equipment_es IS NULL
      OR payload.movement_patterns IS NULL
      OR payload.joint_stress_tags IS NULL
      OR payload.difficulty NOT IN ('beginner', 'intermediate', 'advanced')
      OR payload.exercise_type NOT IN ('strength', 'cardio', 'flexibility', 'balance', 'hiit')
      OR payload.is_public IS DISTINCT FROM TRUE
      OR payload.image_url IS NULL
      OR payload.image_url NOT LIKE '%/storage/v1/object/public/exercise-media/catalog/v1/'
        || payload.external_id || '/poster.webp'
      OR (
        payload.motion_preview_url IS NOT NULL
        AND payload.motion_preview_url NOT LIKE '%/storage/v1/object/public/exercise-media/catalog/v1/'
          || payload.external_id || '/motion-preview.webp'
      )
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'catalog V1 payload contains an invalid exercise row';
  END IF;

  IF (
    SELECT COUNT(DISTINCT payload.external_id)
    FROM pg_temp.catalog_v1_payload AS payload
  ) <> 50 THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'catalog V1 external_id values must contain 50 unique slugs';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_temp.catalog_v1_payload AS payload
    WHERE (payload.legacy_source IS NULL) <> (payload.legacy_external_id IS NULL)
      OR payload.legacy_source = 'vekira-catalog-v1'
      OR (payload.legacy_source IS NOT NULL AND btrim(payload.legacy_source) = '')
      OR (payload.legacy_external_id IS NOT NULL AND btrim(payload.legacy_external_id) = '')
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'catalog V1 legacy aliases must be complete, nonblank, and outside V1';
  END IF;

  IF (
    SELECT COUNT(*)
    FROM pg_temp.catalog_v1_payload AS payload
    WHERE payload.legacy_source IS NOT NULL
  ) <> (
    SELECT COUNT(DISTINCT (payload.legacy_source, payload.legacy_external_id))
    FROM pg_temp.catalog_v1_payload AS payload
    WHERE payload.legacy_source IS NOT NULL
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'catalog V1 legacy aliases must be unique';
  END IF;

  IF (
    SELECT jsonb_agg(to_jsonb(payload.external_id) ORDER BY payload.external_id COLLATE "C")
    FROM pg_temp.catalog_v1_payload AS payload
  ) IS DISTINCT FROM v_expected_slugs THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'catalog V1 payload must contain the exact approved slug set';
  END IF;

  IF (
    SELECT COALESCE(
      jsonb_agg(
        jsonb_build_array(
          payload.legacy_source,
          payload.legacy_external_id,
          payload.external_id
        )
        ORDER BY payload.legacy_source COLLATE "C",
          payload.legacy_external_id COLLATE "C",
          payload.external_id COLLATE "C"
      ),
      '[]'::JSONB
    )
    FROM pg_temp.catalog_v1_payload AS payload
    WHERE payload.legacy_source IS NOT NULL
  ) IS DISTINCT FROM v_expected_legacy_aliases THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'catalog V1 payload must contain the exact approved legacy aliases';
  END IF;

  SELECT COUNT(*)::INTEGER
  INTO v_updated_count
  FROM public.exercises AS exercise
  JOIN pg_temp.catalog_v1_payload AS payload
    ON payload.source = exercise.source
   AND payload.external_id = exercise.external_id;

  v_inserted_count := 50 - v_updated_count;

  INSERT INTO public.exercises (
    wger_id,
    name,
    name_es,
    description,
    description_es,
    muscle_groups,
    equipment,
    equipment_es,
    muscle_groups_es,
    difficulty,
    exercise_type,
    is_compound,
    instructions,
    instructions_es,
    video_url,
    image_url,
    motion_preview_url,
    is_public,
    source,
    external_id,
    movement_patterns,
    cardio_modality,
    impact_level,
    joint_stress_tags
  )
  SELECT payload.wger_id,
    payload.name,
    payload.name_es,
    payload.description,
    payload.description_es,
    payload.muscle_groups,
    payload.equipment,
    payload.equipment_es,
    payload.muscle_groups_es,
    payload.difficulty,
    payload.exercise_type,
    payload.is_compound,
    payload.instructions,
    payload.instructions_es,
    payload.video_url,
    payload.image_url,
    payload.motion_preview_url,
    TRUE,
    payload.source,
    payload.external_id,
    payload.movement_patterns,
    payload.cardio_modality,
    payload.impact_level,
    payload.joint_stress_tags
  FROM pg_temp.catalog_v1_payload AS payload
  ON CONFLICT (source, external_id)
    WHERE source IS NOT NULL AND external_id IS NOT NULL
  DO UPDATE SET
    wger_id = EXCLUDED.wger_id,
    name = EXCLUDED.name,
    name_es = EXCLUDED.name_es,
    description = EXCLUDED.description,
    description_es = EXCLUDED.description_es,
    muscle_groups = EXCLUDED.muscle_groups,
    equipment = EXCLUDED.equipment,
    equipment_es = EXCLUDED.equipment_es,
    muscle_groups_es = EXCLUDED.muscle_groups_es,
    difficulty = EXCLUDED.difficulty,
    exercise_type = EXCLUDED.exercise_type,
    is_compound = EXCLUDED.is_compound,
    instructions = EXCLUDED.instructions,
    instructions_es = EXCLUDED.instructions_es,
    video_url = EXCLUDED.video_url,
    image_url = EXCLUDED.image_url,
    motion_preview_url = EXCLUDED.motion_preview_url,
    is_public = TRUE,
    movement_patterns = EXCLUDED.movement_patterns,
    cardio_modality = EXCLUDED.cardio_modality,
    impact_level = EXCLUDED.impact_level,
    joint_stress_tags = EXCLUDED.joint_stress_tags;

  DROP TABLE IF EXISTS pg_temp.catalog_v1_remap;
  CREATE TEMP TABLE catalog_v1_remap (
    legacy_id UUID PRIMARY KEY,
    replacement_id UUID NOT NULL
  ) ON COMMIT DROP;

  INSERT INTO pg_temp.catalog_v1_remap (legacy_id, replacement_id)
  SELECT legacy.id, replacement.id
  FROM pg_temp.catalog_v1_payload AS payload
  JOIN public.exercises AS legacy
    ON legacy.source = payload.legacy_source
   AND legacy.external_id = payload.legacy_external_id
  JOIN public.exercises AS replacement
    ON replacement.source = 'vekira-catalog-v1'
   AND replacement.external_id = payload.external_id
  WHERE payload.legacy_source IS NOT NULL
    AND legacy.id <> replacement.id;

  PERFORM set_config('app.exercise_catalog_v1_remap', 'authorized', TRUE);
  PERFORM set_config('app.trainer_prescription_mutation', 'authorized', TRUE);

  UPDATE public.exercise_logs AS reference
  SET exercise_id = remap.replacement_id
  FROM pg_temp.catalog_v1_remap AS remap
  WHERE reference.exercise_id = remap.legacy_id;
  GET DIAGNOSTICS v_exercise_logs_remapped_count = ROW_COUNT;

  UPDATE public.workout_exercises AS reference
  SET exercise_id = remap.replacement_id
  FROM pg_temp.catalog_v1_remap AS remap
  WHERE reference.exercise_id = remap.legacy_id;
  GET DIAGNOSTICS v_workout_exercises_remapped_count = ROW_COUNT;

  UPDATE public.trainer_template_exercises AS reference
  SET exercise_id = remap.replacement_id
  FROM pg_temp.catalog_v1_remap AS remap
  WHERE reference.exercise_id = remap.legacy_id;
  GET DIAGNOSTICS v_trainer_template_exercises_remapped_count = ROW_COUNT;

  SELECT COALESCE(array_agg(legacy.id ORDER BY legacy.id), ARRAY[]::UUID[])
  INTO v_legacy_public_ids
  FROM public.exercises AS legacy
  WHERE legacy.is_public = TRUE
    AND NOT EXISTS (
      SELECT 1
      FROM pg_temp.catalog_v1_payload AS payload
      WHERE payload.source = legacy.source
        AND payload.external_id = legacy.external_id
    );

  UPDATE public.exercises AS legacy
  SET is_public = FALSE
  WHERE legacy.id = ANY(v_legacy_public_ids)
    AND legacy.is_public = TRUE
    AND NOT EXISTS (
      SELECT 1
      FROM pg_temp.catalog_v1_payload AS payload
      WHERE payload.source = legacy.source
        AND payload.external_id = legacy.external_id
    );
  GET DIAGNOSTICS v_legacy_public_count = ROW_COUNT;

  DELETE FROM public.exercises AS legacy
  WHERE legacy.id = ANY(v_legacy_public_ids)
    AND NOT EXISTS (
      SELECT 1
      FROM public.exercise_logs AS exercise_log
      WHERE exercise_log.exercise_id = legacy.id
    )
    AND NOT EXISTS (
      SELECT 1
      FROM public.workout_exercises AS workout_exercise
      WHERE workout_exercise.exercise_id = legacy.id
    )
    AND NOT EXISTS (
      SELECT 1
      FROM public.trainer_template_exercises AS template_exercise
      WHERE template_exercise.exercise_id = legacy.id
    );
  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;

  v_hidden_count := v_legacy_public_count - v_deleted_count;

  SELECT COUNT(*)::INTEGER
  INTO v_public_v1_count
  FROM public.exercises AS exercise
  JOIN pg_temp.catalog_v1_payload AS payload
    ON payload.source = exercise.source
   AND payload.external_id = exercise.external_id
  WHERE exercise.is_public = TRUE;

  SELECT COUNT(*)::INTEGER
  INTO v_public_legacy_count
  FROM public.exercises AS exercise
  WHERE exercise.is_public = TRUE
    AND NOT EXISTS (
      SELECT 1
      FROM pg_temp.catalog_v1_payload AS payload
      WHERE payload.source = exercise.source
        AND payload.external_id = exercise.external_id
    );

  IF v_public_v1_count <> 50 OR v_public_legacy_count <> 0 THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'catalog V1 cutover final cardinality check failed';
  END IF;

  RETURN jsonb_build_object(
    'source', 'vekira-catalog-v1',
    'input_count', 50,
    'inserted_count', v_inserted_count,
    'updated_count', v_updated_count,
    'hidden_count', v_hidden_count,
    'deleted_count', v_deleted_count,
    'exercise_logs_remapped_count', v_exercise_logs_remapped_count,
    'workout_exercises_remapped_count', v_workout_exercises_remapped_count,
    'trainer_template_exercises_remapped_count', v_trainer_template_exercises_remapped_count,
    'public_v1_count', v_public_v1_count,
    'public_legacy_count', v_public_legacy_count
  );
END;
$$;

REVOKE ALL ON FUNCTION public.replace_exercise_catalog_v1(JSONB) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.replace_exercise_catalog_v1(JSONB) TO service_role;
