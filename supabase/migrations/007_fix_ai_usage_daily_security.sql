-- ============================================================
-- Migration 007: fix ai_usage_daily security mode
-- ============================================================
-- Supabase flags normal views as SECURITY DEFINER because they run
-- with the view owner's permissions unless security_invoker is set.
-- This view is admin/server-only telemetry, so keep user roles out
-- and let service_role/admin query it explicitly.
-- ============================================================

DROP VIEW IF EXISTS ai_usage_daily;

CREATE VIEW ai_usage_daily
WITH (security_invoker = true) AS
SELECT
  date_trunc('day', created_at AT TIME ZONE 'UTC') AS day,
  COUNT(*)                                          AS total_calls,
  COUNT(*) FILTER (WHERE success)                   AS successful_calls,
  SUM(estimated_cost_usd)                           AS total_cost_usd,
  SUM(input_tokens)                                 AS total_input_tokens,
  SUM(output_tokens)                                AS total_output_tokens,
  SUM(cache_creation_tokens)                        AS total_cache_creation_tokens,
  SUM(cache_read_tokens)                            AS total_cache_read_tokens
FROM ai_usage_logs
GROUP BY 1
ORDER BY 1 DESC;

REVOKE ALL ON ai_usage_daily FROM anon, authenticated;
GRANT SELECT ON ai_usage_daily TO service_role;
