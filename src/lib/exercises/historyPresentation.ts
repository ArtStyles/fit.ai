import {
  toCompletedSessionPresentation,
  type CompletedSessionPresentation,
  type CompletedSessionWorkoutRelation,
} from '@/lib/session/historyRows'
import { parseSessionContextSnapshot } from '@/lib/session/contextSnapshot'
import { localizeExercise, type ExerciseLanguage } from './localization'

export type HistoricalExerciseRelation = {
  name: string
  name_es?: string | null
  muscle_groups?: string[] | null
  muscle_groups_es?: string[] | null
  is_compound?: boolean | null
}

export type HistoricalExercisePresentation = {
  exerciseId: string | null
  name: string
  muscleGroups: string[]
  isCompound: boolean
  source: 'snapshot' | 'live' | 'fallback'
}

export function resolveHistoricalExercisePresentation({
  exerciseId,
  sessionContextSnapshot,
  liveExercise,
  language,
  fallbackExerciseName,
}: {
  exerciseId: string | null
  sessionContextSnapshot: unknown
  liveExercise: HistoricalExerciseRelation | null
  language: ExerciseLanguage
  fallbackExerciseName: string
}): HistoricalExercisePresentation {
  const snapshot = parseSessionContextSnapshot(sessionContextSnapshot)
  const snapshotExercise = exerciseId
    ? snapshot?.exercises.find(exercise => exercise.exerciseId === exerciseId)
    : null

  if (snapshotExercise) {
    return {
      exerciseId,
      name: language === 'es'
        ? snapshotExercise.nameEs?.trim() || snapshotExercise.name
        : snapshotExercise.name,
      muscleGroups: language === 'es' && snapshotExercise.muscleGroupsEs.length > 0
        ? snapshotExercise.muscleGroupsEs
        : snapshotExercise.muscleGroups,
      isCompound: snapshotExercise.isCompound,
      source: 'snapshot',
    }
  }

  if (liveExercise?.name.trim()) {
    const localized = localizeExercise(liveExercise, language)
    return {
      exerciseId,
      name: localized.name,
      muscleGroups: localized.muscle_groups ?? [],
      isCompound: localized.is_compound === true,
      source: 'live',
    }
  }

  return {
    exerciseId,
    name: fallbackExerciseName,
    muscleGroups: [],
    isCompound: false,
    source: 'fallback',
  }
}

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
