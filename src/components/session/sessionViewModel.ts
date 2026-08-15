export type SessionSyncState = 'saved-local' | 'syncing' | 'synced' | 'error'
export type SessionSyncEvent = 'local-backup' | 'local-error' | 'server-save' | 'server-success' | 'server-error' | 'retry'
export type SessionSyncErrorSource = 'backup-write' | 'backup-delete' | 'server' | null
export type SetFieldKind = 'weight' | 'reps' | 'rpe'
export type SessionLocale = 'es' | 'en'

export interface PreviousPerformanceSet {
  weightKg: number | string | null
  reps: number | string | null
  durationSeconds?: number | null
}

export interface PreviousPerformanceRow {
  weightsKg: Array<number | null> | null
  reps: Array<number | null> | null
}

export type SessionFocusWindow = {
  exerciseIndex: number
  previousSetIndex: number | null
  currentSetIndex: number | null
  nextSetIndex: number | null
  nextExerciseIndex: number | null
}

type SessionFocusExercise = {
  status: 'pending' | 'active' | 'completed' | 'skipped'
  sets: Array<{ completed: boolean }>
}

export type ActiveSessionProgress = {
  completedSets: number
  totalSets: number
  completedExercises: number
  totalExercises: number
  percentage: number
}

export function summarizeActiveSession(
  exercises: SessionFocusExercise[],
): ActiveSessionProgress {
  const totalSets = exercises.reduce((total, exercise) => total + exercise.sets.length, 0)
  const completedSets = exercises.reduce(
    (total, exercise) => total + exercise.sets.filter(set => set.completed).length,
    0,
  )

  return {
    completedSets,
    totalSets,
    completedExercises: exercises.filter(exercise => exercise.status === 'completed').length,
    totalExercises: exercises.length,
    percentage: totalSets > 0 ? Math.round((completedSets / totalSets) * 100) : 0,
  }
}

export function formatActiveWorkoutElapsed(startedAt: number, now: number): string {
  const elapsedSeconds = Math.max(0, Math.floor((now - startedAt) / 1_000))
  if (elapsedSeconds < 60) return `${elapsedSeconds} s`

  const elapsedMinutes = Math.floor(elapsedSeconds / 60)
  if (elapsedMinutes < 60) return `${elapsedMinutes} min`

  const hours = Math.floor(elapsedMinutes / 60)
  return `${hours} h ${elapsedMinutes % 60} min`
}

export const COMPLETION_SECTION_ORDER = [
  'session-complete',
  'records',
  'weekly-continuity',
  'progression-suggestions',
  'share',
  'dashboard',
] as const

export const setInputMode = (kind: SetFieldKind): 'numeric' | 'decimal' =>
  kind === 'reps' ? 'numeric' : 'decimal'

const LABELS = {
  es: {
    'saved-local': 'Guardado en este dispositivo',
    syncing: 'Sincronizando',
    synced: 'Sincronizado',
    error: 'Falló la sincronización · reintentar',
  },
  en: {
    'saved-local': 'Saved on this device',
    syncing: 'Syncing',
    synced: 'Synced',
    error: 'Sync failed · retry',
  },
} as const

export function sessionSyncLabel(state: SessionSyncState, locale: SessionLocale): string {
  return LABELS[locale][state]
}

export function nextSessionSyncState(
  _current: SessionSyncState,
  event: SessionSyncEvent,
): SessionSyncState {
  if (event === 'local-backup') return 'saved-local'
  if (event === 'server-save' || event === 'retry') return 'syncing'
  if (event === 'server-success') return 'synced'
  return 'error'
}

export function syncEventForStorageResult(
  operation: 'write' | 'delete',
  result: { ok: true } | { ok: false; error: string },
): SessionSyncEvent {
  if (!result.ok) return 'local-error'
  return operation === 'write' ? 'local-backup' : 'server-success'
}

function formatDuration(seconds: number): string {
  const safeSeconds = Math.max(0, Math.round(seconds))
  return `${Math.floor(safeSeconds / 60)}:${String(safeSeconds % 60).padStart(2, '0')}`
}

function numericValue(value: number | string | null): number | null {
  if (value === null || value === '') return null
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

export function formatPreviousPerformance(
  sets: PreviousPerformanceSet[],
  locale: SessionLocale,
): string | null {
  const numberFormat = new Intl.NumberFormat(locale === 'en' ? 'en-US' : 'es-ES', {
    maximumFractionDigits: 2,
  })

  const values = sets.flatMap(set => {
    if (set.durationSeconds && set.durationSeconds > 0) return [formatDuration(set.durationSeconds)]

    const weight = numericValue(set.weightKg)
    const reps = numericValue(set.reps)
    if (weight !== null && weight > 0 && reps !== null && reps > 0) {
      return [`${numberFormat.format(weight)} kg × ${numberFormat.format(reps)}`]
    }
    if (reps !== null && reps > 0) return [`${numberFormat.format(reps)} reps`]
    if (weight !== null && weight > 0) return [`${numberFormat.format(weight)} kg`]
    return []
  })

  return values.length > 0 ? values.join(' · ') : null
}

export function zipPreviousPerformanceRows(rows: PreviousPerformanceRow[]): PreviousPerformanceSet[] {
  return rows.flatMap(row => {
    const setCount = Math.max(row.weightsKg?.length ?? 0, row.reps?.length ?? 0)
    return Array.from({ length: setCount }, (_, index) => ({
      weightKg: row.weightsKg?.[index] ?? null,
      reps: row.reps?.[index] ?? null,
    }))
  })
}

export function currentSetIndex(sets: Array<{ completed: boolean }>): number {
  if (sets.length === 0) return -1
  return sets.findIndex(set => !set.completed)
}

export function buildSessionFocusWindow(
  exercises: SessionFocusExercise[],
): SessionFocusWindow {
  const exerciseIndex = exercises.findIndex(exercise => exercise.status === 'active')
  if (exerciseIndex < 0) {
    return {
      exerciseIndex: -1,
      previousSetIndex: null,
      currentSetIndex: null,
      nextSetIndex: null,
      nextExerciseIndex: null,
    }
  }

  const sets = exercises[exerciseIndex].sets
  const currentIndex = currentSetIndex(sets)
  const nextExerciseOffset = exercises
    .slice(exerciseIndex + 1)
    .findIndex(exercise => exercise.status === 'pending')

  return {
    exerciseIndex,
    previousSetIndex: currentIndex > 0
      ? currentIndex - 1
      : currentIndex < 0 && sets.length > 0
        ? sets.length - 1
        : null,
    currentSetIndex: currentIndex >= 0 ? currentIndex : null,
    nextSetIndex: currentIndex >= 0 && currentIndex + 1 < sets.length
      ? currentIndex + 1
      : null,
    nextExerciseIndex: nextExerciseOffset >= 0
      ? exerciseIndex + 1 + nextExerciseOffset
      : null,
  }
}

export function stepSessionValue(value: string, delta: number, precision: number): string {
  const safePrecision = Math.min(6, Math.max(0, Math.trunc(precision)))
  const scale = 10 ** safePrecision
  const parsed = Number(value)
  const current = Number.isFinite(parsed) ? parsed : 0
  const stepped = Math.max(0, Math.round((current + delta) * scale) / scale)
  const fixed = stepped.toFixed(safePrecision)

  return fixed.includes('.') ? fixed.replace(/\.?0+$/, '') : fixed
}

export function isCurrentSet(
  status: 'pending' | 'active' | 'completed' | 'skipped',
  index: number,
  sets: Array<{ completed: boolean }>,
): boolean {
  return status === 'active' && index === currentSetIndex(sets)
}
