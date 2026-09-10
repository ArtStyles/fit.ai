import { resolveHistoricalExercisePresentation, type HistoricalExerciseRelation } from '@/lib/exercises/historyPresentation'
import { getLocalDateString } from '@/lib/workouts/schedule'
import { parseSessionContextSnapshot } from '@/lib/session/contextSnapshot'
import type { MuscleActivityInput } from './activity'

type MuscleExerciseLog = {
  id?: string
  progress_log_id: string
  exercise_id: string | null
  sets_completed: number | null
  exercise: HistoricalExerciseRelation | HistoricalExerciseRelation[] | null
}
type MuscleSessionLog = { id: string; completed_at: string; session_context_snapshot: unknown }

/** Completed counts include timed and bodyweight work independently of measured load. */
export function buildHistoricalMuscleActivity(
  rows: MuscleExerciseLog[], logs: MuscleSessionLog[], timeZone: string, language: 'es' | 'en',
): MuscleActivityInput[] {
  const byId = new Map(logs.map(log => [log.id, log]))
  return rows.flatMap(row => {
    const log = byId.get(row.progress_log_id)
    const sets = row.sets_completed
    if (!log || sets === null || !Number.isFinite(sets) || sets <= 0) return []
    const completedAt = new Date(log.completed_at)
    if (!Number.isFinite(completedAt.getTime())) return []
    const exercise = resolveHistoricalExercisePresentation({
      exerciseId: row.exercise_id,
      sessionContextSnapshot: log.session_context_snapshot,
      liveExercise: Array.isArray(row.exercise) ? row.exercise[0] ?? null : row.exercise,
      language,
      fallbackExerciseName: language === 'es' ? 'Ejercicio' : 'Exercise',
    })
    return [{
      muscleGroups: exercise.muscleGroups, sets, date: getLocalDateString(completedAt, timeZone),
      ...(row.id ? { exerciseLogId: row.id } : {}),
      exerciseId: row.exercise_id, exerciseName: exercise.name,
      sessionId: log.id,
      sessionName: parseSessionContextSnapshot(log.session_context_snapshot)?.workout.name ?? (language === 'es' ? 'Entrenamiento' : 'Workout'),
      completedAt: log.completed_at,
    }]
  })
}
