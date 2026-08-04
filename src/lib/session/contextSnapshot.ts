export interface SessionContextSnapshotV1 {
  version: 1
  workout: {
    id: string
    name: string
    focus: string | null
    dayOfWeek: number | null
  }
  plan: {
    id: string
    familyId: string
    name: string
    weekNumber: number | null
  } | null
  exercises: Array<{
    exerciseId: string
    name: string
    nameEs: string | null
    muscleGroups: string[]
    muscleGroupsEs: string[]
    isCompound: boolean
  }>
}

export type ResolvedSessionContext = {
  workoutName: string
  focus: string | null
  source: 'snapshot' | 'workout' | 'fallback'
}

type WorkoutRelation = {
  name: string
  focus: string | null
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function hasExactKeys(value: Record<string, unknown>, keys: string[]): boolean {
  const actualKeys = Object.keys(value)
  return actualKeys.length === keys.length && actualKeys.every(key => keys.includes(key))
}

function isUuid(value: unknown): value is string {
  return typeof value === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

function isNonBlankString(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== ''
}

function isNullableString(value: unknown): value is string | null {
  return value === null || isNonBlankString(value)
}

function isNullableDayOfWeek(value: unknown): value is number | null {
  return value === null || (typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 7)
}

function isNullableWeekNumber(value: unknown): value is number | null {
  return value === null || (typeof value === 'number' && Number.isInteger(value) && value >= 1)
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(isNonBlankString)
}

function isWorkout(value: unknown): value is SessionContextSnapshotV1['workout'] {
  return isObject(value) &&
    hasExactKeys(value, ['id', 'name', 'focus', 'dayOfWeek']) &&
    isUuid(value.id) &&
    isNonBlankString(value.name) &&
    isNullableString(value.focus) &&
    isNullableDayOfWeek(value.dayOfWeek)
}

function isPlan(value: unknown): value is NonNullable<SessionContextSnapshotV1['plan']> {
  return isObject(value) &&
    hasExactKeys(value, ['id', 'familyId', 'name', 'weekNumber']) &&
    isUuid(value.id) &&
    isUuid(value.familyId) &&
    isNonBlankString(value.name) &&
    isNullableWeekNumber(value.weekNumber)
}

function isExercise(value: unknown): value is SessionContextSnapshotV1['exercises'][number] {
  return isObject(value) &&
    hasExactKeys(value, ['exerciseId', 'name', 'nameEs', 'muscleGroups', 'muscleGroupsEs', 'isCompound']) &&
    isUuid(value.exerciseId) &&
    isNonBlankString(value.name) &&
    isNullableString(value.nameEs) &&
    isStringArray(value.muscleGroups) &&
    isStringArray(value.muscleGroupsEs) &&
    typeof value.isCompound === 'boolean'
}

export function parseSessionContextSnapshot(value: unknown): SessionContextSnapshotV1 | null {
  if (!isObject(value) || !hasExactKeys(value, ['version', 'workout', 'plan', 'exercises'])) return null
  if (value.version !== 1 || !isWorkout(value.workout)) return null
  if (value.plan !== null && !isPlan(value.plan)) return null
  if (!Array.isArray(value.exercises) || !value.exercises.every(isExercise)) return null

  return value as unknown as SessionContextSnapshotV1
}

export function resolveSessionContext({
  snapshot,
  workout,
  fallbackWorkoutName,
}: {
  snapshot: SessionContextSnapshotV1 | null
  workout: WorkoutRelation | null
  fallbackWorkoutName: string
}): ResolvedSessionContext {
  if (snapshot) {
    return {
      workoutName: snapshot.workout.name,
      focus: snapshot.workout.focus,
      source: 'snapshot',
    }
  }

  if (workout) {
    return {
      workoutName: workout.name,
      focus: workout.focus,
      source: 'workout',
    }
  }

  return { workoutName: fallbackWorkoutName, focus: null, source: 'fallback' }
}
