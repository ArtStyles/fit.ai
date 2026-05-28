-- ============================================================
-- Migration 008: plan lifecycle metadata
-- ============================================================
-- Tracks why the active plan exists so dashboard messaging can
-- distinguish first plans, weekly regenerations, and manual edits.
-- ============================================================

ALTER TABLE workout_plans
  ADD COLUMN IF NOT EXISTS week_number INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS plan_context TEXT NOT NULL DEFAULT 'first_plan',
  ADD COLUMN IF NOT EXISTS parent_plan_id UUID REFERENCES workout_plans(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS manually_updated_at TIMESTAMPTZ;

ALTER TABLE workout_plans
  DROP CONSTRAINT IF EXISTS workout_plans_week_number_check;

ALTER TABLE workout_plans
  ADD CONSTRAINT workout_plans_week_number_check
  CHECK (week_number >= 1);

ALTER TABLE workout_plans
  DROP CONSTRAINT IF EXISTS workout_plans_plan_context_check;

ALTER TABLE workout_plans
  ADD CONSTRAINT workout_plans_plan_context_check
  CHECK (plan_context IN ('first_plan', 'weekly_regeneration', 'manual_update'));

CREATE INDEX IF NOT EXISTS idx_workout_plans_user_context_created
  ON workout_plans(user_id, plan_context, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_workout_plans_parent
  ON workout_plans(parent_plan_id)
  WHERE parent_plan_id IS NOT NULL;

COMMENT ON COLUMN workout_plans.week_number IS
  'Semana del ciclo de plan. 1=primer plan; >1=regeneraciones semanales.';

COMMENT ON COLUMN workout_plans.plan_context IS
  'Contexto UX del plan activo: first_plan, weekly_regeneration o manual_update.';

COMMENT ON COLUMN workout_plans.parent_plan_id IS
  'Plan anterior del cual se derivó una regeneración semanal.';

-- Refresh dashboard payload RPC with lifecycle fields.
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
  SELECT
    wp.id,
    wp.name,
    wp.ai_notes,
    wp.created_at,
    wp.week_number,
    wp.plan_context,
    wp.days_per_week,
    wp.duration_weeks,
    wp.difficulty,
    wp.goal
  FROM workout_plans wp
  WHERE wp.user_id = auth.uid()
    AND wp.is_active = true
  ORDER BY wp.created_at DESC
  LIMIT 1
),
plan_workouts AS (
  SELECT
    w.id,
    w.name,
    w.focus,
    w.day_of_week,
    w.order_in_plan,
    w.estimated_duration_minutes,
    COALESCE(COUNT(we.id), 0)::int AS exercise_count
  FROM workouts w
  JOIN active_plan ap ON ap.id = w.plan_id
  LEFT JOIN workout_exercises we ON we.workout_id = w.id
  GROUP BY
    w.id,
    w.name,
    w.focus,
    w.day_of_week,
    w.order_in_plan,
    w.estimated_duration_minutes
),
recent_logs AS (
  SELECT
    pl.id,
    pl.workout_id,
    pl.completed_at,
    pl.duration_minutes
  FROM progress_logs pl
  WHERE pl.user_id = auth.uid()
    AND pl.workout_id IS NOT NULL
    AND pl.completed_at >= p_recent_start
  ORDER BY pl.completed_at DESC
),
week_logs AS (
  SELECT *
  FROM recent_logs
  WHERE completed_at >= p_week_start
),
week_volume AS (
  SELECT
    COALESCE(SUM(weight_value * rep_value), 0)::numeric AS total_kg
  FROM week_logs wl
  JOIN exercise_logs el ON el.progress_log_id = wl.id
  CROSS JOIN LATERAL unnest(
    COALESCE(el.weights_kg, ARRAY[]::numeric[]),
    COALESCE(el.reps_completed, ARRAY[]::integer[])
  ) AS set_values(weight_value, rep_value)
),
has_history AS (
  SELECT EXISTS (
    SELECT 1
    FROM progress_logs pl
    WHERE pl.user_id = auth.uid()
      AND pl.workout_id IS NOT NULL
    LIMIT 1
  ) AS value
)
SELECT jsonb_build_object(
  'active_plan', (
    SELECT to_jsonb(ap)
    FROM active_plan ap
  ),
  'workouts', COALESCE((
    SELECT jsonb_agg(to_jsonb(pw) ORDER BY pw.order_in_plan NULLS LAST)
    FROM plan_workouts pw
  ), '[]'::jsonb),
  'recent_logs', COALESCE((
    SELECT jsonb_agg(to_jsonb(rl) ORDER BY rl.completed_at DESC)
    FROM recent_logs rl
  ), '[]'::jsonb),
  'week_logs', COALESCE((
    SELECT jsonb_agg(to_jsonb(wl) ORDER BY wl.completed_at DESC)
    FROM week_logs wl
  ), '[]'::jsonb),
  'week_volume_kg', COALESCE((SELECT total_kg FROM week_volume), 0),
  'has_completed_sessions', COALESCE((SELECT value FROM has_history), false)
);
$$;

GRANT EXECUTE ON FUNCTION public.get_dashboard_payload(timestamptz, timestamptz)
  TO authenticated;
