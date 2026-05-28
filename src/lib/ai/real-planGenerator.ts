/**
 * real-planGenerator.ts
 *
 * Implementación real de generación de planes usando la API de Anthropic.
 * Importado exclusivamente por planGenerator.ts (el wrapper).
 *
 * ── Estrategia de reintentos ────────────────────────────────────────────────
 *
 *  Intento │ Modelo   │ Feedback al modelo              │ Cuándo usa Opus
 * ─────────┼──────────┼─────────────────────────────────┼──────────────────
 *    1      │ PRIMARY  │ — (prompt limpio)               │ nunca
 *    2      │ PRIMARY  │ sí — describe el error anterior │ nunca
 *    3      │ depende  │ sí — describe el error anterior │ solo si intento 2
 *           │          │                                 │ fue CONSTRAINT_VIOLATION
 *
 * ── Prompt Caching ──────────────────────────────────────────────────────────
 *    system[0]:               PLAN_SYSTEM_PROMPT + cache_control
 *    messages[0].content[0]:  catálogo de ejercicios + cache_control
 *    messages[0].content[1]:  perfil del usuario — SIN cache_control
 *
 * ── Logging de costos ────────────────────────────────────────────────────────
 *    Una fila en ai_usage_logs POR INTENTO (éxito o fallo).
 */

import 'server-only'
import { getAnthropicClient } from '@/lib/anthropic/client'
import { AI_MODELS } from '@/lib/anthropic/models'
import { PLAN_SYSTEM_PROMPT, buildCatalogContent, buildContextContent } from './prompts/system'
import { logAIUsage, calculateCost } from './usage-tracking'
import type { AIOperation, AIErrorType } from './usage-tracking'
import type { AIPlanResponse, UserContext, FilteredExercise } from './types'
import { estimateWeight } from './weights'

// ─── Constantes ───────────────────────────────────────────────────────────────

const MAX_TOKENS       = 4096
const TIMEOUT_PER_CALL = 60_000
const TIMEOUT_TOTAL    = 180_000
const MAX_ATTEMPTS     = 3

// ─── Clasificación de errores ─────────────────────────────────────────────────

type RetryErrorType =
  | 'PARSE_ERROR'
  | 'SCHEMA_ERROR'
  | 'CONSTRAINT_VIOLATION'
  | 'TIMEOUT_ERROR'
  | 'MODEL_ERROR'
  | 'AUTH_ERROR'

class PlanGenerationError extends Error {
  constructor(
    public readonly type: RetryErrorType,
    message: string,
    public readonly raw?: string,
  ) {
    super(message)
    this.name = 'PlanGenerationError'
  }
}

function classifyError(type: RetryErrorType): AIErrorType {
  switch (type) {
    case 'PARSE_ERROR':          return 'json_parse'
    case 'SCHEMA_ERROR':         return 'validation'
    case 'CONSTRAINT_VIOLATION': return 'constraint_violation'
    case 'TIMEOUT_ERROR':        return 'timeout'
    case 'MODEL_ERROR':          return 'unknown'
    case 'AUTH_ERROR':           return 'network'
    default:                     return 'unknown'
  }
}

// ─── Logging estructurado (consola) ──────────────────────────────────────────

interface AttemptLog {
  attempt:               number
  model:                 string
  latency_ms:            number
  input_tokens?:         number
  output_tokens?:        number
  cache_read_tokens?:    number
  cache_creation_tokens?: number
  error_type?:           RetryErrorType
  error_message?:        string
}

function logAttempt(entry: AttemptLog): void {
  console.log(
    `[real-planGenerator] attempt=${entry.attempt} model=${entry.model} ` +
    `latency=${entry.latency_ms}ms ` +
    (entry.input_tokens          ? `tokens_in=${entry.input_tokens} `              : '') +
    (entry.output_tokens         ? `tokens_out=${entry.output_tokens} `            : '') +
    (entry.cache_read_tokens     ? `cache_read=${entry.cache_read_tokens} `        : '') +
    (entry.cache_creation_tokens ? `cache_create=${entry.cache_creation_tokens} `  : '') +
    (entry.error_type            ? `error=${entry.error_type}: ${entry.error_message}` : 'OK'),
  )
}

// ─── Validación de la respuesta ───────────────────────────────────────────────

function validatePlanResponse(
  parsed: unknown,
  validExerciseIds: Set<string>,
): AIPlanResponse {
  if (typeof parsed !== 'object' || parsed === null) {
    throw new PlanGenerationError('SCHEMA_ERROR', 'La respuesta no es un objeto JSON')
  }
  const o = parsed as Record<string, unknown>

  if ('error' in o && typeof o.error === 'string') {
    throw new PlanGenerationError('MODEL_ERROR', `Claude reportó: ${o.error}`)
  }
  if (typeof o.plan !== 'object' || o.plan === null) {
    throw new PlanGenerationError('SCHEMA_ERROR', 'Falta el campo "plan"')
  }

  const plan = o.plan as Record<string, unknown>
  if (typeof plan.display_name !== 'string') {
    throw new PlanGenerationError('SCHEMA_ERROR', 'Falta plan.display_name (string)')
  }
  if (typeof plan.ai_notes !== 'string') {
    throw new PlanGenerationError('SCHEMA_ERROR', 'Falta plan.ai_notes (string)')
  }
  if (!Array.isArray(plan.days) || plan.days.length === 0) {
    throw new PlanGenerationError('SCHEMA_ERROR', 'plan.days debe ser un array no vacío')
  }

  for (const day of plan.days as unknown[]) {
    if (typeof day !== 'object' || day === null) {
      throw new PlanGenerationError('SCHEMA_ERROR', 'Cada día debe ser un objeto')
    }
    const d = day as Record<string, unknown>
    if (typeof d.day_number !== 'number') {
      throw new PlanGenerationError('SCHEMA_ERROR', 'Falta day.day_number (number)')
    }
    if (typeof d.display_name !== 'string') {
      throw new PlanGenerationError('SCHEMA_ERROR', 'Falta day.display_name (string)')
    }
    if (typeof d.focus !== 'string') {
      throw new PlanGenerationError('SCHEMA_ERROR', 'Falta day.focus (string)')
    }
    if (!Array.isArray(d.exercises) || d.exercises.length === 0) {
      throw new PlanGenerationError('SCHEMA_ERROR', `day ${d.day_number} no tiene ejercicios`)
    }

    for (const ex of d.exercises as unknown[]) {
      if (typeof ex !== 'object' || ex === null) {
        throw new PlanGenerationError('SCHEMA_ERROR', 'Cada ejercicio debe ser un objeto')
      }
      const e = ex as Record<string, unknown>
      if (typeof e.exercise_id !== 'string') {
        throw new PlanGenerationError('SCHEMA_ERROR', 'Falta exercise.exercise_id (string)')
      }
      if (!validExerciseIds.has(e.exercise_id)) {
        throw new PlanGenerationError(
          'CONSTRAINT_VIOLATION',
          `exercise_id "${e.exercise_id}" no está en el pool`,
          e.exercise_id,
        )
      }
      if (typeof e.sets !== 'number' || e.sets < 1) {
        throw new PlanGenerationError('SCHEMA_ERROR', `exercise ${e.exercise_id}: sets inválido`)
      }
      if (typeof e.rest_seconds !== 'number') {
        throw new PlanGenerationError('SCHEMA_ERROR', `exercise ${e.exercise_id}: falta rest_seconds`)
      }
      if (typeof e.target_rpe !== 'number' || e.target_rpe < 1 || e.target_rpe > 10) {
        throw new PlanGenerationError('SCHEMA_ERROR', `exercise ${e.exercise_id}: target_rpe debe ser 1-10`)
      }
      const hasReps     = e.reps !== null && e.reps !== undefined
      const hasDuration = e.duration_seconds !== null && e.duration_seconds !== undefined
      if (hasReps === hasDuration) {
        throw new PlanGenerationError(
          'SCHEMA_ERROR',
          `exercise ${e.exercise_id}: exactamente uno de reps/duration_seconds debe ser no-null`,
        )
      }
    }
  }

  return parsed as AIPlanResponse
}

// ─── Feedback de error ────────────────────────────────────────────────────────

function buildFeedbackMessage(err: PlanGenerationError, validIds: string[]): string {
  switch (err.type) {
    case 'PARSE_ERROR':
      return (
        'Tu respuesta anterior no era JSON válido. ' +
        'Responde ÚNICAMENTE con el objeto JSON especificado, sin markdown.'
      )
    case 'SCHEMA_ERROR':
      return (
        `Tu respuesta anterior tenía un error de estructura: ${err.message}. ` +
        'Revisa el schema del sistema y corrige el JSON.'
      )
    case 'CONSTRAINT_VIOLATION':
      return (
        `Tu respuesta anterior usó el exercise_id "${err.raw}" que NO está en el pool. ` +
        `Solo puedes usar los ${validIds.length} UUIDs del array "available_exercises".`
      )
    case 'TIMEOUT_ERROR':
      return 'La llamada anterior expiró. Genera una respuesta más concisa.'
    default:
      return 'Inténtalo de nuevo siguiendo exactamente el schema especificado.'
  }
}

// ─── Estimaciones de peso ─────────────────────────────────────────────────────

function buildWeightHints(
  user:      UserContext,
  exercises: FilteredExercise[],
): Record<string, { weight_kg: number | null; notes: string | null }> {
  if (user.fitness_level !== 'advanced' || !user.weight_kg) return {}
  const hints: Record<string, { weight_kg: number | null; notes: string | null }> = {}
  for (const ex of exercises) {
    if (!ex.is_compound) continue
    const est = estimateWeight(ex.name, user.gender, user.weight_kg)
    if (est.weight_kg !== null || est.notes !== null) hints[ex.id] = est
  }
  return hints
}

// ─── Parsear texto ────────────────────────────────────────────────────────────

function parseResponseText(raw: string): unknown {
  const text      = raw.trim()
  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]+?)```/)
  const jsonText  = fenceMatch ? fenceMatch[1].trim() : text
  try {
    return JSON.parse(jsonText)
  } catch {
    throw new PlanGenerationError('PARSE_ERROR', 'JSON malformado en la respuesta', jsonText.slice(0, 200))
  }
}

// ─── Tipos de contenido ───────────────────────────────────────────────────────

type CachedTextBlock = { type: 'text'; text: string; cache_control: { type: 'ephemeral' } }
type PlainTextBlock  = { type: 'text'; text: string }
type ContentBlock    = CachedTextBlock | PlainTextBlock
type Message         = { role: 'user' | 'assistant'; content: string | ContentBlock[] }

// ─── Tipo de resultado ────────────────────────────────────────────────────────

export interface RealGenerateResult {
  plan:                    AIPlanResponse
  model:                   string
  attempt:                 number
  logs:                    AttemptLog[]
  totalInputTokens:        number
  totalOutputTokens:       number
  totalCacheReadTokens:    number
  totalCacheCreationTokens: number
  estimatedCostUsd:        number
}

// ─── Función pública ──────────────────────────────────────────────────────────

export async function callClaudeForPlan(opts: {
  userId:      string
  operation:   AIOperation
  userContext: UserContext
  exercises:   FilteredExercise[]
}): Promise<RealGenerateResult> {
  const client = getAnthropicClient()

  const validExerciseIds = new Set(opts.exercises.map(e => e.id))
  const validIdsArray    = opts.exercises.map(e => e.id)
  const weightHints      = buildWeightHints(opts.userContext, opts.exercises)

  const catalogText = buildCatalogContent({
    exercises:   JSON.stringify(opts.exercises, null, 2),
    weightHints: JSON.stringify(weightHints, null, 2),
  })
  const contextText = buildContextContent(JSON.stringify(opts.userContext, null, 2))

  const messages: Message[] = [
    {
      role: 'user',
      content: [
        { type: 'text', text: catalogText, cache_control: { type: 'ephemeral' } },
        { type: 'text', text: contextText },
      ],
    },
  ]

  const logs:      AttemptLog[]               = []
  let lastError:   PlanGenerationError | null  = null
  const totalStart = Date.now()

  let totalInputTokens       = 0
  let totalOutputTokens      = 0
  let totalCacheReadTokens   = 0
  let totalCacheCreationTokens = 0
  let totalEstimatedCostUsd  = 0

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {

    if (Date.now() - totalStart > TIMEOUT_TOTAL) {
      throw new Error(`Timeout total de ${TIMEOUT_TOTAL / 1000}s superado tras ${attempt - 1} intento(s)`)
    }

    const model =
      attempt < 3
        ? AI_MODELS.primary
        : lastError?.type === 'CONSTRAINT_VIOLATION'
          ? AI_MODELS.fallback
          : AI_MODELS.primary

    const attemptStart = Date.now()

    try {
      const response = await client.messages.create(
        {
          model,
          max_tokens: MAX_TOKENS,
          system: [
            { type: 'text' as const, text: PLAN_SYSTEM_PROMPT, cache_control: { type: 'ephemeral' as const } },
          ],
          messages: messages as Parameters<typeof client.messages.create>[0]['messages'],
        },
        { timeout: TIMEOUT_PER_CALL },
      )

      const latency_ms = Date.now() - attemptStart

      const u = response.usage as {
        input_tokens:                 number
        output_tokens:                number
        cache_creation_input_tokens?: number
        cache_read_input_tokens?:     number
      }
      const inputTokens         = u?.input_tokens                ?? 0
      const outputTokens        = u?.output_tokens               ?? 0
      const cacheCreationTokens = u?.cache_creation_input_tokens ?? 0
      const cacheReadTokens     = u?.cache_read_input_tokens     ?? 0

      totalInputTokens         += inputTokens
      totalOutputTokens        += outputTokens
      totalCacheCreationTokens += cacheCreationTokens
      totalCacheReadTokens     += cacheReadTokens
      totalEstimatedCostUsd    += calculateCost(model, inputTokens, outputTokens, cacheCreationTokens, cacheReadTokens)

      const textBlock = response.content.find(b => b.type === 'text')
      if (!textBlock || textBlock.type !== 'text') {
        throw new PlanGenerationError('SCHEMA_ERROR', 'Claude no devolvió un bloque de texto')
      }

      logAttempt({ attempt, model, latency_ms, input_tokens: inputTokens, output_tokens: outputTokens,
        cache_read_tokens: cacheReadTokens, cache_creation_tokens: cacheCreationTokens })
      logs.push({ attempt, model, latency_ms, input_tokens: inputTokens, output_tokens: outputTokens,
        cache_read_tokens: cacheReadTokens, cache_creation_tokens: cacheCreationTokens })

      const planRes = validatePlanResponse(parseResponseText(textBlock.text), validExerciseIds)

      await logAIUsage({
        userId: opts.userId, operation: opts.operation, model, attemptNumber: attempt,
        inputTokens, outputTokens, cacheCreationTokens, cacheReadTokens, latencyMs: latency_ms, success: true,
      })

      return {
        plan: planRes, model, attempt, logs,
        totalInputTokens, totalOutputTokens, totalCacheReadTokens, totalCacheCreationTokens,
        estimatedCostUsd: totalEstimatedCostUsd,
      }

    } catch (err) {
      const latency_ms = Date.now() - attemptStart

      let planErr: PlanGenerationError
      if (err instanceof PlanGenerationError) {
        planErr = err
      } else if (err instanceof Error && err.message.includes('timed out')) {
        planErr = new PlanGenerationError('TIMEOUT_ERROR', err.message)
      } else if (err instanceof Error && (err.message.includes('401') || err.message.includes('403'))) {
        await logAIUsage({
          userId: opts.userId, operation: opts.operation, model, attemptNumber: attempt,
          inputTokens: 0, outputTokens: 0, latencyMs: latency_ms, success: false,
          errorType: 'network', errorMessage: String(err).slice(0, 500),
        })
        throw err
      } else {
        planErr = new PlanGenerationError('SCHEMA_ERROR', err instanceof Error ? err.message : String(err))
      }

      logAttempt({ attempt, model, latency_ms, error_type: planErr.type, error_message: planErr.message })
      logs.push({ attempt, model, latency_ms, error_type: planErr.type, error_message: planErr.message })

      await logAIUsage({
        userId: opts.userId, operation: opts.operation, model, attemptNumber: attempt,
        inputTokens: 0, outputTokens: 0, latencyMs: latency_ms, success: false,
        errorType: classifyError(planErr.type), errorMessage: planErr.message.slice(0, 500),
      })

      if (planErr.type === 'MODEL_ERROR' || planErr.type === 'AUTH_ERROR') {
        throw new Error(`[${planErr.type}] ${planErr.message}`)
      }

      lastError = planErr

      if (attempt < MAX_ATTEMPTS) {
        const feedback = buildFeedbackMessage(planErr, validIdsArray)
        if (planErr.raw) messages.push({ role: 'assistant', content: planErr.raw })
        messages.push({ role: 'user', content: feedback })
      }
    }
  }

  throw new Error(
    `No se pudo generar el plan tras ${MAX_ATTEMPTS} intentos. ` +
    `Último error [${lastError?.type ?? 'UNKNOWN'}]: ${lastError?.message ?? 'desconocido'}`,
  )
}
