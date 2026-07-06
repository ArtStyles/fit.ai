import { describe, expect, it } from 'vitest'
import {
  COMPLETION_SECTION_ORDER,
  currentSetIndex,
  formatPreviousPerformance,
  nextSessionSyncState,
  sessionSyncLabel,
  setInputMode,
} from '../sessionViewModel'

describe('session presentation', () => {
  it('uses numeric keyboards for workout values', () => {
    expect(setInputMode('weight')).toBe('decimal')
    expect(setInputMode('reps')).toBe('numeric')
    expect(setInputMode('rpe')).toBe('decimal')
  })

  it.each([
    ['saved-local', 'es', 'Guardado en este dispositivo'],
    ['syncing', 'es', 'Sincronizando'],
    ['synced', 'es', 'Sincronizado'],
    ['error', 'es', 'Falló la sincronización · reintentar'],
    ['saved-local', 'en', 'Saved on this device'],
    ['syncing', 'en', 'Syncing'],
    ['synced', 'en', 'Synced'],
    ['error', 'en', 'Sync failed · retry'],
  ] as const)('localizes %s in %s', (state, locale, label) => {
    expect(sessionSyncLabel(state, locale)).toBe(label)
  })

  it('models local backup, save, success, failure, and retry transitions', () => {
    expect(nextSessionSyncState('synced', 'local-backup')).toBe('saved-local')
    expect(nextSessionSyncState('saved-local', 'server-save')).toBe('syncing')
    expect(nextSessionSyncState('syncing', 'server-success')).toBe('synced')
    expect(nextSessionSyncState('syncing', 'server-error')).toBe('error')
    expect(nextSessionSyncState('error', 'retry')).toBe('syncing')
  })

  it('formats prior weighted, bodyweight, and timed performance', () => {
    expect(formatPreviousPerformance([
      { weightKg: 60, reps: 8 },
      { weightKg: 62.5, reps: 6 },
    ], 'es')).toBe('60 kg × 8 · 62,5 kg × 6')
    expect(formatPreviousPerformance([{ weightKg: 0, reps: 12 }], 'en')).toBe('12 reps')
    expect(formatPreviousPerformance([{ weightKg: null, reps: null, durationSeconds: 90 }], 'en')).toBe('1:30')
  })

  it('omits prior performance when no usable values exist', () => {
    expect(formatPreviousPerformance([], 'es')).toBeNull()
    expect(formatPreviousPerformance([{ weightKg: null, reps: null }], 'en')).toBeNull()
  })

  it('identifies the first incomplete set as the current set', () => {
    expect(currentSetIndex([{ completed: true }, { completed: false }, { completed: false }])).toBe(1)
    expect(currentSetIndex([{ completed: true }, { completed: true }])).toBe(1)
    expect(currentSetIndex([])).toBe(-1)
  })

  it('defines the operational completion order', () => {
    expect(COMPLETION_SECTION_ORDER).toEqual([
      'session-complete',
      'records',
      'weekly-continuity',
      'progression-suggestions',
      'share',
      'dashboard',
    ])
  })
})
