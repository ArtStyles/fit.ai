/**
 * Utilidades de respaldo en localStorage para la sesión activa.
 *
 * Clave: fitai_session_<workoutId>
 * Propósito: recuperar el estado de la sesión si el usuario cierra la app
 *            a mitad del entrenamiento (crash recovery).
 */

import type { ExerciseSession } from '@/store/sessionStore'

export interface SessionSnapshot {
  workoutId:   string
  workoutName: string
  startedAt:   number
  exercises:   ExerciseSession[]
}

function backupKey(workoutId: string): string {
  return `fitai_session_${workoutId}`
}

export function saveBackup(snapshot: SessionSnapshot): void {
  try {
    localStorage.setItem(backupKey(snapshot.workoutId), JSON.stringify(snapshot))
  } catch {
    // localStorage puede estar lleno o desactivado — ignorar
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

export function clearBackup(workoutId: string): void {
  try {
    localStorage.removeItem(backupKey(workoutId))
  } catch {
    // ignorar
  }
}
