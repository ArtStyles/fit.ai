-- ============================================================
-- FitAI — wger Integration Columns
-- Run this in: Supabase Dashboard > SQL Editor
-- ============================================================

ALTER TABLE exercises
  ADD COLUMN IF NOT EXISTS wger_id     INTEGER UNIQUE,
  ADD COLUMN IF NOT EXISTS is_compound BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_exercises_wger_id
  ON exercises(wger_id)
  WHERE wger_id IS NOT NULL;
