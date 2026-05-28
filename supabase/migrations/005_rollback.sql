-- ─── Rollback de Migration 005 ────────────────────────────────────────────────
-- Elimina la vista, la tabla y todos sus objetos dependientes.
-- Los índices y políticas se eliminan en cascade con la tabla.

DROP VIEW IF EXISTS ai_usage_daily;
DROP TABLE IF EXISTS ai_usage_logs;
