import { percentChange, summarizeExercisePerformance, type EvidenceSet } from '@/lib/training-evidence/performance'
import { findPreviousComparableSession, groupEvidenceSessions } from '@/lib/training-evidence/timeline'

export type HistorySessionInput = {
  id: string
  workoutId: string | null
  date: string
  completedAt: string
  workoutName: string
  focus: string | null
  durationMinutes: number
}

export type HistoryExerciseInput = {
  progressLogId: string
  exerciseId: string | null
  exerciseName?: string | null
  weightsKg: number[] | null
  repsCompleted: number[] | null
  rpeValues: (number | null)[] | null
  setsCompleted: number | null
  notes?: string | null
}

export type HistorySignal =
  | { kind: 'record'; count: number }
  | { kind: 'volume'; changePercent: number }
  | { kind: 'rpe'; value: number }
  | null

export type HistoryEvidenceRow = {
  id: string
  workoutId: string | null
  date: string
  completedAt: string
  workoutName: string
  focus: string | null
  durationMinutes: number
  sets: number
  volumeKg: number
  signal: HistorySignal
  searchText: string
}

function normalize(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
}

function isBetterSet(candidate: EvidenceSet, previous: EvidenceSet): boolean {
  return candidate.weightKg > previous.weightKg ||
    (candidate.weightKg === previous.weightKg && candidate.reps > previous.reps)
}

export function buildHistoryEvidence({
  todayStr,
  sessions,
  exercises,
}: {
  todayStr: string
  sessions: HistorySessionInput[]
  exercises: HistoryExerciseInput[]
}) {
  const sessionById = new Map(sessions.map(session => [session.id, session]))
  const exercisesBySession = new Map<string, HistoryExerciseInput[]>()
  for (const exercise of exercises) {
    exercisesBySession.set(exercise.progressLogId, [
      ...(exercisesBySession.get(exercise.progressLogId) ?? []),
      exercise,
    ])
  }

  const baseRows = sessions.map(session => {
    const sessionExercises = exercisesBySession.get(session.id) ?? []
    const performances = sessionExercises.map(exercise => ({
      exercise,
      performance: summarizeExercisePerformance(exercise.weightsKg, exercise.repsCompleted, exercise.rpeValues),
    }))
    const sets = performances.reduce(
      (sum, item) => sum + (item.exercise.setsCompleted ?? item.performance.completedSets),
      0,
    )
    const volumeKg = performances.reduce((sum, item) => sum + item.performance.volumeKg, 0)

    return {
      ...session,
      sets,
      volumeKg,
      signal: null as HistorySignal,
      searchText: normalize([
        session.workoutName,
        session.focus ?? '',
        ...sessionExercises.flatMap(exercise => [exercise.exerciseName ?? '', exercise.notes ?? '']),
        session.date,
        `${session.durationMinutes} min`,
        `${volumeKg} kg`,
      ].join(' ')),
    }
  })

  const rows = baseRows.map(row => {
    const currentExercises = exercisesBySession.get(row.id) ?? []
    const recordExerciseIds = new Set<string>()

    for (const currentExercise of currentExercises) {
      if (!currentExercise.exerciseId || recordExerciseIds.has(currentExercise.exerciseId)) continue
      const currentBest = summarizeExercisePerformance(
        currentExercise.weightsKg,
        currentExercise.repsCompleted,
        currentExercise.rpeValues,
      ).bestSet
      if (!currentBest) continue

      const olderBest = exercises
        .filter(candidate => {
          if (candidate.exerciseId !== currentExercise.exerciseId) return false
          const candidateSession = sessionById.get(candidate.progressLogId)
          return candidateSession ? candidateSession.completedAt < row.completedAt : false
        })
        .flatMap(candidate => {
          const bestSet = summarizeExercisePerformance(candidate.weightsKg, candidate.repsCompleted, candidate.rpeValues).bestSet
          return bestSet ? [bestSet] : []
        })
        .sort((a, b) => b.weightKg - a.weightKg || b.reps - a.reps)[0]

      if (olderBest && isBetterSet(currentBest, olderBest)) recordExerciseIds.add(currentExercise.exerciseId)
    }

    if (recordExerciseIds.size > 0) {
      return { ...row, signal: { kind: 'record' as const, count: recordExerciseIds.size } }
    }

    const previous = findPreviousComparableSession(baseRows, row)
    const volumeDelta = previous ? percentChange(row.volumeKg, previous.volumeKg) : null
    if (volumeDelta !== null) {
      return { ...row, signal: { kind: 'volume' as const, changePercent: volumeDelta } }
    }

    const recordedRpes = currentExercises.flatMap(exercise =>
      (exercise.rpeValues ?? []).flatMap(value => typeof value === 'number' ? [value] : []),
    )
    if (recordedRpes.length > 0) {
      const average = Math.round((recordedRpes.reduce((sum, value) => sum + value, 0) / recordedRpes.length) * 10) / 10
      return { ...row, signal: { kind: 'rpe' as const, value: average } }
    }

    return row
  }).sort((a, b) => b.completedAt.localeCompare(a.completedAt))

  return {
    rows,
    groups: groupEvidenceSessions(rows, todayStr),
  }
}
