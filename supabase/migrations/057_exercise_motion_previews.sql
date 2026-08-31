ALTER TABLE public.exercises
  ADD COLUMN IF NOT EXISTS motion_preview_url TEXT;

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
    e.video_url, e.image_url, e.motion_preview_url
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

GRANT EXECUTE ON FUNCTION public.get_exercise_detail_payload(uuid) TO authenticated;
