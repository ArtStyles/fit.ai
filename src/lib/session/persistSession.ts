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

export type PersistenceResult = { ok: true } | { ok: false; error: string }

function backupKey(workoutId: string): string {
  return `fitai_session_${workoutId}`
}

function persistenceError(error: unknown): string {
  return error instanceof Error ? error.message : 'Local storage unavailable'
}

export function saveBackup(snapshot: SessionSnapshot): PersistenceResult {
  try {
    localStorage.setItem(backupKey(snapshot.workoutId), JSON.stringify(snapshot))
    return { ok: true }
  } catch (error) {
    return { ok: false, error: persistenceError(error) }
  }
}

export function loadBackup(workoutId: string): SessionSnapshot | null {
  try {
    const raw = localStorage.getItem(backupKey(workoutId))
    if (!raw) return null
    const parsed = JSON.parse(raw) as SessionSnapshot
    if (parsed.workoutId !== workoutId) return null
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
