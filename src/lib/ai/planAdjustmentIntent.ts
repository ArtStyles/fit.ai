import 'server-only'
import { getAnthropicClient } from '@/lib/anthropic/client'
import { AI_MODELS } from '@/lib/anthropic/models'
import { logAIUsage } from './usage-tracking'
import type { CardioModality, PlanAdjustmentIntent } from '@/lib/training-engine'

export interface PlanIntentContext {
  daysPerWeek: number
  sessionDurationMinutes: number
  availableEquipment: string[]
  cardioPreferences: CardioModality[]
  exercises: Array<{ id: string; name: string }>
}

export interface PlanIntentResult {
  suggestion: string
  intent: PlanAdjustmentIntent
  isMock: boolean
  model: string
}

const HEALTH_PATTERN = /dolor|duele|dol[ií]a|lesi[oó]n|molestia|pecho|mareo|desmayo|cirug|m[eé]dic|pain|injury/i

function mockIntent(request: string, context: PlanIntentContext): PlanIntentResult {
  const lower = request.toLowerCase()
  let intent: PlanAdjustmentIntent
  if (HEALTH_PATTERN.test(request)) {
    intent = { type: 'health_change' }
  } else {
    const dayMatch = lower.match(/([2-6])\s*d[ií]as?/)
    const durationMatch = lower.match(/(30|45|60|90)\s*(min|minutos?)/)
    const exercise = context.exercises.find(item => lower.includes(item.name.toLowerCase()))
    if (dayMatch) intent = { type: 'change_days', daysPerWeek: Number(dayMatch[1]) }
    else if (durationMatch) intent = { type: 'change_duration', sessionDurationMinutes: Number(durationMatch[1]) as 30 | 45 | 60 | 90 }
    else if (/m[aá]s (f[aá]cil|suave)|menos intens|descarga|fatiga/.test(lower)) intent = { type: 'change_intensity', direction: 'easier' }
    else if (/m[aá]s (duro|intenso)|subir intensidad/.test(lower)) intent = { type: 'change_intensity', direction: 'harder' }
    else if (exercise && /cambiar|reemplazar|quitar|sustituir/.test(lower)) intent = { type: 'replace_exercise', exerciseId: exercise.id }
    else intent = { type: 'change_duration', sessionDurationMinutes: context.sessionDurationMinutes as 30 | 45 | 60 | 90 }
  }

  return {
    suggestion: intent.type === 'health_change'
      ? 'Antes de modificar la rutina, actualiza el cribado de preparación. No aplicaré cambios automáticos relacionados con dolor o salud.'
      : 'Preparé una vista previa del plan completo. El motor volverá a validar duración, volumen, equipamiento y restricciones antes de aplicarla.',
    intent,
    isMock: true,
    model: 'mock',
  }
}

function validateIntent(raw: unknown, context: PlanIntentContext): PlanAdjustmentIntent | null {
  if (!raw || typeof raw !== 'object') return null
  const value = raw as Record<string, unknown>
  if (value.type === 'health_change') return { type: 'health_change' }
  if (value.type === 'change_days' && typeof value.daysPerWeek === 'number' && value.daysPerWeek >= 2 && value.daysPerWeek <= 6) {
    return { type: 'change_days', daysPerWeek: Math.round(value.daysPerWeek) }
  }
  if (value.type === 'change_duration' && [30, 45, 60, 90].includes(Number(value.sessionDurationMinutes))) {
    return { type: 'change_duration', sessionDurationMinutes: Number(value.sessionDurationMinutes) as 30 | 45 | 60 | 90 }
  }
  if (value.type === 'change_intensity' && (value.direction === 'easier' || value.direction === 'harder')) {
    return { type: 'change_intensity', direction: value.direction }
  }
  if (value.type === 'equipment_unavailable' && Array.isArray(value.equipment)) {
    const equipment = value.equipment.filter((item): item is string => typeof item === 'string' && context.availableEquipment.includes(item))
    return equipment.length > 0 ? { type: 'equipment_unavailable', equipment } : null
  }
  if (value.type === 'replace_exercise' && typeof value.exerciseId === 'string' && context.exercises.some(item => item.id === value.exerciseId)) {
    return { type: 'replace_exercise', exerciseId: value.exerciseId }
  }
  if (value.type === 'change_cardio_preferences' && Array.isArray(value.cardioPreferences)) {
    const allowed: CardioModality[] = ['walking', 'running', 'cycling', 'elliptical', 'rowing', 'stairs', 'jump_rope']
    const cardioPreferences = value.cardioPreferences.filter((item): item is CardioModality => allowed.includes(item as CardioModality))
    return cardioPreferences.length > 0 ? { type: 'change_cardio_preferences', cardioPreferences } : null
  }
  return null
}

export async function generatePlanAdjustmentIntent(options: {
  userId: string
  request: string
  context: PlanIntentContext
}): Promise<PlanIntentResult> {
  if (HEALTH_PATTERN.test(options.request)) return mockIntent(options.request, options.context)
  if (process.env.USE_AI_MOCK === 'true' || !process.env.ANTHROPIC_API_KEY) {
    return mockIntent(options.request, options.context)
  }

  const client = getAnthropicClient()
  const model = AI_MODELS.coach
  const start = Date.now()
  try {
    const response = await client.messages.create({
      model,
      max_tokens: 500,
      system: `Interpreta una petición de ajuste de entrenamiento. Devuelve solo JSON válido con {"suggestion": string, "intent": object}. El intent debe ser exactamente uno de: change_days {daysPerWeek 2-6}, change_duration {sessionDurationMinutes 30|45|60|90}, change_intensity {direction easier|harder}, equipment_unavailable {equipment string[]}, replace_exercise {exerciseId}, change_cardio_preferences {cardioPreferences string[]}, health_change. Nunca prescribas ni interpretes dolor o enfermedad: usa health_change.`,
      messages: [{
        role: 'user',
        content: `CONTEXTO SEGURO:\n${JSON.stringify(options.context)}\n\nPETICIÓN:\n${options.request}`,
      }],
    }, { timeout: 20_000 })
    const text = response.content.find(block => block.type === 'text')
    if (!text || text.type !== 'text') throw new Error('Respuesta sin texto')
    const parsed = JSON.parse(text.text) as Record<string, unknown>
    const intent = validateIntent(parsed.intent, options.context)
    if (!intent || typeof parsed.suggestion !== 'string') throw new Error('Intención inválida')
    const usage = response.usage as typeof response.usage & { cache_creation_input_tokens?: number; cache_read_input_tokens?: number }
    await logAIUsage({
      userId: options.userId,
      operation: 'plan_adjustment',
      model,
      attemptNumber: 1,
      inputTokens: usage.input_tokens,
      outputTokens: usage.output_tokens,
      cacheCreationTokens: usage.cache_creation_input_tokens,
      cacheReadTokens: usage.cache_read_input_tokens,
      latencyMs: Date.now() - start,
      success: true,
    })
    return { suggestion: parsed.suggestion, intent, isMock: false, model }
  } catch (error) {
    await logAIUsage({
      userId: options.userId,
      operation: 'plan_adjustment',
      model,
      attemptNumber: 1,
      inputTokens: 0,
      outputTokens: 0,
      latencyMs: Date.now() - start,
      success: false,
      errorType: 'validation',
      errorMessage: error instanceof Error ? error.message : String(error),
    })
    throw error
  }
}
