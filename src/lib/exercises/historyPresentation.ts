import {
  toCompletedSessionPresentation,
  type CompletedSessionPresentation,
  type CompletedSessionWorkoutRelation,
} from '@/lib/session/historyRows'

export type ExerciseHistoryProgressLog = {
  id: string
  workout_id: string | null
  completed_at: string
  duration_minutes: number | null
  mood_rating: number | null
  session_context_snapshot: unknown
}

export function toExerciseHistoryPresentation(
  progressLog: ExerciseHistoryProgressLog,
  workoutsById: Record<string, CompletedSessionWorkoutRelation>,
  fallbackWorkoutName: string,
): CompletedSessionPresentation {
  return toCompletedSessionPresentation({
    ...progressLog,
    workout: progressLog.workout_id ? workoutsById[progressLog.workout_id] ?? null : null,
  }, fallbackWorkoutName)
}
