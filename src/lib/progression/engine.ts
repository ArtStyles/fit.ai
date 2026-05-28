import type {
  ProgressionExerciseInput,
  ProgressionSetInput,
  ProgressionSuggestion,
} from './types'

const COMPOUND_INCREMENT_KG = 2.5
const ISOLATION_INCREMENT_KG = 1.25
const DELOAD_RATIO = 0.95

function toNumber(value: string | number | null): number | null {
  if (value === null || value === '') return null
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function roundToIncrement(value: number, increment: number): number {
  return Number((Math.round(value / increment) * increment).toFixed(2))
}

function roundDownToIncrement(value: number, increment: number): number {
  return Number((Math.max(increment, Math.floor(value / increment) * increment)).toFixed(2))
}

function completedSets(sets: ProgressionSetInput[]): ProgressionSetInput[] {
  return sets.filter(set => set.completed)
}

function maxCompletedWeight(sets: ProgressionSetInput[]): number | null {
  const weights = completedSets(sets)
    .map(set => toNumber(set.weightKg))
    .filter((weight): weight is number => weight !== null && weight > 0)

  if (weights.length === 0) return null
  return Math.max(...weights)
}

function averageRpe(sets: ProgressionSetInput[]): number | null {
  const rpeValues = completedSets(sets)
    .map(set => set.rpe)
    .filter((rpe): rpe is number => typeof rpe === 'number' && rpe >= 1 && rpe <= 10)

  if (rpeValues.length === 0) return null
  return rpeValues.reduce((sum, rpe) => sum + rpe, 0) / rpeValues.length
}

function targetRepsMet(sets: ProgressionSetInput[], targetReps: number | null): boolean {
  if (!targetReps) return true
  return completedSets(sets).every(set => (toNumber(set.reps) ?? 0) >= targetReps)
}

function incrementFor(input: ProgressionExerciseInput): number {
  return input.isCompound ? COMPOUND_INCREMENT_KG : ISOLATION_INCREMENT_KG
}

function withCommonFields(
  input: ProgressionExerciseInput,
  suggestion: Omit<ProgressionSuggestion, 'exerciseId' | 'exerciseName'>,
): ProgressionSuggestion {
  return {
    exerciseId: input.exerciseId,
    exerciseName: input.exerciseName,
    ...suggestion,
  }
}

export function buildProgressionSuggestion(
  input: ProgressionExerciseInput,
): ProgressionSuggestion | null {
  const doneSets = completedSets(input.sets)
  const currentWeightKg = maxCompletedWeight(input.sets) ?? input.suggestedWeightKg

  if (doneSets.length === 0) {
    if (input.status !== 'skipped' || currentWeightKg === null) return null

    return withCommonFields(input, {
      currentWeightKg,
      nextWeightKg: currentWeightKg,
      action: 'hold',
      reason: 'Mantén el peso. No hubo series registradas para ajustar con confianza.',
      confidence: 'low',
    })
  }

  if (currentWeightKg === null || currentWeightKg <= 0) {
    return withCommonFields(input, {
      currentWeightKg: null,
      nextWeightKg: null,
      action: 'baseline',
      reason: 'Registra un peso de trabajo para crear una referencia real.',
      confidence: 'low',
    })
  }

  const avgRpe = averageRpe(input.sets)
  const completedTargetSets = doneSets.length >= input.targetSets
  const completedTargetReps = targetRepsMet(input.sets, input.targetReps)
  const targetCompleted = completedTargetSets && completedTargetReps
  const increment = incrementFor(input)

  if (input.previousLogCount === 0) {
    return withCommonFields(input, {
      currentWeightKg,
      nextWeightKg: currentWeightKg,
      action: 'baseline',
      reason: 'Tomamos este peso como tu baseline para próximas progresiones.',
      confidence: avgRpe === null ? 'medium' : 'high',
    })
  }

  if (avgRpe === null) {
    return withCommonFields(input, {
      currentWeightKg,
      nextWeightKg: currentWeightKg,
      action: 'hold',
      reason: 'Completaste trabajo, pero faltó RPE para subir con confianza.',
      confidence: 'low',
    })
  }

  if (avgRpe >= 9 || (!targetCompleted && avgRpe > input.targetRpe)) {
    return withCommonFields(input, {
      currentWeightKg,
      nextWeightKg: roundDownToIncrement(currentWeightKg * DELOAD_RATIO, increment),
      action: 'decrease',
      reason: 'El esfuerzo quedó alto para el objetivo. Baja un poco y recupera calidad.',
      confidence: 'high',
    })
  }

  if (!targetCompleted) {
    return withCommonFields(input, {
      currentWeightKg,
      nextWeightKg: currentWeightKg,
      action: 'hold',
      reason: 'Mantén el peso hasta completar todas las reps objetivo.',
      confidence: 'medium',
    })
  }

  if (avgRpe <= input.targetRpe) {
    return withCommonFields(input, {
      currentWeightKg,
      nextWeightKg: roundToIncrement(currentWeightKg + increment, increment),
      action: 'increase',
      reason: 'Completaste el objetivo con margen. Sube la carga la próxima vez.',
      confidence: 'high',
    })
  }

  return withCommonFields(input, {
    currentWeightKg,
    nextWeightKg: currentWeightKg,
    action: 'hold',
    reason: 'Buen trabajo. Mantén el peso hasta que el RPE baje.',
    confidence: 'medium',
  })
}

export function buildProgressionSuggestions(
  inputs: ProgressionExerciseInput[],
): ProgressionSuggestion[] {
  return inputs
    .map(buildProgressionSuggestion)
    .filter((suggestion): suggestion is ProgressionSuggestion => suggestion !== null)
}
