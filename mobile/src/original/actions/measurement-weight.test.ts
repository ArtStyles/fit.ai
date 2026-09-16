import { afterEach, describe, expect, it, vi } from 'vitest'
import { changeMeasurement } from './measurements'
import type { AppState } from '../types'

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
function fixture(): AppState {
  return { version: 1, accountId: id(1), remoteUserId: null, email: '', revision: 0, remoteRevision: null, lastSyncedRevision: 0,
    tables: { profiles: [{ id: id(1), weight_kg: 70 }], measurements: [] } }
}
const measurement = (n: number, weight: number | null, date = '2026-09-08T15:00:00Z') => ({ id: id(n), user_id: id(1), recorded_at: date, weight_kg: weight, notes: null })
afterEach(() => vi.useRealTimers())

describe('profile weight derived from owned measurements', () => {
  it('tracks create, edit, clear and delete using the latest weighted record', () => {
    const state = fixture()
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-09-08T15:00:00Z'))
    expect(changeMeasurement(state, 'create', null, { weight_kg: 82 }).success).toBe(true)
    const first = state.tables.measurements[0].id
    expect(state.tables.profiles[0].weight_kg).toBe(82)
    vi.setSystemTime(new Date('2026-09-09T15:00:00Z'))
    expect(changeMeasurement(state, 'create', null, { weight_kg: 85 }).success).toBe(true)
    const latest = state.tables.measurements[1].id
    expect(state.tables.profiles[0].weight_kg).toBe(85)
    expect(changeMeasurement(state, 'update', first, { weight_kg: 79 }).success).toBe(true)
    expect(state.tables.profiles[0].weight_kg).toBe(85)
    expect(changeMeasurement(state, 'update', latest, { weight_kg: 86 }).success).toBe(true)
    expect(state.tables.profiles[0].weight_kg).toBe(86)
    expect(changeMeasurement(state, 'update', latest, { weight_kg: null, waist_cm: 80 }).success).toBe(true)
    expect(state.tables.profiles[0].weight_kg).toBe(79)
    expect(changeMeasurement(state, 'delete', first).success).toBe(true)
    expect(state.tables.profiles[0].weight_kg).toBeNull()
  })

  it('uses recorded date then descending UUID for ties when the latest weight is removed', () => {
    const state = fixture()
    state.tables.measurements = [measurement(10, 78), measurement(11, 81), measurement(12, 99, '2026-09-01T15:00:00Z'), measurement(13, 84, '2026-09-09T15:00:00Z')]
    expect(changeMeasurement(state, 'delete', id(13)).success).toBe(true)
    expect(state.tables.profiles[0].weight_kg).toBe(81)
    expect(changeMeasurement(state, 'delete', id(11)).success).toBe(true)
    expect(state.tables.profiles[0].weight_kg).toBe(78)
  })

  it('preserves initial weight for weightless CRUD and notes-only updates, as the web trigger does', () => {
    const state = fixture()
    expect(changeMeasurement(state, 'create', null, { waist_cm: 80 }).success).toBe(true)
    expect(changeMeasurement(state, 'update', state.tables.measurements[0].id, { notes: 'Control' }).success).toBe(true)
    expect(changeMeasurement(state, 'delete', state.tables.measurements[0].id).success).toBe(true)
    expect(state.tables.profiles[0].weight_kg).toBe(70)
  })

  it('rejects foreign and invalid mutations atomically and never derives foreign or invalid weights', () => {
    const state = fixture()
    state.tables.profiles.push({ id: id(99), weight_kg: 95 })
    state.tables.measurements = [measurement(10, 78), { ...measurement(11, 95, '2026-09-10T15:00:00Z'), user_id: id(99) }, measurement(12, -1, '2026-09-10T15:00:00Z'), measurement(13, 3000, '2026-09-10T15:00:00Z'), measurement(14, 82, 'invalid')]
    const before = structuredClone(state)
    expect(changeMeasurement(state, 'update', id(11), { weight_kg: 85 }).success).toBe(false)
    expect(changeMeasurement(state, 'delete', id(11)).success).toBe(false)
    expect(changeMeasurement(state, 'update', id(10), { weight_kg: -1 }).success).toBe(false)
    expect(state).toEqual(before)
    expect(changeMeasurement(state, 'update', id(10), { weight_kg: 80 }).success).toBe(true)
    expect(state.tables.profiles).toEqual([{ id: id(1), weight_kg: 80 }, { id: id(99), weight_kg: 95 }])
  })
})
