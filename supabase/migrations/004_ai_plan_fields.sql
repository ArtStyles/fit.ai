-- ============================================================
-- Migration 004: campos para generación de rutinas con IA
-- ============================================================
-- Tablas modificadas:
--   profiles          → preferred_workout_days
--   workout_plans     → ai_notes  + índice user/created_at
--   workouts          → focus     + fix convención day_of_week (0-6 → 1-7)
--   workout_exercises → target_rpe, weight_suggestion_basis
--
-- PREREQUISITO: aplicar 001, 002 y 003 antes de esta migración.
-- ROLLBACK:     ver migrations/004_rollback.sql
-- ============================================================

-- ─────────────────────────────────────────────────────────────
-- 0. FIX: day_of_week — cambiar convención 0-6 (JS/Sun=0)
--         a 1-7 (ISO 8601 / Mon=1) para consistencia con el
--         diseño del sistema de scheduling de rutinas.
--
--    Si ya existen filas con day_of_week = 0, la migración
--    fallará en el CHECK. En una DB nueva no hay datos y es seguro.
--    Para producción con datos: UPDATE workouts SET day_of_week =
--      CASE day_of_week WHEN 0 THEN 7 ELSE day_of_week END
--    antes de añadir el nuevo constraint.
-- ─────────────────────────────────────────────────────────────

-- Actualizar filas existentes si las hay (seguro en DB vacía, no-op)
UPDATE workouts
  SET day_of_week = CASE day_of_week
    WHEN 0 THEN 7   -- domingo: 0 → 7
    ELSE day_of_week -- lunes-sábado: 1-6 ya son correctos en ISO
  END
WHERE day_of_week IS NOT NULL;

-- Reemplazar el constraint
ALTER TABLE workouts
  DROP CONSTRAINT IF EXISTS workouts_day_of_week_check;

ALTER TABLE workouts
  ADD CONSTRAINT workouts_day_of_week_check
    CHECK (day_of_week BETWEEN 1 AND 7);  -- 1=lunes … 7=domingo (ISO 8601)

COMMENT ON COLUMN workouts.day_of_week IS
  'Día de la semana: 1=lunes, 2=martes, … 7=domingo (ISO 8601). '
  'Asignado por assignDaysOfWeek() en el backend, no por la IA.';

-- ─────────────────────────────────────────────────────────────
-- 1. profiles: días de entrenamiento preferidos por el usuario
-- ─────────────────────────────────────────────────────────────

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS preferred_workout_days INTEGER[]
    CHECK (
      preferred_workout_days IS NULL
      OR (
        array_length(preferred_workout_days, 1) BETWEEN 1 AND 7
        AND preferred_workout_days <@ ARRAY[1,2,3,4,5,6,7]
      )
    );

COMMENT ON COLUMN profiles.preferred_workout_days IS
  'Días de entrenamiento preferidos (1=lunes … 7=domingo, ISO 8601). '
  'NULL → usar DEFAULT_SCHEDULES según days_per_week. '
  'Validación adicional (unicidad, cruce con days_per_week) en capa Zod.';

-- ─────────────────────────────────────────────────────────────
-- 2. workout_plans: notas del entrenador IA
-- ─────────────────────────────────────────────────────────────

ALTER TABLE workout_plans
  ADD COLUMN IF NOT EXISTS ai_notes TEXT;

COMMENT ON COLUMN workout_plans.ai_notes IS
  'Mensaje personalizado del entrenador IA para el usuario. '
  'Generado en español por Claude. Máx ~400 chars / 4 frases.';

-- ─────────────────────────────────────────────────────────────
-- 3. workouts: foco muscular del día (generado por IA)
-- ─────────────────────────────────────────────────────────────

ALTER TABLE workouts
  ADD COLUMN IF NOT EXISTS focus TEXT;

COMMENT ON COLUMN workouts.focus IS
  'Grupos musculares principales del día en español. '
  'Ej: "Cuádriceps · Glúteos · Core". Generado por IA.';

-- ─────────────────────────────────────────────────────────────
-- 4. workout_exercises: RPE objetivo y base de peso sugerido
-- ─────────────────────────────────────────────────────────────

ALTER TABLE workout_exercises
  ADD COLUMN IF NOT EXISTS target_rpe INTEGER
    CHECK (target_rpe BETWEEN 1 AND 10),

  ADD COLUMN IF NOT EXISTS weight_suggestion_basis TEXT
    CHECK (weight_suggestion_basis IN (
      'user_baseline_pending',
      'estimated_from_profile',
      'based_on_previous_logs'
    ));

COMMENT ON COLUMN workout_exercises.target_rpe IS
  'RPE objetivo (1-10) asignado por la IA. '
  'El usuario registra el RPE real en exercise_logs.';

COMMENT ON COLUMN workout_exercises.weight_suggestion_basis IS
  'Origen de la sugerencia de peso: '
  'user_baseline_pending   = sin datos, usuario establece baseline; '
  'estimated_from_profile  = estimado por perfil (solo avanzados, semana 1); '
  'based_on_previous_logs  = calculado a partir de logs reales.';

-- ─────────────────────────────────────────────────────────────
-- 5. Índices
-- ─────────────────────────────────────────────────────────────

-- workout_exercises: consultas de progresión por tipo de sugerencia
CREATE INDEX IF NOT EXISTS idx_workout_exercises_weight_basis
  ON workout_exercises(weight_suggestion_basis)
  WHERE weight_suggestion_basis IS NOT NULL;

-- workout_plans: plan activo del usuario (usado en cada request)
-- is_active existe en 001_initial_schema.sql ✓
CREATE INDEX IF NOT EXISTS idx_workout_plans_user_active
  ON workout_plans(user_id, is_active)
  WHERE is_active = TRUE;

-- workout_plans: historial por fecha (solicitado en revisión de migración)
CREATE INDEX IF NOT EXISTS idx_workout_plans_user_created
  ON workout_plans(user_id, created_at DESC);
