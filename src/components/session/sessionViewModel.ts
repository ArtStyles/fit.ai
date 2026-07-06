export type SessionSyncState = 'saved-local' | 'syncing' | 'synced' | 'error'
export type SessionSyncEvent = 'local-backup' | 'server-save' | 'server-success' | 'server-error' | 'retry'
export type SetFieldKind = 'weight' | 'reps' | 'rpe'
export type SessionLocale = 'es' | 'en'

export interface PreviousPerformanceSet {
  weightKg: number | string | null
  reps: number | string | null
  durationSeconds?: number | null
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

export function currentSetIndex(sets: Array<{ completed: boolean }>): number {
  if (sets.length === 0) return -1
  const incompleteIndex = sets.findIndex(set => !set.completed)
  return incompleteIndex === -1 ? sets.length - 1 : incompleteIndex
}
