-- ============================================================
-- Migration 012: calendar payload helper
-- ============================================================
-- Objetivo:
--   - Exponer una RPC segura por auth.uid() que devuelve los
--     agregados por día (sesiones, volumen, duración, log_ids)
--     para la vista /calendario.
--   - Agrupar por día en la zona horaria de la app.
-- PREREQUISITO: aplicar 001-011 antes de esta migración.
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_calendar_payload(
  p_time_zone text DEFAULT 'America/Havana',
  p_from      timestamptz DEFAULT NULL
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
WITH day_sessions AS (
  SELECT
    (pl.completed_at AT TIME ZONE p_time_zone)::date AS day,
    COUNT(*)::int AS sessions,
    COALESCE(SUM(pl.duration_minutes), 0)::int AS duration_min,
    jsonb_agg(pl.id ORDER BY pl.completed_at DESC) AS log_ids
  FROM progress_logs pl
  WHERE pl.user_id = auth.uid()
    AND pl.workout_id IS NOT NULL
    AND (p_from IS NULL OR pl.completed_at >= p_from)
  GROUP BY 1
),
day_volume AS (
  SELECT
    (pl.completed_at AT TIME ZONE p_time_zone)::date AS day,
    COALESCE(SUM(weight_value * rep_value), 0)::numeric AS volume_kg
  FROM progress_logs pl
  JOIN exercise_logs el ON el.progress_log_id = pl.id
  CROSS JOIN LATERAL unnest(
    COALESCE(el.weights_kg, ARRAY[]::numeric[]),
    COALESCE(el.reps_completed, ARRAY[]::integer[])
  ) AS set_values(weight_value, rep_value)
  WHERE pl.user_id = auth.uid()
    AND pl.workout_id IS NOT NULL
    AND (p_from IS NULL OR pl.completed_at >= p_from)
  GROUP BY 1
)
SELECT COALESCE(jsonb_agg(
  jsonb_build_object(
    'date',         to_char(ds.day, 'YYYY-MM-DD'),
    'sessions',     ds.sessions,
    'duration_min', ds.duration_min,
    'volume_kg',    COALESCE(dv.volume_kg, 0),
    'log_ids',      ds.log_ids
  ) ORDER BY ds.day
), '[]'::jsonb)
FROM day_sessions ds
LEFT JOIN day_volume dv ON dv.day = ds.day;
$$;

GRANT EXECUTE ON FUNCTION public.get_calendar_payload(text, timestamptz) TO authenticated;

COMMENT ON FUNCTION public.get_calendar_payload(text, timestamptz) IS
  'Agregados por día (sesiones, volumen, duración, log_ids) del usuario autenticado para el calendario.';
