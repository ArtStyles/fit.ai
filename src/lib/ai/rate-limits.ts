/**
 * rate-limits.ts
 *
 * Verificación de límites antes de llamar a Claude.
 * Las funciones devuelven un resultado en lugar de lanzar excepciones,
 * para que el endpoint pueda decidir cómo responder al cliente.
 *
 * ── Límites por operación ─────────────────────────────────────────────────────
 *   initial_plan_generation:  3 exitosas en 24 h
 *   weekly_plan_regeneration: 2 exitosas en 7 días
 *   plan_adjustment:          no limitado (operación futura)
 *   other:                    no limitado
 *
 * ── Política de fallos ───────────────────────────────────────────────────────
 *   fail-open ante errores de DB: un problema de infraestructura no debe
 *   bloquear a los usuarios. Se loguea el error y se permite la request.
 *
 * ── Gasto global ─────────────────────────────────────────────────────────────
 *   MAX_DAILY_API_SPEND_USD — si no está configurado, se omite la verificación.
 *   El período se reinicia a medianoche UTC.
 */

import 'server-only'
import { createServiceClient } from '@/lib/supabase/service'
import type { AIOperation } from './usage-tracking'

// ─── Tipos públicos ───────────────────────────────────────────────────────────

export interface RateLimitResult {
  allowed:      boolean
  /** Mensaje legible para el usuario. Solo si allowed = false. */
  reason?:      string
  /** Fecha estimada en la que se liberará un slot. Solo si allowed = false. */
  retryAfter?:  Date
}

// ─── Configuración de límites ─────────────────────────────────────────────────

const RATE_LIMITS: Partial<Record<AIOperation, {
  maxCount:    number
  windowHours: number
}>> = {
  initial_plan_generation:  { maxCount: 3,  windowHours: 24      },
  weekly_plan_regeneration: { maxCount: 2,  windowHours: 24 * 7  },
  plan_adjustment:          { maxCount: 10, windowHours: 24      },
  coach_chat:               { maxCount: 30, windowHours: 24      },
  // 'other' no tiene límite configurado
}

const OPERATION_LABELS: Partial<Record<AIOperation, string>> = {
  initial_plan_generation:  'planes iniciales',
  weekly_plan_regeneration: 'regeneraciones semanales',
  plan_adjustment:          'ajustes de IA',
  coach_chat:               'mensajes al coach',
}

// ─── checkUserRateLimit ───────────────────────────────────────────────────────

/**
 * Verifica si el usuario ha alcanzado su cuota para la operación indicada.
 * Solo cuenta llamadas exitosas (success = true).
 *
 * Devuelve { allowed: true } si no hay límite configurado para la operación.
 * Devuelve { allowed: true } en caso de error de DB (fail-open).
 */
export async function checkUserRateLimit(
  userId:    string,
  operation: AIOperation,
): Promise<RateLimitResult> {
  const limit = RATE_LIMITS[operation]

  // Operaciones sin límite configurado
  if (!limit) return { allowed: true }

  const windowStart = new Date(Date.now() - limit.windowHours * 60 * 60 * 1000)

  try {
    const supabase = createServiceClient()

    const { count, error } = await supabase
      .from('ai_usage_logs')
      .select('id', { count: 'exact', head: true })
      .eq('user_id',    userId)
      .eq('operation',  operation)
      .eq('success',    true)
      .gte('created_at', windowStart.toISOString())

    if (error) {
      console.warn('[rate-limits] checkUserRateLimit: error de DB, fail-open:', error.message)
      return { allowed: true }
    }

    // Dentro del límite
    if ((count ?? 0) < limit.maxCount) return { allowed: true }

    // Calcular cuándo expira el slot más antiguo para dar un ETA útil al usuario
    const { data: oldest } = await supabase
      .from('ai_usage_logs')
      .select('created_at')
      .eq('user_id',    userId)
      .eq('operation',  operation)
      .eq('success',    true)
      .gte('created_at', windowStart.toISOString())
      .order('created_at', { ascending: true })
      .limit(1)

    let retryAfter = new Date(Date.now() + limit.windowHours * 60 * 60 * 1000)

    if (oldest?.[0]?.created_at) {
      const oldestMs  = new Date(oldest[0].created_at).getTime()
      const windowMs  = limit.windowHours * 60 * 60 * 1000
      retryAfter      = new Date(oldestMs + windowMs)
    }

    const retryAfterHours = Math.max(1, Math.ceil(
      (retryAfter.getTime() - Date.now()) / (60 * 60 * 1000),
    ))

    const operationLabel = OPERATION_LABELS[operation] ?? 'operaciones de IA'

    const windowText = limit.windowHours < 48 ? '24 horas' : '7 días'

    return {
      allowed:     false,
      reason:      `Límite alcanzado: ${limit.maxCount} ${operationLabel} por ${windowText}. ` +
                   `Vuelve a intentarlo en aproximadamente ${retryAfterHours}h.`,
      retryAfter,
    }

  } catch (err) {
    // Error inesperado (red, config) → fail-open
    console.warn('[rate-limits] checkUserRateLimit: excepción inesperada, fail-open:', err)
    return { allowed: true }
  }
}

// ─── checkGlobalDailyBudget ───────────────────────────────────────────────────

/**
 * Verifica el límite global de gasto diario (reset a medianoche UTC).
 * Si MAX_DAILY_API_SPEND_USD no está configurado, siempre devuelve allowed: true.
 *
 * Devuelve { allowed: true } en caso de error de DB (fail-open).
 */
export async function checkGlobalDailyBudget(): Promise<RateLimitResult> {
  const limitStr = process.env.MAX_DAILY_API_SPEND_USD
  if (!limitStr) return { allowed: true }

  const limitUsd = parseFloat(limitStr)
  if (isNaN(limitUsd) || limitUsd <= 0) {
    console.warn('[rate-limits] MAX_DAILY_API_SPEND_USD no es un número válido:', limitStr)
    return { allowed: true }
  }

  // Medianoche UTC de hoy
  const todayStart = new Date()
  todayStart.setUTCHours(0, 0, 0, 0)

  // Mañana a medianoche UTC (momento en el que se reinicia el contador)
  const tomorrowMidnight = new Date(todayStart)
  tomorrowMidnight.setUTCDate(tomorrowMidnight.getUTCDate() + 1)

  try {
    const supabase = createServiceClient()

    const { data, error } = await supabase
      .from('ai_usage_logs')
      .select('estimated_cost_usd')
      .gte('created_at', todayStart.toISOString())

    if (error) {
      console.warn('[rate-limits] checkGlobalDailyBudget: error de DB, fail-open:', error.message)
      return { allowed: true }
    }

    const todaySpend = (data ?? []).reduce(
      (sum, row) => sum + (Number(row.estimated_cost_usd) || 0),
      0,
    )

    console.log(
      `[rate-limits] gasto diario: $${todaySpend.toFixed(4)} / límite: $${limitUsd.toFixed(2)}`,
    )

    if (todaySpend < limitUsd) return { allowed: true }

    return {
      allowed:    false,
      reason:     `Servicio temporalmente no disponible: se alcanzó el límite de gasto diario ` +
                  `($${todaySpend.toFixed(2)} de $${limitUsd.toFixed(2)}). ` +
                  `La generación de planes estará disponible mañana (medianoche UTC).`,
      retryAfter: tomorrowMidnight,
    }

  } catch (err) {
    console.warn('[rate-limits] checkGlobalDailyBudget: excepción inesperada, fail-open:', err)
    return { allowed: true }
  }
}
