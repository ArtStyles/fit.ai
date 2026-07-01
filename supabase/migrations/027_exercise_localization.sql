-- Exercise catalog localization and per-user content language.
-- English remains the canonical source imported from free-exercise-db.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS language TEXT NOT NULL DEFAULT 'es'
  CHECK (language IN ('es', 'en'));

ALTER TABLE public.exercises
  ADD COLUMN IF NOT EXISTS name_es TEXT,
  ADD COLUMN IF NOT EXISTS description_es TEXT,
  ADD COLUMN IF NOT EXISTS instructions_es TEXT,
  ADD COLUMN IF NOT EXISTS muscle_groups_es TEXT[],
  ADD COLUMN IF NOT EXISTS equipment_es TEXT[];

COMMENT ON COLUMN public.profiles.language IS
  'Preferred language for exercise catalog content (es or en).';
COMMENT ON COLUMN public.exercises.name IS
  'Canonical English exercise name from the source dataset.';
COMMENT ON COLUMN public.exercises.name_es IS
  'Spanish exercise name; NULL falls back to the canonical English value.';

-- Keep the existing RPC contracts, but return localized exercise content.
CREATE OR REPLACE FUNCTION public.get_history_payload(p_limit integer DEFAULT 50)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
WITH params AS (
  SELECT LEAST(GREATEST(COALESCE(p_limit, 50), 1), 100) AS row_limit
), preferred_language AS (
  SELECT COALESCE((SELECT language FROM profiles WHERE id = auth.uid()), 'es') AS value
), session_logs AS (
  SELECT pl.id, pl.workout_id, pl.completed_at, pl.duration_minutes, pl.mood_rating,
    CASE WHEN w.id IS NULL THEN NULL ELSE jsonb_build_object('name', w.name, 'focus', w.focus) END AS workout
  FROM progress_logs pl
  LEFT JOIN workouts w ON w.id = pl.workout_id AND w.user_id = auth.uid()
  WHERE pl.user_id = auth.uid() AND pl.workout_id IS NOT NULL
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

CREATE OR REPLACE FUNCTION public.get_exercise_detail_payload(p_exercise_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
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
      'duration_minutes', pl.duration_minutes, 'mood_rating', pl.mood_rating) AS progress_log,
    pl.completed_at AS progress_completed_at
  FROM exercise_logs el
  JOIN progress_logs pl ON pl.id = el.progress_log_id
  WHERE el.exercise_id = p_exercise_id AND pl.user_id = auth.uid()
  ORDER BY pl.completed_at DESC
), workout_rows AS (
  SELECT DISTINCT w.id, w.name, w.focus
  FROM exercise_logs el
  JOIN progress_logs pl ON pl.id = el.progress_log_id
  JOIN workouts w ON w.id = pl.workout_id AND w.user_id = auth.uid()
  WHERE el.exercise_id = p_exercise_id AND pl.user_id = auth.uid() AND pl.workout_id IS NOT NULL
)
SELECT jsonb_build_object(
  'exercise', (SELECT to_jsonb(te) FROM target_exercise te),
  'logs', COALESCE((SELECT jsonb_agg((to_jsonb(er) - 'progress_completed_at') ORDER BY er.progress_completed_at DESC) FROM exercise_rows er), '[]'::jsonb),
  'workouts', COALESCE((SELECT jsonb_agg(to_jsonb(wr) ORDER BY wr.name) FROM workout_rows wr), '[]'::jsonb)
);
$$;
