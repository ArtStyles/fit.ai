/**
 * Utilidades de respaldo en localStorage para la sesión activa.
 *
 * Clave: fitai_session_<workoutId>
 * Propósito: recuperar el estado de la sesión si el usuario cierra la app
 *            a mitad del entrenamiento (crash recovery).
 */

import type { ExerciseSession, PreviousPerformanceData, SetData } from '@/store/sessionStore'

export interface SessionSnapshot {
  clientSessionId: string
  workoutId:   string
  workoutName: string
  startedAt:   number
  exercises:   ExerciseSession[]
}

export type RestorableSessionSnapshot = Omit<SessionSnapshot, 'clientSessionId'> & {
  clientSessionId?: string
}

export type PersistenceResult = { ok: true } | { ok: false; error: string }

function backupKey(workoutId: string): string {
  return `fitai_session_${workoutId}`
}

function persistenceError(error: unknown): string {
  return error instanceof Error ? error.message : 'Local storage unavailable'
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === 'string'
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function isNullableFiniteNumber(value: unknown): value is number | null {
  return value === null || isFiniteNumber(value)
}

function normalizeStoredSet(value: unknown): SetData | null {
  if (!isRecord(value)) return null
  if (typeof value.weightKg !== 'string' ||
    typeof value.reps !== 'string' ||
    !isNullableFiniteNumber(value.rpe) ||
    typeof value.completed !== 'boolean' ||
    (value.durationSeconds !== undefined && !isFiniteNumber(value.durationSeconds))) {
    return null
  }

  return {
    weightKg: value.weightKg,
    reps: value.reps,
    rpe: value.rpe,
    completed: value.completed,
    ...(value.durationSeconds === undefined ? {} : { durationSeconds: value.durationSeconds }),
  }
}

function normalizePreviousPerformance(value: unknown): PreviousPerformanceData[] | null | false {
  if (value === undefined || value === null) return null
  if (!Array.isArray(value)) return false

  const normalized: PreviousPerformanceData[] = []
  for (const row of value) {
    if (!isRecord(row) ||
      !isNullableFiniteNumber(row.weightKg) ||
      !isNullableFiniteNumber(row.reps) ||
      (row.durationSeconds !== undefined && !isNullableFiniteNumber(row.durationSeconds))) {
      return false
    }
    normalized.push({
      weightKg: row.weightKg,
      reps: row.reps,
      ...(row.durationSeconds === undefined ? {} : { durationSeconds: row.durationSeconds }),
    })
  }
  return normalized
}

function normalizeStoredExercise(value: unknown): ExerciseSession | null {
  if (!isRecord(value) ||
    typeof value.workoutExerciseId !== 'string' || value.workoutExerciseId.length === 0 ||
    typeof value.exerciseId !== 'string' || value.exerciseId.length === 0 ||
    typeof value.name !== 'string' || value.name.length === 0 ||
    (value.status !== 'pending' && value.status !== 'active' &&
      value.status !== 'completed' && value.status !== 'skipped') ||
    !Array.isArray(value.sets)) {
    return null
  }

  const sets: SetData[] = []
  for (const storedSet of value.sets) {
    const normalizedSet = normalizeStoredSet(storedSet)
    if (!normalizedSet) return null
    sets.push(normalizedSet)
  }

  const nullableStringFields = [
    'originalExerciseId', 'originalName', 'imageUrl', 'instructions', 'notes', 'skipReason',
  ] as const
  if (nullableStringFields.some(field =>
    value[field] !== undefined && !isNullableString(value[field]))) return null

  if (value.muscleGroups !== undefined &&
    (!Array.isArray(value.muscleGroups) || !value.muscleGroups.every(group => typeof group === 'string'))) {
    return null
  }

  const nullableNumberFields = ['targetReps', 'targetDuration', 'suggestedWeight'] as const
  if (nullableNumberFields.some(field =>
    value[field] !== undefined && !isNullableFiniteNumber(value[field]))) return null

  const numberFields = ['targetSets', 'restSeconds', 'targetRpe'] as const
  if (numberFields.some(field => value[field] !== undefined && !isFiniteNumber(value[field]))) return null

  if (value.isCompound !== undefined && typeof value.isCompound !== 'boolean') return null
  if (value.expanded !== undefined && typeof value.expanded !== 'boolean') return null
  if (value.hasLastSessionData !== undefined && typeof value.hasLastSessionData !== 'boolean') return null

  if (value.weightSuggestionBasis !== undefined && value.weightSuggestionBasis !== null &&
    value.weightSuggestionBasis !== 'user_baseline_pending' &&
    value.weightSuggestionBasis !== 'estimated_from_profile' &&
    value.weightSuggestionBasis !== 'based_on_previous_logs') return null

  if (value.source !== undefined && value.source !== 'planned' &&
    value.source !== 'replacement' && value.source !== 'ad_hoc') return null

  const previousPerformance = normalizePreviousPerformance(value.previousPerformance)
  if (previousPerformance === false) return null

  return {
    workoutExerciseId: value.workoutExerciseId,
    exerciseId: value.exerciseId,
    originalExerciseId: (value.originalExerciseId as string | null | undefined) ?? null,
    originalName: (value.originalName as string | null | undefined) ?? null,
    name: value.name,
    imageUrl: (value.imageUrl as string | null | undefined) ?? null,
    instructions: (value.instructions as string | null | undefined) ?? null,
    muscleGroups: value.muscleGroups === undefined ? [] : [...value.muscleGroups],
    isCompound: value.isCompound ?? false,
    targetSets: (value.targetSets as number | undefined) ?? sets.length,
    targetReps: (value.targetReps as number | null | undefined) ?? null,
    targetDuration: (value.targetDuration as number | null | undefined) ?? null,
    restSeconds: (value.restSeconds as number | undefined) ?? 60,
    targetRpe: (value.targetRpe as number | undefined) ?? 7,
    suggestedWeight: (value.suggestedWeight as number | null | undefined) ?? null,
    weightSuggestionBasis: (value.weightSuggestionBasis as ExerciseSession['weightSuggestionBasis'] | undefined) ?? null,
    notes: (value.notes as string | null | undefined) ?? null,
    source: (value.source as ExerciseSession['source'] | undefined) ?? 'planned',
    skipReason: (value.skipReason as string | null | undefined) ?? null,
    sets,
    status: value.status,
    expanded: value.expanded ?? value.status === 'active',
    hasLastSessionData: value.hasLastSessionData ?? false,
    previousPerformance,
  }
}

function normalizeSessionSnapshot(value: unknown, workoutId: string): RestorableSessionSnapshot | null {
  if (!isRecord(value) ||
    value.workoutId !== workoutId ||
    (value.clientSessionId !== undefined && typeof value.clientSessionId !== 'string') ||
    typeof value.workoutName !== 'string' ||
    !isFiniteNumber(value.startedAt) ||
    !Array.isArray(value.exercises)) return null

  const exercises: ExerciseSession[] = []
  for (const storedExercise of value.exercises) {
    const normalizedExercise = normalizeStoredExercise(storedExercise)
    if (!normalizedExercise) return null
    exercises.push(normalizedExercise)
  }

  return {
    ...(value.clientSessionId === undefined ? {} : { clientSessionId: value.clientSessionId }),
    workoutId,
    workoutName: value.workoutName,
    startedAt: value.startedAt,
    exercises,
  }
}

export function saveBackup(snapshot: SessionSnapshot): PersistenceResult {
  try {
    localStorage.setItem(backupKey(snapshot.workoutId), JSON.stringify(snapshot))
    return { ok: true }
  } catch (error) {
    return { ok: false, error: persistenceError(error) }
  }
}

export function loadBackup(workoutId: string): RestorableSessionSnapshot | null {
  try {
    const raw = localStorage.getItem(backupKey(workoutId))
    if (!raw) return null
    const parsed: unknown = JSON.parse(raw)
    return normalizeSessionSnapshot(parsed, workoutId)
  } catch {
    return null
  }
}

export function clearBackup(workoutId: string): PersistenceResult {
  try {
    localStorage.removeItem(backupKey(workoutId))
    return { ok: true }
  } catch (error) {
    return { ok: false, error: persistenceError(error) }
  }
}
