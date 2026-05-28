-- ─── Migration 005: ai_usage_logs ─────────────────────────────────────────────
--
-- Una fila por intento de llamada a Claude (no por invocación completa).
-- Permite rastrear el costo real de cada reintento, incluyendo latencia y
-- tipo de error, sin agregar datos de múltiples intentos en una sola fila.
--
-- Política de inserción: solo service role (server-side, bypasa RLS).
-- Política de lectura:   ninguna para 'authenticated' — solo admin vía
--                        Supabase dashboard o service role.
-- ──────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS ai_usage_logs (
  id                    UUID          PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Nullable con ON DELETE SET NULL: si el usuario se elimina, conservamos
  -- los registros de costos para el historial de gasto global.
  user_id               UUID          REFERENCES auth.users(id) ON DELETE SET NULL,

  -- Modelo usado en este intento específico
  model                 TEXT          NOT NULL,

  -- Operación que originó la llamada (rate-limit diferenciado por tipo)
  operation             TEXT          NOT NULL
    CHECK (operation IN (
      'initial_plan_generation',
      'weekly_plan_regeneration',
      'plan_adjustment',
      'other'
    )),

  -- Número de intento dentro de la misma generación (1–5)
  attempt_number        INTEGER       NOT NULL CHECK (attempt_number BETWEEN 1 AND 5),

  -- Tokens de este intento
  input_tokens          INTEGER       NOT NULL DEFAULT 0,
  output_tokens         INTEGER       NOT NULL DEFAULT 0,
  cache_creation_tokens INTEGER       NOT NULL DEFAULT 0,
  cache_read_tokens     INTEGER       NOT NULL DEFAULT 0,

  -- Costo estimado de este intento (calculado en la aplicación)
  estimated_cost_usd    NUMERIC(10,6) NOT NULL DEFAULT 0,

  -- Latencia de la llamada HTTP a Anthropic en ms (NULL si no llegó a llamar)
  latency_ms            INTEGER,

  -- Resultado del intento
  success               BOOLEAN       NOT NULL DEFAULT TRUE,
  error_type            TEXT,         -- NULL si success = true
  error_message         TEXT,         -- hasta 500 chars; NULL si success = true

  created_at            TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- ─── RLS ──────────────────────────────────────────────────────────────────────

ALTER TABLE ai_usage_logs ENABLE ROW LEVEL SECURITY;

-- Sin política SELECT para 'authenticated': los usuarios no ven sus propios logs.
-- El acceso es exclusivamente vía service role o el dashboard de Supabase.
-- Las inserciones se realizan desde el servidor con service role (bypasa RLS).

-- ─── Vista de monitoreo diario ────────────────────────────────────────────────

CREATE OR REPLACE VIEW ai_usage_daily
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

-- ─── Índices ──────────────────────────────────────────────────────────────────

-- Rate-limit por usuario: busca logs recientes de un usuario específico
CREATE INDEX idx_ai_usage_user_created
  ON ai_usage_logs (user_id, created_at DESC);

-- Gasto global diario: suma de estimated_cost_usd del día actual
CREATE INDEX idx_ai_usage_created
  ON ai_usage_logs (created_at DESC);

-- Rate-limit por operación + éxito (consulta de checkUserRateLimit)
CREATE INDEX idx_ai_usage_operation_success
  ON ai_usage_logs (operation, success, created_at DESC);
