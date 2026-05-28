/**
 * mock-planGenerator.ts
 *
 * Simula la respuesta de Claude para desarrollo local sin API key.
 * Genera un plan estructurado y realista basado en el perfil del usuario.
 *
 * ── Garantías del mock ─────────────────────────────────────────────────────
 *   - Solo usa exercise_id del pool recibido (nunca inventa UUIDs)
 *   - Respeta days_per_week exactamente
 *   - Compounds antes que isolations dentro de cada día
 *   - Duración estimada ≤ session_duration_minutes + 10 min
 *   - NO escribe en ai_usage_logs (no consumió tokens reales)
 *   - Simula latencia de 2-5 s para comportamiento realista en UI
 */

import 'server-only'
import type { AIPlanResponse, UserContext, FilteredExercise } from './types'

// ─── Splits por días por semana ────────────────────────────────────────────────

interface SplitDay {
  displayName:    string
  focus:          string
  /** Substrings case-insensitive para filtrar ejercicios por muscle_groups */
  muscleKeywords: string[]
}

function generateSplit(days: number): SplitDay[] {
  if (days <= 3) {
    const labels = [
      { suffix: 'A', focus: 'Full Body · Fuerza'      },
      { suffix: 'B', focus: 'Full Body · Resistencia' },
      { suffix: 'C', focus: 'Full Body · Potencia'    },
    ]
    return Array.from({ length: days }, (_, i) => ({
      displayName:    `Full Body ${labels[i].suffix}`,
      focus:          labels[i].focus,
      muscleKeywords: ['chest', 'pectoral', 'back', 'lat', 'quad', 'hamstring', 'glute', 'shoulder', 'delt'],
    }))
  }

  if (days === 4) {
    return [
      {
        displayName:    'Upper A — Empuje',
        focus:          'Pecho · Hombros · Tríceps',
        muscleKeywords: ['chest', 'pectoral', 'shoulder', 'delt', 'tricep'],
      },
      {
        displayName:    'Lower A — Piernas',
        focus:          'Cuádriceps · Isquios · Glúteos',
        muscleKeywords: ['quad', 'thigh', 'hamstring', 'glute', 'calf', 'gastro'],
      },
      {
        displayName:    'Upper B — Tirón y Core',
        focus:          'Espalda · Bíceps · Core',
        muscleKeywords: ['back', 'lat', 'rhomboid', 'bicep', 'core', 'ab', 'trap'],
      },
      {
        displayName:    'Lower B — Glúteos y Core',
        focus:          'Glúteos · Isquios · Core',
        muscleKeywords: ['glute', 'hamstring', 'calf', 'core', 'ab', 'quad'],
      },
    ]
  }

  // 5-6 días: PPL con repetición
  const ppl: SplitDay[] = [
    {
      displayName:    'Push — Pecho y Hombros',
      focus:          'Pecho · Hombros · Tríceps',
      muscleKeywords: ['chest', 'pectoral', 'shoulder', 'delt', 'tricep'],
    },
    {
      displayName:    'Pull — Espalda y Bíceps',
      focus:          'Espalda · Bíceps',
      muscleKeywords: ['back', 'lat', 'rhomboid', 'bicep', 'trap'],
    },
    {
      displayName:    'Piernas — Cuádriceps',
      focus:          'Cuádriceps · Isquios · Glúteos',
      muscleKeywords: ['quad', 'thigh', 'hamstring', 'glute', 'calf'],
    },
    {
      displayName:    'Push — Pecho y Tríceps',
      focus:          'Pecho · Hombros · Tríceps',
      muscleKeywords: ['chest', 'pectoral', 'shoulder', 'delt', 'tricep'],
    },
    {
      displayName:    'Pull — Espalda y Core',
      focus:          'Espalda · Bíceps · Core',
      muscleKeywords: ['back', 'lat', 'rhomboid', 'bicep', 'core', 'ab'],
    },
    {
      displayName:    'Piernas — Glúteos',
      focus:          'Glúteos · Isquios · Core',
      muscleKeywords: ['glute', 'hamstring', 'calf', 'core', 'ab', 'quad'],
    },
  ]
  return ppl.slice(0, days)
}

// ─── Selección de ejercicios ───────────────────────────────────────────────────

/** Determina cuántos ejercicios caben en la sesión sin exceder duration + 10 min. */
function exerciseBudget(sessionMinutes: number): { compounds: number; isolations: number } {
  // ~3.5 min por serie (trabajo + descanso)
  // Compounds: 4 series → ~14 min cada uno
  // Isolations: 3 series → ~10.5 min cada uno
  if (sessionMinutes < 40) return { compounds: 2, isolations: 1 }
  if (sessionMinutes < 55) return { compounds: 2, isolations: 2 }
  if (sessionMinutes < 70) return { compounds: 2, isolations: 3 }
  return                          { compounds: 3, isolations: 3 }
}

/** Fisher-Yates shuffle — para variar el plan entre días equivalentes. */
function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

function pickExercisesForSplit(
  split:     SplitDay,
  exercises: FilteredExercise[],
  user:      UserContext,
): FilteredExercise[] {
  // Ejercicios que tocan algún músculo del split
  const matching = exercises.filter(ex =>
    ex.muscle_groups.some(mg =>
      split.muscleKeywords.some(kw => mg.toLowerCase().includes(kw)),
    ),
  )

  // Fallback: si hay pocos matches, completar con el pool general
  const pool = matching.length >= 4 ? matching : exercises

  const compounds  = pool.filter(ex =>  ex.is_compound)
  const isolations = pool.filter(ex => !ex.is_compound)

  const budget = exerciseBudget(user.session_duration_minutes)

  // Shuffle para variar días con el mismo tipo de split
  const picked = [
    ...shuffle(compounds).slice(0, budget.compounds),
    ...shuffle(isolations).slice(0, budget.isolations),
  ]

  // Garantía: al menos 3 ejercicios aunque no haya suficientes
  if (picked.length < 3) {
    return shuffle(exercises).slice(0, 3)
  }

  return picked
}

// ─── Parámetros por nivel ─────────────────────────────────────────────────────

const LEVEL_PARAMS = {
  beginner:     { sets: 3, rpeBase: 6, restCompound: 75,  restIsolation: 60  },
  intermediate: { sets: 3, rpeBase: 7, restCompound: 90,  restIsolation: 60  },
  advanced:     { sets: 4, rpeBase: 8, restCompound: 120, restIsolation: 75  },
} as const

const GOAL_REPS: Record<string, { compound: number; isolation: number }> = {
  gain_strength:     { compound: 5,  isolation: 10 },
  build_muscle:      { compound: 8,  isolation: 12 },
  lose_weight:       { compound: 12, isolation: 15 },
  improve_endurance: { compound: 15, isolation: 20 },
  stay_active:       { compound: 10, isolation: 12 },
}

const GOAL_LABELS: Record<string, string> = {
  build_muscle:      'hipertrofia',
  gain_strength:     'fuerza',
  lose_weight:       'pérdida de grasa',
  improve_endurance: 'resistencia',
  stay_active:       'bienestar general',
}

const SPLIT_NAMES: Record<number, string> = {
  2: 'Full Body',
  3: 'Full Body',
  4: 'Upper/Lower',
  5: 'PPL',
  6: 'PPL',
}

// ─── Función pública ──────────────────────────────────────────────────────────

/**
 * Genera un plan de entrenamiento sin llamar a la API de Anthropic.
 * Útil para desarrollo, CI y tests E2E.
 *
 * @param user      Perfil del usuario (mismo que se enviaría a Claude)
 * @param exercises Pool de ejercicios ya filtrado por filter.ts
 */
export async function mockGenerateInitialPlan(
  user:      UserContext,
  exercises: FilteredExercise[],
): Promise<AIPlanResponse> {
  // Simular latencia realista (Claude tarda 5-15 s en planes complejos)
  await new Promise<void>(r => setTimeout(r, 2000 + Math.random() * 3000))

  console.log(
    `[mock] Generación simulada — ` +
    `level=${user.fitness_level} goal=${user.primary_goal} ` +
    `days=${user.days_per_week} pool=${exercises.length}`,
  )

  const lp    = LEVEL_PARAMS[user.fitness_level]
  const reps  = GOAL_REPS[user.primary_goal] ?? GOAL_REPS.stay_active
  const splits = generateSplit(user.days_per_week)

  const days = splits.map((split, dayIdx) => {
    const picked = pickExercisesForSplit(split, exercises, user)

    const planExercises = picked.map((ex, i) => {
      const isCompound  = ex.is_compound
      const sets        = isCompound ? lp.sets : 3
      const repCount    = isCompound ? reps.compound : reps.isolation
      const restSeconds = isCompound ? lp.restCompound : lp.restIsolation
      // El primer ejercicio del día (calentamiento) va 1 RPE por debajo
      const targetRpe   = Math.min(10, lp.rpeBase + (i === 0 ? 0 : 1))

      return {
        exercise_id:             ex.id,
        sets,
        reps:                    repCount,
        duration_seconds:        null as number | null,
        rest_seconds:            restSeconds,
        target_rpe:              targetRpe,
        weight_kg:               null as number | null,
        weight_suggestion_basis: 'user_baseline_pending' as const,
        notes: i === 0
          ? 'Primer ejercicio del día — empieza con carga conservadora.'
          : null,
      }
    })

    return {
      day_number:   dayIdx + 1,
      display_name: split.displayName,
      focus:        split.focus,
      exercises:    planExercises,
    }
  })

  const levelLabel = {
    beginner:     'Inicial',
    intermediate: 'Intermedio',
    advanced:     'Avanzado',
  }[user.fitness_level]

  const goalLabel  = GOAL_LABELS[user.primary_goal] ?? 'fitness'
  const splitName  = SPLIT_NAMES[user.days_per_week] ?? 'Personalizado'

  return {
    plan: {
      display_name: `Plan ${levelLabel} · ${user.days_per_week} días`,
      ai_notes:
        `[MOCK] Plan generado en modo desarrollo sin IA real. ` +
        `Estructura ${splitName} optimizada para ${goalLabel}. ` +
        `Cuando configures ANTHROPIC_API_KEY este mensaje será reemplazado ` +
        `por una nota personalizada de tu entrenador IA.`,
      days,
    },
  }
}
