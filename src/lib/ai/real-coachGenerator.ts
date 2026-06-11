/**
 * real-coachGenerator.ts
 *
 * Implementación real del coach IA (chat y ajustes) vía Anthropic API.
 * Importado exclusivamente por los wrappers chatGenerator.ts y
 * adjustmentGenerator.ts.
 *
 * ── Diseño ───────────────────────────────────────────────────────────────────
 *  - Modelo barato (AI_MODELS.coach, default Haiku): alto volumen, respuestas
 *    cortas. Sobreescribible con ANTHROPIC_MODEL_COACH.
 *  - Chat: 1 intento, respuesta de texto.
 *  - Ajustes: hasta 2 intentos (el segundo con feedback) porque exige JSON.
 *  - System prompts compartidos entre usuarios → cache_control ephemeral.
 *  - Cada intento se loguea en ai_usage_logs (coach_chat / plan_adjustment).
 */

import 'server-only'
import { getAnthropicClient } from '@/lib/anthropic/client'
import { AI_MODELS } from '@/lib/anthropic/models'
import {
  ADJUSTMENT_SYSTEM_PROMPT,
  COACH_CHAT_SYSTEM_PROMPT,
  buildAdjustmentUserMessage,
} from './prompts/coach'
import { validateAdjustmentChanges } from './adjustments'
import { logAIUsage, calculateCost } from './usage-tracking'
import type { AdjustmentChange, AdjustmentContext } from './adjustments'

const CHAT_MAX_TOKENS       = 1024
const ADJUSTMENT_MAX_TOKENS = 1024
const TIMEOUT_PER_CALL      = 30_000
const MAX_HISTORY_MESSAGES  = 12

export interface CoachHistoryMessage {
  role: 'user' | 'assistant'
  content: string
}

type UsageBlock = {
  input_tokens:                 number
  output_tokens:                number
  cache_creation_input_tokens?: number
  cache_read_input_tokens?:     number
}

async function logCoachUsage(params: {
  userId: string
  operation: 'coach_chat' | 'plan_adjustment'
  model: string
  attempt: number
  usage: UsageBlock | null
  latencyMs: number
  success: boolean
  errorMessage?: string
}) {
  await logAIUsage({
    userId:              params.userId,
    operation:           params.operation,
    model:               params.model,
    attemptNumber:       params.attempt,
    inputTokens:         params.usage?.input_tokens ?? 0,
    outputTokens:        params.usage?.output_tokens ?? 0,
    cacheCreationTokens: params.usage?.cache_creation_input_tokens ?? 0,
    cacheReadTokens:     params.usage?.cache_read_input_tokens ?? 0,
    latencyMs:           params.latencyMs,
    success:             params.success,
    errorType:           params.success ? undefined : 'unknown',
    errorMessage:        params.errorMessage?.slice(0, 500),
  })
}

function extractText(response: { content: { type: string; text?: string }[] }): string {
  const block = response.content.find(item => item.type === 'text')
  if (!block || typeof block.text !== 'string' || !block.text.trim()) {
    throw new Error('Claude no devolvió texto')
  }
  return block.text.trim()
}

function estimateCost(model: string, usage: UsageBlock | null): number {
  if (!usage) return 0
  return calculateCost(
    model,
    usage.input_tokens,
    usage.output_tokens,
    usage.cache_creation_input_tokens ?? 0,
    usage.cache_read_input_tokens ?? 0,
  )
}

// ─── Chat ─────────────────────────────────────────────────────────────────────

export async function callClaudeForChat(opts: {
  userId:      string
  message:     string
  history:     CoachHistoryMessage[]
  contextText: string
}): Promise<{ content: string; model: string; estimatedCostUsd: number }> {
  const client = getAnthropicClient()
  const model  = AI_MODELS.coach
  const start  = Date.now()

  const history = opts.history.slice(-MAX_HISTORY_MESSAGES)

  try {
    const response = await client.messages.create(
      {
        model,
        max_tokens: CHAT_MAX_TOKENS,
        system: [
          {
            type: 'text' as const,
            text: COACH_CHAT_SYSTEM_PROMPT,
            cache_control: { type: 'ephemeral' as const },
          },
          {
            type: 'text' as const,
            text: `CONTEXTO DEL USUARIO:\n${opts.contextText}`,
          },
        ],
        messages: [
          ...history.map(message => ({ role: message.role, content: message.content })),
          { role: 'user' as const, content: opts.message },
        ],
      },
      { timeout: TIMEOUT_PER_CALL },
    )

    const usage = response.usage as UsageBlock
    await logCoachUsage({
      userId: opts.userId, operation: 'coach_chat', model, attempt: 1,
      usage, latencyMs: Date.now() - start, success: true,
    })

    return {
      content: extractText(response),
      model,
      estimatedCostUsd: estimateCost(model, usage),
    }
  } catch (err) {
    await logCoachUsage({
      userId: opts.userId, operation: 'coach_chat', model, attempt: 1,
      usage: null, latencyMs: Date.now() - start, success: false,
      errorMessage: err instanceof Error ? err.message : String(err),
    })
    throw err
  }
}

// ─── Ajustes estructurados ────────────────────────────────────────────────────

function parseAdjustmentResponse(
  raw: string,
  validIds: Set<string>,
): { suggestion: string; changes: AdjustmentChange[] } {
  const fenceMatch = raw.match(/```(?:json)?\s*([\s\S]+?)```/)
  const jsonText = (fenceMatch ? fenceMatch[1] : raw).trim()

  let parsed: unknown
  try {
    parsed = JSON.parse(jsonText)
  } catch {
    throw new Error('La respuesta no es JSON válido')
  }

  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error('La respuesta no es un objeto JSON')
  }

  const o = parsed as Record<string, unknown>
  if (typeof o.suggestion !== 'string' || !o.suggestion.trim()) {
    throw new Error('Falta el campo "suggestion"')
  }

  return {
    suggestion: o.suggestion.trim(),
    changes: validateAdjustmentChanges(o.changes, validIds),
  }
}

export async function callClaudeForAdjustment(opts: {
  userId:      string
  request:     string
  context:     AdjustmentContext
  coachContext: string
}): Promise<{ suggestion: string; changes: AdjustmentChange[]; model: string }> {
  const client   = getAnthropicClient()
  const model    = AI_MODELS.coach
  const validIds = new Set(opts.context.exercises.map(exercise => exercise.workoutExerciseId))

  const messages: { role: 'user' | 'assistant'; content: string }[] = [
    { role: 'user', content: buildAdjustmentUserMessage(opts.context, opts.request, opts.coachContext) },
  ]

  let lastError: Error | null = null

  for (let attempt = 1; attempt <= 2; attempt++) {
    const start = Date.now()

    try {
      const response = await client.messages.create(
        {
          model,
          max_tokens: ADJUSTMENT_MAX_TOKENS,
          system: [
            {
              type: 'text' as const,
              text: ADJUSTMENT_SYSTEM_PROMPT,
              cache_control: { type: 'ephemeral' as const },
            },
          ],
          messages,
        },
        { timeout: TIMEOUT_PER_CALL },
      )

      const usage = response.usage as UsageBlock
      const raw = extractText(response)
      const parsed = parseAdjustmentResponse(raw, validIds)

      await logCoachUsage({
        userId: opts.userId, operation: 'plan_adjustment', model, attempt,
        usage, latencyMs: Date.now() - start, success: true,
      })

      return { ...parsed, model }
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err))

      await logCoachUsage({
        userId: opts.userId, operation: 'plan_adjustment', model, attempt,
        usage: null, latencyMs: Date.now() - start, success: false,
        errorMessage: lastError.message,
      })

      if (attempt < 2) {
        messages.push(
          { role: 'assistant', content: 'Respuesta inválida.' },
          {
            role: 'user',
            content:
              `Tu respuesta anterior falló: ${lastError.message}. ` +
              'Responde ÚNICAMENTE con el objeto JSON del schema, sin markdown.',
          },
        )
      }
    }
  }

  throw new Error(`No se pudo generar el ajuste: ${lastError?.message ?? 'error desconocido'}`)
}
