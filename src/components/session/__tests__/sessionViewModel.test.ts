import { describe, expect, it } from 'vitest'
import {
  COMPLETION_SECTION_ORDER,
  buildSessionFocusWindow,
  currentSetIndex,
  formatPreviousPerformance,
  isCurrentSet,
  nextSessionSyncState,
  sessionSyncLabel,
  syncEventForStorageResult,
  zipPreviousPerformanceRows,
  setInputMode,
  stepSessionValue,
} from '../sessionViewModel'

describe('session presentation', () => {
  it('returns the previous, current, and next set around the active set', () => {
    const result = buildSessionFocusWindow([{ status: 'active', sets: [
      { completed: true },
      { completed: false },
      { completed: false },
    ] }])

    expect(result).toMatchObject({
      exerciseIndex: 0,
      previousSetIndex: 0,
      currentSetIndex: 1,
      nextSetIndex: 2,
      nextExerciseIndex: null,
    })
  })

  it('identifies the next pending exercise after the active one', () => {
    expect(buildSessionFocusWindow([
      { status: 'completed', sets: [{ completed: true }] },
      { status: 'active', sets: [{ completed: false }] },
      { status: 'skipped', sets: [{ completed: false }] },
      { status: 'pending', sets: [{ completed: false }] },
    ])).toMatchObject({ exerciseIndex: 1, nextExerciseIndex: 3 })
  })

  it('returns an empty focus window without an active exercise', () => {
    expect(buildSessionFocusWindow([{ status: 'completed', sets: [{ completed: true }] }])).toEqual({
      exerciseIndex: -1,
      previousSetIndex: null,
      currentSetIndex: null,
      nextSetIndex: null,
      nextExerciseIndex: null,
    })
  })

  it('steps numeric strings without floating-point artifacts', () => {
    expect(stepSessionValue('35', 0.5, 1)).toBe('35.5')
    expect(stepSessionValue('0', -1, 0)).toBe('0')
    expect(stepSessionValue('0.2', 0.1, 1)).toBe('0.3')
  })

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

  it('never claims local or server persistence after a failed storage operation', () => {
    expect(syncEventForStorageResult('write', { ok: false, error: 'quota' })).toBe('local-error')
    expect(syncEventForStorageResult('write', { ok: true })).toBe('local-backup')
    expect(syncEventForStorageResult('delete', { ok: false, error: 'blocked' })).toBe('local-error')
    expect(syncEventForStorageResult('delete', { ok: true })).toBe('server-success')
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
    expect(currentSetIndex([{ completed: true }, { completed: true }])).toBe(-1)
    expect(currentSetIndex([])).toBe(-1)
  })

  it('marks a set current only in the active exercise', () => {
    const sets = [{ completed: true }, { completed: false }]
    expect(isCurrentSet('pending', 1, sets)).toBe(false)
    expect(isCurrentSet('active', 1, sets)).toBe(true)
    expect(isCurrentSet('active', 0, [{ completed: true }])).toBe(false)
  })

  it('zips previous weights and reps by original set index without dropping zero', () => {
    expect(zipPreviousPerformanceRows([{
      weightsKg: [0, null, 22.5],
      reps: [12, 10, null],
    }])).toEqual([
      { weightKg: 0, reps: 12 },
      { weightKg: null, reps: 10 },
      { weightKg: 22.5, reps: null },
    ])
  })

  it('preserves missing arrays and mixed row ordering', () => {
    expect(zipPreviousPerformanceRows([
      { weightsKg: null, reps: [8, 7] },
      { weightsKg: [30, 32.5], reps: null },
    ])).toEqual([
      { weightKg: null, reps: 8 },
      { weightKg: null, reps: 7 },
      { weightKg: 30, reps: null },
      { weightKg: 32.5, reps: null },
    ])
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
