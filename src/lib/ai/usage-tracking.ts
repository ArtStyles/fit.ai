/**
 * usage-tracking.ts
 *
 * Cálculo de costos y logging por intento de llamada a Claude.
 * Cada llamada HTTP a Anthropic genera una fila en ai_usage_logs.
 *
 * ── Diseño ───────────────────────────────────────────────────────────────────
 *   Una fila por INTENTO (no por invocación completa).
 *   Permite rastrear el costo real de cada reintento por separado
 *   y correlacionar latencia con tipo de error de forma granular.
 *
 * ── Política de fallos ───────────────────────────────────────────────────────
 *   logAIUsage: los errores de inserción se loguean pero nunca se propagan.
 *   Un fallo de logging no debe romper el flujo de generación del plan.
 */

import 'server-only'
import { createServiceClient } from '@/lib/supabase/service'

// ─── Tabla de precios (USD por 1 millón de tokens) ────────────────────────────
//
// Última verificación: mayo 2025.
// Fuente: https://www.anthropic.com/pricing
// Actualizar cuando Anthropic modifique los precios.
//
// cache_creation = 1.25× el precio de input (escritura a caché, TTL 5 min)
// cache_read     = 0.10× el precio de input (lectura desde caché, ~90% ahorro)

const MODEL_PRICING: Record<string, {
  input:           number
  output:          number
  cache_creation:  number
  cache_read:      number
}> = {
  'claude-sonnet-4-5': { input:  3.00, output: 15.00, cache_creation:  3.75, cache_read:  0.30 },
  'claude-sonnet-4-6': { input:  3.00, output: 15.00, cache_creation:  3.75, cache_read:  0.30 },
  'claude-opus-4-1':   { input: 15.00, output: 75.00, cache_creation: 18.75, cache_read:  1.50 },
  'claude-opus-4-5':   { input: 15.00, output: 75.00, cache_creation: 18.75, cache_read:  1.50 },
  'claude-opus-4-6':   { input: 15.00, output: 75.00, cache_creation: 18.75, cache_read:  1.50 },
  'claude-opus-4-7':   { input:  5.00, output: 25.00, cache_creation:  6.25, cache_read:  0.50 },
  'claude-haiku-4-5':  { input:  1.00, output:  5.00, cache_creation:  1.25, cache_read:  0.10 },
}

// Fallback si el modelo no está en la tabla (modelo personalizado via env var)
const DEFAULT_PRICING = MODEL_PRICING['claude-sonnet-4-5']

// ─── Tipos públicos ───────────────────────────────────────────────────────────

/** Operación que originó la llamada a Claude. Controla el rate-limit diferenciado. */
export type AIOperation =
  | 'initial_plan_generation'
  | 'weekly_plan_regeneration'
  | 'plan_adjustment'
  | 'other'

/** Clasificación del error para análisis de fallos en el dashboard. */
export type AIErrorType =
  | 'json_parse'
  | 'validation'
  | 'constraint_violation'
  | 'network'
  | 'rate_limit'
  | 'timeout'
  | 'unknown'

export interface UsageLogParams {
  /** UUID del usuario. null si se desconoce o la cuenta fue eliminada. */
  userId:               string | null
  operation:            AIOperation
  model:                string
  /** Número de intento dentro de la misma generación (1–5). */
  attemptNumber:        number
  inputTokens:          number
  outputTokens:         number
  /** Tokens escritos a la caché de prompt (cache_creation_input_tokens). */
  cacheCreationTokens?: number
  /** Tokens leídos desde la caché de prompt (cache_read_input_tokens). */
  cacheReadTokens?:     number
  latencyMs?:           number
  success:              boolean
  errorType?:           AIErrorType
  /** Mensaje de error truncado a 500 chars. Solo si success = false. */
  errorMessage?:        string
}

// ─── calculateCost ────────────────────────────────────────────────────────────

/**
 * Calcula el costo estimado en USD de una única llamada a la API de Anthropic.
 * Usa la tabla de precios del modelo especificado; si el modelo no está en la
 * tabla, utiliza los precios de Sonnet como fallback conservador.
 */
export function calculateCost(
  model:                string,
  inputTokens:          number,
  outputTokens:         number,
  cacheCreationTokens:  number = 0,
  cacheReadTokens:      number = 0,
): number {
  const p = MODEL_PRICING[model] ?? DEFAULT_PRICING

  const inputCost          = (inputTokens         / 1_000_000) * p.input
  const outputCost         = (outputTokens        / 1_000_000) * p.output
  const cacheCreationCost  = (cacheCreationTokens / 1_000_000) * p.cache_creation
  const cacheReadCost      = (cacheReadTokens     / 1_000_000) * p.cache_read

  return inputCost + outputCost + cacheCreationCost + cacheReadCost
}

// ─── logAIUsage ───────────────────────────────────────────────────────────────

/**
 * Inserta una fila en ai_usage_logs para un único intento de llamada a Claude.
 *
 * El costo se calcula automáticamente si no se proporciona.
 * Los errores de inserción se loguean pero nunca se propagan.
 */
export async function logAIUsage(params: UsageLogParams): Promise<void> {
  const cacheCreationTokens = params.cacheCreationTokens ?? 0
  const cacheReadTokens     = params.cacheReadTokens     ?? 0

  const estimatedCostUsd = calculateCost(
    params.model,
    params.inputTokens,
    params.outputTokens,
    cacheCreationTokens,
    cacheReadTokens,
  )

  try {
    const supabase = createServiceClient()

    const { error } = await supabase
      .from('ai_usage_logs')
      .insert({
        user_id:               params.userId,
        model:                 params.model,
        operation:             params.operation,
        attempt_number:        params.attemptNumber,
        input_tokens:          params.inputTokens,
        output_tokens:         params.outputTokens,
        cache_creation_tokens: cacheCreationTokens,
        cache_read_tokens:     cacheReadTokens,
        estimated_cost_usd:    estimatedCostUsd,
        latency_ms:            params.latencyMs ?? null,
        success:               params.success,
        error_type:            params.errorType  ?? null,
        error_message:         params.errorMessage ?? null,
      })

    if (error) {
      console.error('[usage-tracking] logAIUsage: error al insertar en ai_usage_logs:', error.message)
    } else {
      console.log(
        `[usage-tracking] attempt logged: op=${params.operation} ` +
        `attempt=${params.attemptNumber} model=${params.model} ` +
        `cost=$${estimatedCostUsd.toFixed(6)} ` +
        `in=${params.inputTokens} out=${params.outputTokens} ` +
        `cache_create=${cacheCreationTokens} cache_read=${cacheReadTokens} ` +
        `latency=${params.latencyMs ?? '?'}ms success=${params.success}` +
        (params.errorType ? ` error=${params.errorType}` : ''),
      )
    }
  } catch (err) {
    console.error('[usage-tracking] logAIUsage: excepción inesperada:', err)
  }
}
