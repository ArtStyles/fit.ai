export type PRKind = 'weight' | 'e1rm' | 'reps'

export interface PRRecord {
  exerciseName: string
  weightKg: number
  kind: PRKind
  /** 1RM estimado (Epley), solo para kind 'e1rm'. */
  e1rmKg?: number
  /** Repeticiones del récord, solo para kind 'reps'. */
  reps?: number
}

export interface RecordSetInput {
  weightKg: number
  reps: number
}

/** Fórmula de Epley: peso × (1 + reps/30). */
export function epley1Rm(weightKg: number, reps: number): number {
  return weightKg * (1 + reps / 30)
}

function round1(value: number): number {
  return Math.round(value * 10) / 10
}

function maxWeight(sets: RecordSetInput[]): number {
  return sets.reduce((max, set) => Math.max(max, set.weightKg > 0 ? set.weightKg : 0), 0)
}

function bestE1rm(sets: RecordSetInput[]): { e1rm: number; weightKg: number } {
  return sets.reduce(
    (best, set) => {
      if (set.weightKg <= 0 || set.reps < 1) return best
      const e1rm = epley1Rm(set.weightKg, set.reps)
      return e1rm > best.e1rm ? { e1rm, weightKg: set.weightKg } : best
    },
    { e1rm: 0, weightKg: 0 },
  )
}

function maxBodyweightReps(sets: RecordSetInput[]): number {
  return sets.reduce(
    (max, set) => (set.weightKg <= 0 ? Math.max(max, set.reps) : max),
    0,
  )
}

/**
 * Decide si la sesión actual marca un récord personal para el ejercicio.
 * Emite como máximo un récord, priorizando peso > e1RM > reps.
 */
export function detectPersonalRecord(params: {
  exerciseName: string
  currentSets: RecordSetInput[]
  historySets: RecordSetInput[]
  hasHistory: boolean
}): PRRecord | null {
  const { exerciseName, currentSets, historySets, hasHistory } = params

  const currentMaxWeight = maxWeight(currentSets)

  // ── Trabajo con carga ───────────────────────────────────────────────────────
  if (currentMaxWeight > 0) {
    if (!hasHistory) {
      return { exerciseName, weightKg: currentMaxWeight, kind: 'weight' }
    }

    const historicMaxWeight = maxWeight(historySets)
    if (currentMaxWeight > historicMaxWeight) {
      return { exerciseName, weightKg: currentMaxWeight, kind: 'weight' }
    }

    const current = bestE1rm(currentSets)
    const historic = bestE1rm(historySets)
    if (round1(current.e1rm) > round1(historic.e1rm)) {
      return {
        exerciseName,
        weightKg: current.weightKg,
        kind: 'e1rm',
        e1rmKg: round1(current.e1rm),
      }
    }

    return null
  }

  // ── Peso corporal: récord por repeticiones ─────────────────────────────────
  const currentMaxReps = maxBodyweightReps(currentSets)
  if (currentMaxReps <= 0 || !hasHistory) return null

  const historicMaxReps = maxBodyweightReps(historySets)
  if (historicMaxReps > 0 && currentMaxReps > historicMaxReps) {
    return { exerciseName, weightKg: 0, kind: 'reps', reps: currentMaxReps }
  }

  return null
}
