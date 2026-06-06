-- 013_exercise_images.sql
-- Bucket público para imágenes de ejercicios + image_url en el payload de la ficha.

-- 1. Bucket público
INSERT INTO storage.buckets (id, name, public)
VALUES ('exercise-images', 'exercise-images', true)
ON CONFLICT (id) DO NOTHING;

-- 2. Añadir image_url al payload de detalle de ejercicio
CREATE OR REPLACE FUNCTION public.get_exercise_detail_payload(
  p_exercise_id uuid
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
WITH target_exercise AS (
  SELECT
    e.id,
    e.name,
    e.description,
    e.muscle_groups,
    e.equipment,
    e.difficulty,
    e.exercise_type,
    e.is_compound,
    e.instructions,
    e.video_url,
    e.image_url
  FROM exercises e
  WHERE e.id = p_exercise_id
    AND e.is_public = true
  LIMIT 1
),
exercise_rows AS (
  SELECT
    el.id,
    el.progress_log_id,
    el.sets_completed,
    el.reps_completed,
    el.weights_kg,
    el.rpe_values,
    el.notes,
    jsonb_build_object(
      'id', pl.id,
      'workout_id', pl.workout_id,
      'completed_at', pl.completed_at,
      'duration_minutes', pl.duration_minutes,
      'mood_rating', pl.mood_rating
    ) AS progress_log,
    pl.completed_at AS progress_completed_at
  FROM exercise_logs el
  JOIN progress_logs pl ON pl.id = el.progress_log_id
  WHERE el.exercise_id = p_exercise_id
    AND pl.user_id = auth.uid()
  ORDER BY pl.completed_at DESC
),
workout_rows AS (
  SELECT DISTINCT
    w.id,
    w.name,
    w.focus
  FROM exercise_logs el
  JOIN progress_logs pl ON pl.id = el.progress_log_id
  JOIN workouts w
    ON w.id = pl.workout_id
   AND w.user_id = auth.uid()
  WHERE el.exercise_id = p_exercise_id
    AND pl.user_id = auth.uid()
    AND pl.workout_id IS NOT NULL
)
SELECT jsonb_build_object(
  'exercise', (
    SELECT to_jsonb(te)
    FROM target_exercise te
  ),
  'logs', COALESCE((
    SELECT jsonb_agg((to_jsonb(er) - 'progress_completed_at') ORDER BY er.progress_completed_at DESC)
    FROM exercise_rows er
  ), '[]'::jsonb),
  'workouts', COALESCE((
    SELECT jsonb_agg(to_jsonb(wr) ORDER BY wr.name)
    FROM workout_rows wr
  ), '[]'::jsonb)
);
$$;

GRANT EXECUTE ON FUNCTION public.get_exercise_detail_payload(uuid)
  TO authenticated;

COMMENT ON FUNCTION public.get_exercise_detail_payload(uuid) IS
  'Returns one exercise (including image_url), its authenticated user logs, and related workouts for the exercise detail screen.';
