/**
 * planGenerator.ts  —  Punto de entrada unificado (wrapper mock / real)
 *
 * Selecciona automáticamente la implementación según las variables de entorno:
 *
 *   USE_AI_MOCK=true       → mock local (sin API key, para desarrollo y tests)
 *   USE_AI_MOCK=false      → Claude real vía Anthropic API
 *   ANTHROPIC_API_KEY ausente → mock automático aunque USE_AI_MOCK no esté set
 *
 * Para activar la IA real:
 *   1. Añade ANTHROPIC_API_KEY=sk-ant-... a .env.local
 *   2. Cambia USE_AI_MOCK=true → USE_AI_MOCK=false
 *   3. Reinicia el servidor (next dev)
 */

import 'server-only'
import { mockGenerateInitialPlan } from './mock-planGenerator'
import { callClaudeForPlan }       from './real-planGenerator'
import type { AIOperation }        from './usage-tracking'
import type { WeekContext }        from '@/lib/plans/periodization'
import type { UserContext, FilteredExercise, PlanGenerationResult } from './types'

export type { PlanGenerationResult }

// ─── Función pública ──────────────────────────────────────────────────────────

/**
 * Genera un plan de entrenamiento completo.
 *
 * En modo mock: devuelve un plan estructurado generado localmente.
 * En modo real: llama a Claude con reintentos y prompt caching.
 *
 * Los rate-limit checks se realizan ANTES de llamar a esta función, en el
 * endpoint (checkUserRateLimit / checkGlobalDailyBudget de rate-limits.ts).
 *
 * @param opts.userId      — UUID del usuario (para logging de uso en modo real)
 * @param opts.operation   — Tipo de operación (para rate-limit diferenciado)
 * @param opts.user        — Perfil completo del usuario
 * @param opts.exercises   — Pool de ejercicios ya filtrado por filterExercisesForUser()
 * @param opts.weekContext — Fase del ciclo + resumen de la semana anterior (regeneraciones)
 */
export async function generateInitialPlan(opts: {
  userId:      string
  operation:   AIOperation
  user:        UserContext
  exercises:   FilteredExercise[]
  weekContext?: WeekContext
}): Promise<PlanGenerationResult> {

  const useMock =
    process.env.USE_AI_MOCK === 'true' ||
    !process.env.ANTHROPIC_API_KEY

  if (useMock) {
    console.log(
      '[planGenerator] Usando MOCK ' +
      (process.env.USE_AI_MOCK === 'true'
        ? '(USE_AI_MOCK=true)'
        : '(ANTHROPIC_API_KEY no configurada)'),
    )
    const plan = await mockGenerateInitialPlan(opts.user, opts.exercises, opts.weekContext)
    return {
      plan,
      isMock:           true,
      model:            'mock',
      attempt:          1,
      estimatedCostUsd: 0,
    }
  }

  const result = await callClaudeForPlan({
    userId:      opts.userId,
    operation:   opts.operation,
    userContext: opts.user,
    exercises:   opts.exercises,
    weekContext: opts.weekContext,
  })

  return {
    plan:             result.plan,
    isMock:           false,
    model:            result.model,
    attempt:          result.attempt,
    estimatedCostUsd: result.estimatedCostUsd,
  }
}
