import {
  parseSessionContextSnapshot,
  resolveSessionContext,
  type ResolvedSessionContext,
} from './contextSnapshot'

export type CompletedSessionWorkoutRelation = {
  name: string
  focus: string | null
}

export interface CompletedSessionSourceRow {
  id: string
  workout_id: string | null
  completed_at: string
  duration_minutes: number | null
  session_context_snapshot: unknown
  workout: CompletedSessionWorkoutRelation | CompletedSessionWorkoutRelation[] | null
}

export type CompletedSessionPresentation = ResolvedSessionContext & {
  id: string
  workoutId: string | null
  completedAt: string
  durationMinutes: number
}

function normalizeWorkoutRelation(
  value: CompletedSessionSourceRow['workout'],
): CompletedSessionWorkoutRelation | null {
  const workout = Array.isArray(value) ? value[0] ?? null : value
  if (!workout || typeof workout.name !== 'string' || workout.name.trim() === '') return null
  if (workout.focus !== null && typeof workout.focus !== 'string') return null
  return workout
}

export function toCompletedSessionPresentation(
  row: CompletedSessionSourceRow,
  fallbackWorkoutName: string,
): CompletedSessionPresentation {
  const context = resolveSessionContext({
    snapshot: parseSessionContextSnapshot(row.session_context_snapshot),
    workout: normalizeWorkoutRelation(row.workout),
    fallbackWorkoutName,
  })

  return {
    id: row.id,
    workoutId: row.workout_id,
    completedAt: row.completed_at,
    durationMinutes: Number(row.duration_minutes) || 0,
    ...context,
  }
}
