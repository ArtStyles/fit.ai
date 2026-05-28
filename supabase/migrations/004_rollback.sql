-- ============================================================
-- Rollback 004: revierte todos los cambios de 004_ai_plan_fields.sql
-- ============================================================
-- ADVERTENCIA: ejecutar solo si 004_ai_plan_fields.sql fue aplicada
-- y se necesita revertir.  Los datos en las columnas eliminadas se
-- perderán permanentemente.
--
-- Orden: primero índices → luego columnas → luego constraints
-- ============================================================

-- ─────────────────────────────────────────────────────────────
-- 1. Eliminar índices creados en 004
-- ─────────────────────────────────────────────────────────────

DROP INDEX IF EXISTS idx_workout_plans_user_created;
DROP INDEX IF EXISTS idx_workout_plans_user_active;
DROP INDEX IF EXISTS idx_workout_exercises_weight_basis;

-- ─────────────────────────────────────────────────────────────
-- 2. workout_exercises: eliminar columnas de 004
-- ─────────────────────────────────────────────────────────────

ALTER TABLE workout_exercises
  DROP COLUMN IF EXISTS target_rpe,
  DROP COLUMN IF EXISTS weight_suggestion_basis;

-- ─────────────────────────────────────────────────────────────
-- 3. workouts: eliminar focus + restaurar CHECK day_of_week
--    (vuelve a la convención JS: 0=domingo … 6=sábado)
-- ─────────────────────────────────────────────────────────────

ALTER TABLE workouts
  DROP COLUMN IF EXISTS focus;

-- Revertir la convención ISO 8601 → JS (7 vuelve a 0 para domingo)
UPDATE workouts
  SET day_of_week = CASE day_of_week
    WHEN 7 THEN 0   -- domingo: 7 → 0
    ELSE day_of_week -- lunes-sábado: 1-6 se quedan igual
  END
WHERE day_of_week IS NOT NULL;

ALTER TABLE workouts
  DROP CONSTRAINT IF EXISTS workouts_day_of_week_check;

ALTER TABLE workouts
  ADD CONSTRAINT workouts_day_of_week_check
    CHECK (day_of_week BETWEEN 0 AND 6);  -- restaurar convención original (JS)

COMMENT ON COLUMN workouts.day_of_week IS
  'Día de la semana: 0=domingo … 6=sábado (convención JS). '
  'Restaurado por rollback de migración 004.';

-- ─────────────────────────────────────────────────────────────
-- 4. workout_plans: eliminar ai_notes
-- ─────────────────────────────────────────────────────────────

ALTER TABLE workout_plans
  DROP COLUMN IF EXISTS ai_notes;

-- ─────────────────────────────────────────────────────────────
-- 5. profiles: eliminar preferred_workout_days
-- ─────────────────────────────────────────────────────────────

ALTER TABLE profiles
  DROP COLUMN IF EXISTS preferred_workout_days;

-- ─────────────────────────────────────────────────────────────
-- FIN DEL ROLLBACK
-- Para reaplicar la migración: ejecutar 004_ai_plan_fields.sql
-- ─────────────────────────────────────────────────────────────
