-- ============================================================
-- Migration 006: dashboard performance helpers
-- ============================================================
-- Objetivo:
--   - Reducir roundtrips del dashboard y /plan.
--   - Añadir índices compuestos alineados con las consultas reales.
--   - Exponer una RPC segura por auth.uid() que devuelve el payload
--     del dashboard en una sola llamada.
--
-- PREREQUISITO: aplicar 001-005 antes de esta migración.
-- ============================================================

-- ─────────────────────────────────────────────────────────────
-- Índices de lectura frecuente
-- ─────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_workouts_plan_day_order
  ON workouts(plan_id, day_of_week, order_in_plan)
  WHERE plan_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_workout_exercises_workout_order
  ON workout_exercises(workout_id, order_index);

CREATE INDEX IF NOT EXISTS idx_progress_logs_user_completed
  ON progress_logs(user_id, completed_at DESC);

CREATE INDEX IF NOT EXISTS idx_progress_logs_user_workout_completed
  ON progress_logs(user_id, workout_id, completed_at DESC)
  WHERE workout_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_exercise_logs_progress_exercise
  ON exercise_logs(progress_log_id, exercise_id);

-- ─────────────────────────────────────────────────────────────
-- RPC: payload del dashboard
-- ─────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_dashboard_payload(
  p_week_start  timestamptz,
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

COMMENT ON FUNCTION public.get_dashboard_payload(timestamptz, timestamptz) IS
  'Devuelve en una sola llamada el plan activo, workouts, logs recientes y volumen semanal para el dashboard.';
