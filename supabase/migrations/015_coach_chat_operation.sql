-- ============================================================
-- Migration 015: operación coach_chat en ai_usage_logs
-- ============================================================
-- El chat del coach ahora llama a Claude de verdad y registra su
-- uso/costo. Se amplía el CHECK de operation para incluirlo.
-- ============================================================

ALTER TABLE ai_usage_logs
  DROP CONSTRAINT IF EXISTS ai_usage_logs_operation_check;

ALTER TABLE ai_usage_logs
  ADD CONSTRAINT ai_usage_logs_operation_check
  CHECK (operation IN (
    'initial_plan_generation',
    'weekly_plan_regeneration',
    'plan_adjustment',
    'coach_chat',
    'other'
  ));
