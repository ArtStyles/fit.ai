import { summarizeExercisePerformance, type EvidenceSet } from '@/lib/training-evidence/performance'
import { MAX_SESSION_DURATION_SECONDS, MAX_SESSION_SETS } from '@/lib/session/limits'

export type SessionExerciseInput = {
  id: string
  exerciseId: string
  exerciseName: string
  muscleGroups: string[]
  setsCompleted: number | null
  weightsKg: number[] | null
  repsCompleted: number[] | null
  rpeValues: (number | null)[] | null
  durationSeconds?: number[] | null
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
  sets: Array<EvidenceSet & { durationSeconds?: number }>
  timed: boolean
  totalDurationSeconds: number | null
  completedSets: number
  volumeKg: number
  bestSet: EvidenceSet | null
  averageRpe: number | null
  comparison: { weightDeltaKg: number; repsDelta: number } | null
  isRecord: boolean
}

/** Read exact recorded series only; an aggregate duration cannot establish each set. */
export function readFreeTrainingDurations(source: unknown, exerciseId: string, setsCompleted: number | null): number[] | null {
  if (!source || typeof source !== 'object' || !('mobile_session_kind' in source) || source.mobile_session_kind !== 'free' || !('mobile_free_training' in source)) return null
  const metadata = source.mobile_free_training
  if (!metadata || typeof metadata !== 'object' || !('exercises' in metadata) || !Array.isArray(metadata.exercises)) return null
  const exercise = metadata.exercises.find((row: unknown) => row && typeof row === 'object' && 'exerciseId' in row && row.exerciseId === exerciseId)
  if (!exercise || !Array.isArray(exercise.sets) || exercise.sets.length !== setsCompleted || exercise.sets.length < 1 || exercise.sets.length > MAX_SESSION_SETS) return null
  const durations: number[] = []
  for (const set of exercise.sets) {
    if (!set || typeof set !== 'object' || set.weightKg !== 0 || set.reps !== 0 || !Number.isInteger(set.durationSeconds) || set.durationSeconds < 1 || set.durationSeconds > MAX_SESSION_DURATION_SECONDS) return null
    durations.push(set.durationSeconds)
  }
  return durations
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
    const durations = exercise.durationSeconds
    const timed = Boolean(durations?.length && durations.length === performance.sets.length && durations.every(value => Number.isInteger(value) && value > 0 && value <= MAX_SESSION_DURATION_SECONDS))
    const previous = previousByExercise.get(exercise.exerciseId)
    const previousPerformance = previous
      ? summarizeExercisePerformance(previous.weightsKg, previous.repsCompleted, previous.rpeValues)
      : null
    const comparison = !timed && performance.bestSet && previousPerformance?.bestSet
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
      sets: timed ? performance.sets.map((set, index) => ({ ...set, durationSeconds: durations![index] })) : performance.sets,
      timed,
      totalDurationSeconds: timed ? durations!.reduce((sum, value) => sum + value, 0) : null,
      completedSets: exercise.setsCompleted ?? performance.completedSets,
      volumeKg: performance.volumeKg,
      bestSet: timed ? null : performance.bestSet,
      averageRpe: performance.averageRpe,
      comparison,
      isRecord: Boolean(!timed && performance.bestSet && priorBest && betterThan(performance.bestSet, priorBest)),
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
