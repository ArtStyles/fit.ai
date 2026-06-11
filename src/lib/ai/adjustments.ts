/**
 * adjustments.ts
 *
 * Tipos y validación de los ajustes estructurados de entrenamiento.
 *
 * El generador (mock o Claude) devuelve, además del texto, una lista de
 * cambios concretos (`AdjustmentChange[]`) que el usuario puede aplicar
 * con un tap. Todo cambio se valida server-side contra los IDs reales
 * del entrenamiento antes de aplicarse: el JSON del modelo nunca se
 * confía tal cual.
 */

export interface AdjustmentExercise {
  workoutExerciseId: string
  name: string
  sets: number | null
  reps: number | null
  targetRpe: number | null
}

export interface AdjustmentContext {
  workoutName: string
  workoutFocus: string | null
  exercises: AdjustmentExercise[]
}

export type AdjustmentChange =
  | {
      type: 'update_exercise'
      workoutExerciseId: string
      sets?: number
      reps?: number
      targetRpe?: number
      restSeconds?: number
    }
  | {
      type: 'remove_exercise'
      workoutExerciseId: string
    }

// ─── Cotas de seguridad ───────────────────────────────────────────────────────

const BOUNDS = {
  sets:        { min: 1,  max: 10  },
  reps:        { min: 1,  max: 100 },
  targetRpe:   { min: 1,  max: 10  },
  restSeconds: { min: 15, max: 600 },
} as const

type NumericField = keyof typeof BOUNDS

function clampField(field: NumericField, value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined
  const { min, max } = BOUNDS[field]
  return Math.min(max, Math.max(min, Math.round(value)))
}

/**
 * Valida y normaliza la lista de cambios devuelta por el generador.
 * Descarta entradas malformadas, IDs fuera del entrenamiento y valores
 * fuera de rango (estos últimos se clampean). Mantiene como máximo un
 * cambio por ejercicio (gana el primero).
 */
export function validateAdjustmentChanges(
  raw: unknown,
  validWorkoutExerciseIds: Set<string>,
): AdjustmentChange[] {
  if (!Array.isArray(raw)) return []

  const changes: AdjustmentChange[] = []
  const seenIds = new Set<string>()

  for (const item of raw) {
    if (typeof item !== 'object' || item === null) continue
    const candidate = item as Record<string, unknown>

    const id = candidate.workoutExerciseId
    if (typeof id !== 'string' || !validWorkoutExerciseIds.has(id) || seenIds.has(id)) continue

    if (candidate.type === 'remove_exercise') {
      changes.push({ type: 'remove_exercise', workoutExerciseId: id })
      seenIds.add(id)
      continue
    }

    if (candidate.type !== 'update_exercise') continue

    const update: Extract<AdjustmentChange, { type: 'update_exercise' }> = {
      type: 'update_exercise',
      workoutExerciseId: id,
    }

    for (const field of Object.keys(BOUNDS) as NumericField[]) {
      const value = clampField(field, candidate[field])
      if (value !== undefined) update[field] = value
    }

    const hasFields = (Object.keys(BOUNDS) as NumericField[]).some(
      field => update[field] !== undefined,
    )
    if (!hasFields) continue

    changes.push(update)
    seenIds.add(id)
  }

  return changes
}

/** Describe cada cambio en español para la confirmación previa a aplicar. */
export function summarizeChanges(
  changes: AdjustmentChange[],
  context: AdjustmentContext,
): string[] {
  const nameById = new Map(
    context.exercises.map(exercise => [exercise.workoutExerciseId, exercise.name]),
  )

  return changes.map(change => {
    const name = nameById.get(change.workoutExerciseId) ?? 'Ejercicio'

    if (change.type === 'remove_exercise') return `Quitar ${name}`

    const parts: string[] = []
    if (change.sets !== undefined) parts.push(`${change.sets} series`)
    if (change.reps !== undefined) parts.push(`${change.reps} reps`)
    if (change.targetRpe !== undefined) parts.push(`RPE ${change.targetRpe}`)
    if (change.restSeconds !== undefined) parts.push(`descanso ${change.restSeconds} s`)

    return `${name} → ${parts.join(', ')}`
  })
}
