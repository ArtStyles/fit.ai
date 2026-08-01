import { summarizeExercisePerformance, type EvidenceSet } from '@/lib/training-evidence/performance'

export type SessionExerciseInput = {
  id: string
  exerciseId: string
  exerciseName: string
  muscleGroups: string[]
  setsCompleted: number | null
  weightsKg: number[] | null
  repsCompleted: number[] | null
  rpeValues: (number | null)[] | null
  notes: string | null
}

export type PreviousExercisePerformance = {
  weightsKg: number[] | null
  repsCompleted: number[] | null
  rpeValues: (number | null)[] | null
}

export type PriorBest = {
  weightKg: number
  reps: number
}

export type SessionExerciseEvidence = {
  id: string
  exerciseId: string
  exerciseName: string
  muscleGroups: string[]
  skipped: boolean
  notes: string | null
  sets: EvidenceSet[]
  completedSets: number
  volumeKg: number
  bestSet: EvidenceSet | null
  averageRpe: number | null
  comparison: { weightDeltaKg: number; repsDelta: number } | null
  isRecord: boolean
}

function skippedExercise(exercise: SessionExerciseInput): boolean {
  return (exercise.setsCompleted ?? 0) === 0 && Boolean(exercise.notes?.toLowerCase().startsWith('saltado:'))
}

function betterThan(current: EvidenceSet, previous: PriorBest): boolean {
  return current.weightKg > previous.weightKg ||
    (current.weightKg === previous.weightKg && current.reps > previous.reps)
}

export function buildSessionDebrief({
  durationMinutes,
  exercises,
  previousByExercise,
  priorBestByExercise = new Map<string, PriorBest>(),
}: {
  durationMinutes: number
  exercises: SessionExerciseInput[]
  previousByExercise: Map<string, PreviousExercisePerformance>
  priorBestByExercise?: Map<string, PriorBest>
}) {
  const exerciseEvidence: SessionExerciseEvidence[] = exercises.map(exercise => {
    const performance = summarizeExercisePerformance(exercise.weightsKg, exercise.repsCompleted, exercise.rpeValues)
    const previous = previousByExercise.get(exercise.exerciseId)
    const previousPerformance = previous
      ? summarizeExercisePerformance(previous.weightsKg, previous.repsCompleted, previous.rpeValues)
      : null
    const comparison = performance.bestSet && previousPerformance?.bestSet
      ? {
          weightDeltaKg: Number((performance.bestSet.weightKg - previousPerformance.bestSet.weightKg).toFixed(1)),
          repsDelta: performance.bestSet.reps - previousPerformance.bestSet.reps,
        }
      : null
    const priorBest = priorBestByExercise.get(exercise.exerciseId)

    return {
      id: exercise.id,
      exerciseId: exercise.exerciseId,
      exerciseName: exercise.exerciseName,
      muscleGroups: exercise.muscleGroups,
      skipped: skippedExercise(exercise),
      notes: exercise.notes,
      sets: performance.sets,
      completedSets: exercise.setsCompleted ?? performance.completedSets,
      volumeKg: performance.volumeKg,
      bestSet: performance.bestSet,
      averageRpe: performance.averageRpe,
      comparison,
      isRecord: Boolean(performance.bestSet && priorBest && betterThan(performance.bestSet, priorBest)),
    }
  })
  const completed = exerciseEvidence.filter(exercise => !exercise.skipped)
  const rpes = completed.flatMap(exercise => exercise.averageRpe === null ? [] : [exercise.averageRpe])

  return {
    durationMinutes,
    exercises: exerciseEvidence,
    completedExercises: completed.length,
    totalSets: completed.reduce((sum, exercise) => sum + exercise.completedSets, 0),
    totalVolumeKg: completed.reduce((sum, exercise) => sum + exercise.volumeKg, 0),
    skippedCount: exerciseEvidence.length - completed.length,
    recordCount: completed.filter(exercise => exercise.isRecord).length,
    averageRpe: rpes.length === 0
      ? null
      : Math.round((rpes.reduce((sum, value) => sum + value, 0) / rpes.length) * 10) / 10,
  }
}
