/**
 * Utilidades de respaldo en localStorage para la sesión activa.
 *
 * Las claves v2 incluyen la cuenta propietaria. Las claves sin propietario se
 * leen exclusivamente durante una migración autorizada.
 * Propósito: recuperar el estado de la sesión si el usuario cierra la app
 *            a mitad del entrenamiento (crash recovery).
 */

import type { ExerciseSession, PreviousPerformanceData, SetData } from '@/store/sessionStore'
import {
  MAX_SESSION_AGE_MS,
  MAX_SESSION_DURATION_SECONDS,
  MAX_SESSION_FUTURE_SKEW_MS,
  MAX_SESSION_REPS,
  MAX_SESSION_REST_SECONDS,
  MAX_SESSION_RPE,
  MAX_SESSION_SETS,
  MAX_SESSION_WEIGHT_KG,
  MIN_SESSION_RPE,
} from './limits'

export interface SessionSnapshot {
  userId: string
  clientSessionId: string
  workoutId:   string
  workoutName: string
  startedAt:   number
  finishedAt?: number
  exercises:   ExerciseSession[]
}

export type RestorableSessionSnapshot = Omit<SessionSnapshot, 'clientSessionId'> & {
  clientSessionId?: string
}

export type PersistenceResult = { ok: true } | { ok: false; error: string }

const LEGACY_ACTIVE_SESSION_KEY = 'fitai_active_session'
export const ACTIVE_SESSION_CHANGED_EVENT = 'fitai:active-session-changed'

function dispatchActiveSessionChanged() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(ACTIVE_SESSION_CHANGED_EVENT))
  }
}

function legacyBackupKey(workoutId: string): string {
  return `fitai_session_${workoutId}`
}

function backupKey(userId: string, workoutId: string): string {
  return `fitai_session_v2_${encodeURIComponent(userId)}_${encodeURIComponent(workoutId)}`
}

function activeKey(userId: string): string {
  return `fitai_active_session_v2_${encodeURIComponent(userId)}`
}

function validOwner(userId: string): boolean {
  return userId.trim().length > 0
}

function activeSessionPointer(raw: string | null): { workoutId: string | null, stale: boolean } {
  if (!raw) return { workoutId: null, stale: false }
  try {
    const parsed: unknown = JSON.parse(raw)
    if (isRecord(parsed) && typeof parsed.workoutId === 'string' && parsed.workoutId) {
      return { workoutId: parsed.workoutId, stale: false }
    }
    return { workoutId: null, stale: true }
  } catch {
    return { workoutId: null, stale: true }
  }
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

function isNumberInRange(
  value: unknown,
  minimum: number,
  maximum: number,
  integer = false,
): value is number {
  return isFiniteNumber(value) && value >= minimum && value <= maximum &&
    (!integer || Number.isInteger(value))
}

function isNullableNumberInRange(
  value: unknown,
  minimum: number,
  maximum: number,
  integer = false,
): value is number | null {
  return value === null || isNumberInRange(value, minimum, maximum, integer)
}

function isNumericInputInRange(value: string, maximum: number, integer = false): boolean {
  if (value === '') return true
  if (value.trim() !== value || value.trim() === '') return false
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= maximum &&
    (!integer || Number.isInteger(parsed))
}

function normalizeStoredSet(value: unknown): SetData | null {
  if (!isRecord(value)) return null
  if (typeof value.weightKg !== 'string' ||
    typeof value.reps !== 'string' ||
    !isNullableNumberInRange(value.rpe, MIN_SESSION_RPE, MAX_SESSION_RPE, true) ||
    typeof value.completed !== 'boolean' ||
    !isNumericInputInRange(value.weightKg, MAX_SESSION_WEIGHT_KG) ||
    !isNumericInputInRange(value.reps, MAX_SESSION_REPS, true) ||
    (value.durationSeconds !== undefined &&
      !isNumberInRange(value.durationSeconds, 0, MAX_SESSION_DURATION_SECONDS, true))) {
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
      !isNullableNumberInRange(row.weightKg, 0, MAX_SESSION_WEIGHT_KG) ||
      !isNullableNumberInRange(row.reps, 0, MAX_SESSION_REPS, true) ||
      (row.durationSeconds !== undefined &&
        !isNullableNumberInRange(row.durationSeconds, 0, MAX_SESSION_DURATION_SECONDS, true))) {
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
    !Array.isArray(value.sets) || value.sets.length > MAX_SESSION_SETS) {
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

  if (value.targetSets !== undefined &&
    !isNumberInRange(value.targetSets, 0, MAX_SESSION_SETS, true)) return null
  if (value.targetReps !== undefined &&
    !isNullableNumberInRange(value.targetReps, 0, MAX_SESSION_REPS, true)) return null
  if (value.targetDuration !== undefined &&
    !isNullableNumberInRange(value.targetDuration, 0, MAX_SESSION_DURATION_SECONDS, true)) return null
  if (value.restSeconds !== undefined &&
    !isNumberInRange(value.restSeconds, 0, MAX_SESSION_REST_SECONDS, true)) return null
  if (value.targetRpe !== undefined &&
    !isNumberInRange(value.targetRpe, MIN_SESSION_RPE, MAX_SESSION_RPE, true)) return null
  if (value.suggestedWeight !== undefined &&
    !isNullableNumberInRange(value.suggestedWeight, 0, MAX_SESSION_WEIGHT_KG)) return null

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

function normalizeSessionSnapshot(
  value: unknown,
  workoutId: string,
  expectedUserId?: string,
): RestorableSessionSnapshot | null {
  const now = Date.now()
  if (!isRecord(value) ||
    value.workoutId !== workoutId ||
    (expectedUserId !== undefined && value.userId !== expectedUserId) ||
    (value.userId !== undefined && (typeof value.userId !== 'string' || !validOwner(value.userId))) ||
    (value.clientSessionId !== undefined && typeof value.clientSessionId !== 'string') ||
    typeof value.workoutName !== 'string' ||
    !isFiniteNumber(value.startedAt) ||
    value.startedAt > now + MAX_SESSION_FUTURE_SKEW_MS ||
    ((value.finishedAt === undefined || value.finishedAt === 0) &&
      value.startedAt < now - MAX_SESSION_AGE_MS) ||
    !Array.isArray(value.exercises) ||
    (value.finishedAt !== undefined && value.finishedAt !== 0 &&
      (!isFiniteNumber(value.finishedAt) || value.finishedAt < value.startedAt ||
        value.finishedAt > now + MAX_SESSION_FUTURE_SKEW_MS))) return null

  const exercises: ExerciseSession[] = []
  for (const storedExercise of value.exercises) {
    const normalizedExercise = normalizeStoredExercise(storedExercise)
    if (!normalizedExercise) return null
    exercises.push(normalizedExercise)
  }

  return {
    userId: typeof value.userId === 'string' ? value.userId : (expectedUserId ?? ''),
    ...(value.clientSessionId === undefined ? {} : { clientSessionId: value.clientSessionId }),
    workoutId,
    workoutName: value.workoutName,
    startedAt: value.startedAt,
    ...(value.finishedAt === undefined ? {} : { finishedAt: value.finishedAt }),
    exercises,
  }
}

export function saveBackup(snapshot: SessionSnapshot): PersistenceResult {
  if (!validOwner(snapshot.userId)) return { ok: false, error: 'Session owner is required' }
  try {
    localStorage.setItem(backupKey(snapshot.userId, snapshot.workoutId), JSON.stringify({ version: 2, ...snapshot }))
    localStorage.setItem(activeKey(snapshot.userId), JSON.stringify({ version: 2, userId: snapshot.userId, workoutId: snapshot.workoutId }))
    dispatchActiveSessionChanged()
    return { ok: true }
  } catch (error) {
    return { ok: false, error: persistenceError(error) }
  }
}

export function loadActiveSession(userId: string): RestorableSessionSnapshot | null {
  if (!validOwner(userId)) return null
  try {
    const raw = localStorage.getItem(activeKey(userId))
    if (!raw) return null
    const parsed: unknown = JSON.parse(raw)
    if (!isRecord(parsed) || parsed.version !== 2 || parsed.userId !== userId || typeof parsed.workoutId !== 'string' || !parsed.workoutId) return null
    return loadBackup(userId, parsed.workoutId)
  } catch {
    return null
  }
}

export function clearActiveSession(userId: string): PersistenceResult {
  if (!validOwner(userId)) return { ok: false, error: 'Session owner is required' }
  try {
    const key = activeKey(userId)
    const pointer = activeSessionPointer(localStorage.getItem(key))
    if (pointer.workoutId) {
      localStorage.removeItem(backupKey(userId, pointer.workoutId))
    }
    localStorage.removeItem(key)
    dispatchActiveSessionChanged()
    return { ok: true }
  } catch (error) {
    return { ok: false, error: persistenceError(error) }
  }
}

export function loadBackup(userId: string, workoutId: string): RestorableSessionSnapshot | null {
  if (!validOwner(userId)) return null
  try {
    const raw = localStorage.getItem(backupKey(userId, workoutId))
    if (!raw) return null
    const parsed: unknown = JSON.parse(raw)
    if (!isRecord(parsed) || parsed.version !== 2) return null
    return normalizeSessionSnapshot(parsed, workoutId, userId)
  } catch {
    return null
  }
}

export function clearBackup(userId: string, workoutId: string): PersistenceResult {
  if (!validOwner(userId)) return { ok: false, error: 'Session owner is required' }
  try {
    localStorage.removeItem(backupKey(userId, workoutId))
    const key = activeKey(userId)
    const pointer = activeSessionPointer(localStorage.getItem(key))
    if (pointer.workoutId === workoutId || pointer.stale) {
      localStorage.removeItem(key)
      dispatchActiveSessionChanged()
    }
    return { ok: true }
  } catch (error) {
    return { ok: false, error: persistenceError(error) }
  }
}

export async function recoverSessionBackup(
  userId: string,
  workoutId: string | null,
  verifyOwner: (workoutId: string) => Promise<string | null>,
): Promise<RestorableSessionSnapshot | null> {
  if (!validOwner(userId)) return null

  const scoped = workoutId ? loadBackup(userId, workoutId) : loadActiveSession(userId)
  if (scoped) return scoped

  try {
    const scopedPointerKey = activeKey(userId)
    const capturedScopedPointer = localStorage.getItem(scopedPointerKey)
    const capturedPointer = localStorage.getItem(LEGACY_ACTIVE_SESSION_KEY)
    const legacyWorkoutId = workoutId ?? activeSessionPointer(capturedPointer).workoutId
    if (!legacyWorkoutId) return null
    const legacyKey = legacyBackupKey(legacyWorkoutId)
    const capturedBackup = localStorage.getItem(legacyKey)
    if (!capturedBackup) return null

    let parsed: unknown
    try { parsed = JSON.parse(capturedBackup) } catch { return null }
    const candidate = normalizeSessionSnapshot(parsed, legacyWorkoutId)
    if (!candidate) return null

    let owner: string | null
    try {
      owner = await verifyOwner(legacyWorkoutId)
    } catch {
      throw new Error('Session ownership verification unavailable')
    }
    if (owner === null) throw new Error('Session ownership verification unavailable')
    if (owner !== userId) return null

    const newer = loadBackup(userId, legacyWorkoutId)
    if (newer) return newer
    if (localStorage.getItem(legacyKey) !== capturedBackup) {
      throw new Error('Legacy session changed during ownership verification')
    }
    const scopedPointerChanged = localStorage.getItem(scopedPointerKey) !== capturedScopedPointer
    if (scopedPointerChanged && workoutId === null) {
      const newActive = loadActiveSession(userId)
      if (newActive) return newActive
    }
    const migrated: RestorableSessionSnapshot = { ...candidate, userId }
    try {
      localStorage.setItem(backupKey(userId, legacyWorkoutId), JSON.stringify({ version: 2, ...migrated }))
      if (!scopedPointerChanged) {
        localStorage.setItem(scopedPointerKey, JSON.stringify({ version: 2, userId, workoutId: legacyWorkoutId }))
      }
    } catch (error) {
      throw new Error(persistenceError(error))
    }

    if (localStorage.getItem(legacyKey) === capturedBackup) localStorage.removeItem(legacyKey)
    if (activeSessionPointer(capturedPointer).workoutId === legacyWorkoutId &&
      capturedPointer !== null && localStorage.getItem(LEGACY_ACTIVE_SESSION_KEY) === capturedPointer) {
      localStorage.removeItem(LEGACY_ACTIVE_SESSION_KEY)
    }
    dispatchActiveSessionChanged()
    return migrated
  } catch (error) {
    if (error instanceof Error && error.message !== 'Local storage unavailable') throw error
    return null
  }
}
