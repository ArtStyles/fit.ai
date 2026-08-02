/**
 * Utilidades de respaldo en localStorage para la sesión activa.
 *
 * Clave: fitai_session_<workoutId>
 * Propósito: recuperar el estado de la sesión si el usuario cierra la app
 *            a mitad del entrenamiento (crash recovery).
 */

import type { ExerciseSession } from '@/store/sessionStore'

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

function isSessionSnapshot(value: unknown, workoutId: string): value is RestorableSessionSnapshot {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  const snapshot = value as Partial<RestorableSessionSnapshot>

  return snapshot.workoutId === workoutId &&
    (snapshot.clientSessionId === undefined || typeof snapshot.clientSessionId === 'string') &&
    typeof snapshot.workoutName === 'string' &&
    typeof snapshot.startedAt === 'number' &&
    Number.isFinite(snapshot.startedAt) &&
    Array.isArray(snapshot.exercises)
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
    if (!isSessionSnapshot(parsed, workoutId)) return null
    return parsed
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
