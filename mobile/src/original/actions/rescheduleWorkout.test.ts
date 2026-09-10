import { afterEach, describe, expect, it, vi } from 'vitest'
import { NodeSqliteDriver } from '../../data/__tests__/node-sqlite-driver'
import { createAppStore, setAppStoreForTests, validateAppState } from '../storage'
import type { AppState } from '../types'
import { rescheduleWorkout, rescheduleInState } from './rescheduleWorkout'
import { authorizeInState } from './authorizeSession'
import { saveInState, type SaveSessionPayload } from './saveSession'
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const now = new Date('2026-09-14T12:00:00Z')
const next = new Date('2026-09-15T12:00:00Z')
const input = { accountId: id(1), planId: id(2), workoutId: id(3), sourceDate: '2026-09-14', targetDate: '2026-09-15' }
function fixture(): AppState {
  return { version: 1, accountId: id(1), remoteUserId: null, email: '', revision: 0, remoteRevision: null, lastSyncedRevision: 0, tables: {
    profiles: [{ id: id(1), readiness_status: 'cleared', timezone: 'UTC' }],
    workout_plans: [{ id: id(2), user_id: id(1), family_id: id(2), name: 'Plan', is_active: true, prescription_locked: true, trainer_assignment_id: id(40), trainer_assignment_version_id: id(41) }],
    workouts: [{ id: id(3), user_id: id(1), plan_id: id(2), name: 'A', day_of_week: 1 }],
    workout_exercises: [{ id: id(4), workout_id: id(3), exercise_id: id(5), sets: 1, reps: 8, order_index: 0 }],
    exercises: [{ id: id(5), name: 'Squat', muscle_groups: ['quadriceps'] }], progress_logs: [], session_authorizations: [],
  } }
}
const drivers: NodeSqliteDriver[] = []
afterEach(async () => { vi.useRealTimers(); setAppStoreForTests(null); for (const driver of drivers.splice(0)) await driver.close() })
async function setup(state = fixture()) {
  const driver = new NodeSqliteDriver(':memory:'); drivers.push(driver)
  const store = await createAppStore(driver); await store.create(state); setAppStoreForTests(store)
  return { store, driver }
}
describe('local single occurrence scheduling', () => {
  it('moves a locked prescription, suppresses source access, stamps saved evidence and prevents replay', async () => {
    const state = fixture(); const prescription = structuredClone(state.tables.workout_exercises)
    expect(rescheduleInState(state, input, now).success).toBe(true)
    expect(state.tables.workouts[0].day_of_week).toBe(1)
    expect(state.tables.workout_exercises).toEqual(prescription)
    expect((await authorizeInState(state, id(6), id(3), now)).success).toBe(false)
    expect((await authorizeInState(state, id(6), id(3), next)).success).toBe(true)
    expect(state.tables.session_authorizations[0]).toMatchObject({ occurrence_source_date: input.sourceDate, occurrence_scheduled_date: input.targetDate })
    expect(rescheduleInState(state, { ...input, targetDate: null }, next).success).toBe(false)
    const payload: SaveSessionPayload = { clientSessionId: id(6), workoutId: id(3), startedAt: next.getTime(), finishedAt: next.getTime() + 60000, moodRating: null, exercises: [{ workoutExerciseId: id(4), exerciseId: id(5), name: 'Squat', status: 'completed', sets: [{ weightKg: '20', reps: '8', rpe: null, completed: true }] }] }
    const result = await saveInState(state, payload, new Date(payload.finishedAt))
    expect(result.success, result.error).toBe(true)
    expect(state.tables.progress_logs[0]).toMatchObject({ occurrence_source_date: input.sourceDate, occurrence_scheduled_date: input.targetDate })
    expect(await saveInState(state, payload, new Date(payload.finishedAt))).toEqual(result)
    expect((await authorizeInState(state, id(7), id(3), new Date('2026-09-16T12:00:00Z'))).success).toBe(false)
    expect((await authorizeInState(state, id(8), id(3), new Date('2026-09-21T12:00:00Z'))).success).toBe(true)
  })
  it('checks ownership, active lifecycle, real source weekdays, horizon and ambiguous recovery', () => {
    for (const change of [{ accountId: id(9) }, { sourceDate: '2026-09-15' }, { sourceDate: '2026-02-30' }, { targetDate: '2026-09-13' }, { targetDate: '2026-09-22' }, { targetDate: '2026-09-20' }]) {
      const state = fixture(); expect(rescheduleInState(state, { ...input, ...change }, now).success).toBe(false); expect(state.tables.workout_schedule_overrides ?? []).toHaveLength(0)
    }
    for (const lifecycle of [{ is_active: false }, { retired_at: now.toISOString() }, { superseded_at: now.toISOString() }]) {
      const state = fixture(); Object.assign(state.tables.workout_plans[0], lifecycle)
      expect(rescheduleInState(state, input, now).success).toBe(false)
    }
  })
  it('rejects occupied destinations, completed legacy sources and existing leases', async () => {
    const state = fixture()
    state.tables.workouts.push({ ...state.tables.workouts[0], id: id(9), day_of_week: 2 })
    expect(rescheduleInState(state, input, now)).toMatchObject({ success: false })
    state.tables.workouts.pop()
    state.tables.progress_logs.push({ id: id(10), user_id: id(1), workout_id: id(3), completed_at: now.toISOString() })
    expect(rescheduleInState(state, input, now).success).toBe(false)
    state.tables.progress_logs = []
    expect((await authorizeInState(state, id(6), id(3), now)).success).toBe(true)
    expect(rescheduleInState(state, input, now).success).toBe(false)
  })
  it('keeps an in-progress occurrence exclusive across midnight while the same lease resumes', async () => {
    const state = fixture()
    const late = new Date('2026-09-14T23:30:00Z')
    const early = new Date('2026-09-15T01:00:00Z')
    const original = await authorizeInState(state, id(6), id(3), late)
    expect(original.success).toBe(true)
    expect((await authorizeInState(state, id(7), id(3), early)).success).toBe(false)
    expect(await authorizeInState(state, id(6), id(3), early)).toEqual(original)
    expect(rescheduleInState(state, input, early).success).toBe(false)
  })
  it('returns a recovered Sunday to its source on Monday without changing the weekly prescription', () => {
    const state = fixture(); state.tables.workouts[0].day_of_week = 7
    const sunday = { ...input, sourceDate: '2026-09-13', targetDate: '2026-09-14' }
    expect(rescheduleInState(state, sunday, now).success).toBe(true)
    expect(rescheduleInState(state, { ...sunday, targetDate: null }, now).success).toBe(true)
    expect(state.tables.workout_schedule_overrides).toHaveLength(0)
    expect(state.tables.workouts[0].day_of_week).toBe(7)
  })
  it('persists idempotent concurrent clicks, reload, backup/import, revert and old backups in real SQLite', async () => {
    vi.useFakeTimers(); vi.setSystemTime(now)
    const { store, driver } = await setup()
    expect((await Promise.all([rescheduleWorkout(input), rescheduleWorkout(input)])).every(result => result.success)).toBe(true)
    const reopened = await createAppStore(driver)
    expect((await reopened.read())!.tables.workout_schedule_overrides).toHaveLength(1)
    const backup = await store.exportBackup()
    const different = fixture(); different.accountId = id(20); different.tables = { profiles: [{ id: id(20) }] }
    const { store: restored } = await setup(different)
    await restored.importBackup(backup)
    expect((await restored.read())!.tables.workout_schedule_overrides).toEqual((await store.read())!.tables.workout_schedule_overrides)
    expect((await rescheduleWorkout({ ...input, targetDate: null })).success).toBe(true)
    expect((await restored.read())!.tables.workout_schedule_overrides).toHaveLength(0)
    expect(validateAppState(fixture()).tables.workout_schedule_overrides).toBeUndefined()
  })
  it('rejects malformed, foreign, duplicate and orphan overrides in backup validation', () => {
    const state = fixture(); expect(rescheduleInState(state, input, now).success).toBe(true)
    for (const change of [{ user_id: id(9) }, { target_date: '2026-02-30' }, { workout_id: id(9) }, { plan_id: id(9) }, { policy_timezone: 'Invalid/Zone' }]) {
      const bad = structuredClone(state); Object.assign(bad.tables.workout_schedule_overrides[0], change)
      expect(() => validateAppState(bad)).toThrow()
    }
    state.tables.workout_schedule_overrides.push({ ...state.tables.workout_schedule_overrides[0], id: id(30) })
    expect(() => validateAppState(state)).toThrow()
  })
  it('serializes competing destinations and preserves data after rejected backup import', async () => {
    vi.useFakeTimers(); vi.setSystemTime(now)
    const state = fixture(); state.tables.workouts.push({ ...state.tables.workouts[0], id: id(9), day_of_week: 3 })
    const { store } = await setup(state)
    const results = await Promise.all([
      rescheduleWorkout({ ...input, targetDate: '2026-09-18' }),
      rescheduleWorkout({ ...input, workoutId: id(9), sourceDate: '2026-09-16', targetDate: '2026-09-18' }),
    ])
    expect(results.map(result => result.success)).toEqual([true, false])
    const before = await store.read()
    const bad = JSON.parse(await store.exportBackup())
    bad.state.tables.workout_schedule_overrides[0].user_id = id(30)
    await expect(store.importBackup(JSON.stringify(bad))).rejects.toThrow()
    expect(await store.read()).toEqual(before)
  })
  it('upgrades a pre-feature authorization into dated evidence when its existing session is saved', async () => {
    const state = fixture()
    expect((await authorizeInState(state, id(6), id(3), now)).success).toBe(true)
    delete state.tables.session_authorizations[0].occurrence_source_date
    delete state.tables.session_authorizations[0].occurrence_scheduled_date
    const payload: SaveSessionPayload = { clientSessionId: id(6), workoutId: id(3), startedAt: now.getTime(), finishedAt: now.getTime() + 60000, moodRating: null, exercises: [{ workoutExerciseId: id(4), exerciseId: id(5), name: 'Squat', status: 'completed', sets: [{ weightKg: '20', reps: '8', rpe: null, completed: true }] }] }
    expect((await saveInState(state, payload, new Date(payload.finishedAt))).success).toBe(true)
    expect(state.tables.progress_logs[0]).toMatchObject({ occurrence_source_date: '2026-09-14', occurrence_scheduled_date: '2026-09-14' })
  })
})
