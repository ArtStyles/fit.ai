-- Store per-set RPE values captured during a completed session.
-- RLS stays unchanged because this column belongs to exercise_logs.

ALTER TABLE exercise_logs
  ADD COLUMN IF NOT EXISTS rpe_values INTEGER[];

COMMENT ON COLUMN exercise_logs.rpe_values IS
  'Per-set RPE values recorded during a session. Aligns by index with reps_completed and weights_kg.';
