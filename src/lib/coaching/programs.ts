export type TrainerProgramSnapshotV1 = {
  schemaVersion: 1
  name: string
  goal: string | null
  description: string | null
  daysPerWeek: number
  workouts: Array<{
    sourceTemplateWorkoutId: string
    name: string
    dayOfWeek: number
    orderInPlan: number
    exercises: Array<{
      sourceTemplateExerciseId: string
      exerciseId: string
      orderIndex: number
      sets: number
      reps: number
      weightKg: number | null
      targetRpe: number | null
      restSeconds: number
      notes: string | null
    }>
  }>
}

export type TrainerProgramSnapshotInput = Omit<TrainerProgramSnapshotV1, 'schemaVersion'> & {
  allowedExerciseIds: Iterable<string>
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const INVALID = 'TRAINER_PROGRAM_SNAPSHOT_INVALID'

function invalid(): never {
  throw new Error(INVALID)
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value)
  return actual.length === keys.length && actual.every(key => keys.includes(key))
}

function requiredString(value: unknown, maximum: number): string {
  if (typeof value !== 'string') invalid()
  const normalized = value.trim()
  if (!normalized || normalized.length > maximum) invalid()
  return normalized
}

function nullableString(value: unknown, maximum: number): string | null {
  if (value === null) return null
  if (typeof value !== 'string') invalid()
  const normalized = value.trim()
  if (!normalized) return null
  if (normalized.length > maximum) invalid()
  return normalized
}

function uuid(value: unknown): string {
  if (typeof value !== 'string' || !UUID.test(value)) invalid()
  return value.toLowerCase()
}

function integer(value: unknown, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || !Number.isInteger(value) || value < min || value > max) invalid()
  return value
}

function finiteNullable(value: unknown, min: number, max: number): number | null {
  if (value === null) return null
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) invalid()
  return value
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value)
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child)
  }
  return value
}

function normalizeWorkouts(
  rawWorkouts: unknown,
  allowedExerciseIds: ReadonlySet<string>,
): TrainerProgramSnapshotV1['workouts'] {
  if (!Array.isArray(rawWorkouts) || rawWorkouts.length < 1 || rawWorkouts.length > 7) invalid()
  const dayOfWeek = new Set<number>()
  const sourceWorkoutIds = new Set<string>()

  const workouts = rawWorkouts.map(rawWorkout => {
    if (!isPlainObject(rawWorkout) || !hasExactKeys(rawWorkout, [
      'sourceTemplateWorkoutId', 'name', 'dayOfWeek', 'orderInPlan', 'exercises',
    ])) invalid()
    const workoutDay = integer(rawWorkout.dayOfWeek, 1, 7)
    const sourceTemplateWorkoutId = uuid(rawWorkout.sourceTemplateWorkoutId)
    if (dayOfWeek.has(workoutDay) || sourceWorkoutIds.has(sourceTemplateWorkoutId)) invalid()
    dayOfWeek.add(workoutDay)
    sourceWorkoutIds.add(sourceTemplateWorkoutId)
    if (!Array.isArray(rawWorkout.exercises) || rawWorkout.exercises.length < 1 || rawWorkout.exercises.length > 30) invalid()
    const sourceExerciseIds = new Set<string>()
    const exercises = rawWorkout.exercises.map(rawExercise => {
      if (!isPlainObject(rawExercise) || !hasExactKeys(rawExercise, [
        'sourceTemplateExerciseId', 'exerciseId', 'orderIndex', 'sets', 'reps',
        'weightKg', 'targetRpe', 'restSeconds', 'notes',
      ])) invalid()
      const sourceTemplateExerciseId = uuid(rawExercise.sourceTemplateExerciseId)
      const exerciseId = uuid(rawExercise.exerciseId)
      if (!allowedExerciseIds.has(exerciseId) || sourceExerciseIds.has(sourceTemplateExerciseId)) invalid()
      sourceExerciseIds.add(sourceTemplateExerciseId)
      return {
        sourceTemplateExerciseId,
        exerciseId,
        orderIndex: integer(rawExercise.orderIndex, 1, 30),
        sets: integer(rawExercise.sets, 1, 20),
        reps: integer(rawExercise.reps, 1, 100),
        weightKg: finiteNullable(rawExercise.weightKg, 0, 1000),
        targetRpe: finiteNullable(rawExercise.targetRpe, 1, 10),
        restSeconds: integer(rawExercise.restSeconds, 0, 3600),
        notes: nullableString(rawExercise.notes, 1000),
      }
    })
    const orderIndexes = new Set(exercises.map(exercise => exercise.orderIndex))
    if (orderIndexes.size !== exercises.length) invalid()
    exercises.sort((left, right) => left.orderIndex - right.orderIndex || left.sourceTemplateExerciseId.localeCompare(right.sourceTemplateExerciseId))
    return {
      sourceTemplateWorkoutId,
      name: requiredString(rawWorkout.name, 120),
      dayOfWeek: workoutDay,
      orderInPlan: integer(rawWorkout.orderInPlan, 1, 7),
      exercises,
    }
  })
  const orderInPlan = new Set(workouts.map(workout => workout.orderInPlan))
  if (orderInPlan.size !== workouts.length) invalid()
  workouts.sort((left, right) => left.dayOfWeek - right.dayOfWeek || left.orderInPlan - right.orderInPlan || left.sourceTemplateWorkoutId.localeCompare(right.sourceTemplateWorkoutId))
  return workouts
}

export function buildTrainerProgramSnapshot(input: TrainerProgramSnapshotInput): TrainerProgramSnapshotV1 {
  if (!isPlainObject(input) || !hasExactKeys(input, [
    'name', 'goal', 'description', 'daysPerWeek', 'workouts', 'allowedExerciseIds',
  ])) invalid()
  if (input.allowedExerciseIds === null || typeof input.allowedExerciseIds !== 'object' ||
    !(Symbol.iterator in input.allowedExerciseIds)) invalid()
  const allowedExerciseIds = new Set(Array.from(input.allowedExerciseIds, item => uuid(item)))
  if (allowedExerciseIds.size === 0) invalid()
  const daysPerWeek = integer(input.daysPerWeek, 1, 7)
  const workouts = normalizeWorkouts(input.workouts, allowedExerciseIds)
  if (workouts.length !== daysPerWeek) invalid()
  return deepFreeze({
    schemaVersion: 1,
    name: requiredString(input.name, 120),
    goal: nullableString(input.goal, 240),
    description: nullableString(input.description, 2000),
    daysPerWeek,
    workouts,
  })
}

export function parseTrainerProgramSnapshot(value: unknown): TrainerProgramSnapshotV1 {
  if (!isPlainObject(value) || value.schemaVersion !== 1 || !hasExactKeys(value, [
    'schemaVersion', 'name', 'goal', 'description', 'daysPerWeek', 'workouts',
  ])) invalid()
  const allowedExerciseIds = new Set<string>()
  if (!Array.isArray(value.workouts)) invalid()
  for (const workout of value.workouts) {
    if (!isPlainObject(workout) || !Array.isArray(workout.exercises)) invalid()
    for (const exercise of workout.exercises) {
      if (!isPlainObject(exercise)) invalid()
      allowedExerciseIds.add(uuid(exercise.exerciseId))
    }
  }
  return buildTrainerProgramSnapshot({
    name: value.name as string,
    goal: value.goal as string | null,
    description: value.description as string | null,
    daysPerWeek: value.daysPerWeek as number,
    workouts: value.workouts as TrainerProgramSnapshotV1['workouts'],
    allowedExerciseIds,
  })
}
