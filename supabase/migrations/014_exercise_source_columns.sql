-- 014_exercise_source_columns.sql
-- Origen del catálogo: permite dedup por (source, external_id) para datasets como
-- free-exercise-db cuyos ids son strings (wger_id es entero y queda sin uso nuevo).

ALTER TABLE exercises
  ADD COLUMN IF NOT EXISTS source      TEXT,
  ADD COLUMN IF NOT EXISTS external_id TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_exercises_source_external
  ON exercises (source, external_id)
  WHERE source IS NOT NULL AND external_id IS NOT NULL;
