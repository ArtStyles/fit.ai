-- ============================================================
-- Migration 011: history and exercise detail performance helpers
-- ============================================================
-- Goal:
--   - Reduce roundtrips in /history and /exercises/[exerciseId].
--   - Keep RLS behavior through SECURITY INVOKER and auth.uid().
--   - Return JSON shaped like the current application queries.
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_exercise_logs_exercise_progress
  ON exercise_logs(exercise_id, progress_log_id);

CREATE OR REPLACE FUNCTION public.get_history_payload(
  p_limit integer DEFAULT 50
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
WITH params AS (
  SELECT LEAST(GREATEST(COALESCE(p_limit, 50), 1), 100) AS row_limit
),
session_logs AS (
  SELECT
    pl.id,
    pl.workout_id,
    pl.completed_at,
    pl.duration_minutes,
    pl.mood_rating,
    CASE
      WHEN w.id IS NULL THEN NULL
      ELSE jsonb_build_object(
        'name', w.name,
        'focus', w.focus
      )
    END AS workout
  FROM progress_logs pl
  LEFT JOIN workouts w
    ON w.id = pl.workout_id
   AND w.user_id = auth.uid()
  WHERE pl.user_id = auth.uid()
    AND pl.workout_id IS NOT NULL
  ORDER BY pl.completed_at DESC
  LIMIT (SELECT row_limit FROM params)
),
exercise_rows AS (
  SELECT
    el.progress_log_id,
    el.exercise_id,
    el.weights_kg,
    el.reps_completed,
    CASE
      WHEN e.id IS NULL THEN NULL
      ELSE jsonb_build_object(
        'name', e.name,
        'muscle_groups', e.muscle_groups,
        'is_compound', e.is_compound
      )
    END AS exercise,
    sl.completed_at AS progress_completed_at
  FROM exercise_logs el
  JOIN session_logs sl ON sl.id = el.progress_log_id
  LEFT JOIN exercises e ON e.id = el.exercise_id
)
SELECT jsonb_build_object(
  'session_logs', COALESCE((
    SELECT jsonb_agg(to_jsonb(sl) ORDER BY sl.completed_at DESC)
    FROM session_logs sl
  ), '[]'::jsonb),
  'exercise_logs', COALESCE((
    SELECT jsonb_agg((to_jsonb(er) - 'progress_completed_at') ORDER BY er.progress_completed_at DESC)
    FROM exercise_rows er
  ), '[]'::jsonb)
);
$$;

GRANT EXECUTE ON FUNCTION public.get_history_payload(integer)
  TO authenticated;

COMMENT ON FUNCTION public.get_history_payload(integer) IS
  'Returns recent session history and related exercise logs for the authenticated user in one call.';

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
    e.video_url
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
  'Returns one exercise, its authenticated user logs, and related workouts for the exercise detail screen.';
