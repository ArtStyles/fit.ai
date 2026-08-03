-- Refresh the dashboard reader for deployments that applied migration 036
-- before the continuity payload gained its live workout relation and stable
-- evidence ordering. This migration is intentionally reader-only.

CREATE OR REPLACE FUNCTION public.get_dashboard_payload(
  p_week_start timestamptz,
  p_recent_start timestamptz
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
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

GRANT EXECUTE ON FUNCTION public.get_dashboard_payload(timestamptz, timestamptz) TO authenticated;

-- A data-free deployment sentinel for the dedicated continuity E2E harness.
-- This is intentionally distinct from get_dashboard_payload, whose signature
-- already existed in migration 036 and therefore cannot prove this replacement
-- migration has been applied.
CREATE OR REPLACE FUNCTION public.get_plan_history_continuity_schema_version()
RETURNS integer
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT 39;
$$;

REVOKE ALL ON FUNCTION public.get_plan_history_continuity_schema_version() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_plan_history_continuity_schema_version() TO authenticated, service_role;
