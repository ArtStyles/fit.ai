import { afterEach, describe, expect, it } from 'vitest'
import { parseSessionContextSnapshot } from '@/lib/session/contextSnapshot'
import { NodeSqliteDriver } from '../../data/__tests__/node-sqlite-driver'
import { createAppStore, setAppStoreForTests, type AppState } from '../storage'
import { clearFreeTrainingDraft, loadFreeTrainingDraft, loadFreeTrainingModel, saveFreeTraining, saveFreeTrainingDraft, saveFreeTrainingInState } from './data'
import type { FreeTrainingInput } from './types'

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const now = new Date('2026-09-11T15:03:00Z')
function fixture(): AppState {
  return { version: 1, accountId: id(1), remoteUserId: null, email: '', revision: 0, remoteRevision: null, lastSyncedRevision: 0, tables: {
    profiles: [{ id: id(1), timezone: 'America/Havana', language: 'es', days_per_week: 3 }], workout_plans: [],
    exercises: [{ id: id(2), name: 'Squat', name_es: 'Sentadilla', muscle_groups: ['quadriceps'], is_compound: true, is_public: true }, { id: id(3), name: 'Walking', name_es: 'Caminar', exercise_type: 'cardio', muscle_groups: ['cardio'], is_public: true }],
    progress_logs: [], exercise_logs: [],
  } }
}
function input(overrides: Partial<FreeTrainingInput> = {}): FreeTrainingInput {
  return { accountId: id(1), sessionId: id(10), operationId: id(11), expectedVersion: null, date: '2026-09-11', name: '', durationMinutes: null, notes: '', detailLevel: 'attendance', exercises: [], ...overrides }
}
const exercise = { exerciseId: id(2), sets: [{ weightKg: 20, reps: 8 }, { weightKg: 22.5, reps: 7 }] }
const drivers: NodeSqliteDriver[] = []
afterEach(async () => { setAppStoreForTests(null); for (const driver of drivers.splice(0)) await driver.close() })
async function setup(state = fixture()) { const driver = new NodeSqliteDriver(':memory:'); drivers.push(driver); const store = await createAppStore(driver); await store.create(state); setAppStoreForTests(store); return store }

describe('free training atomic data', () => {
  it('stores attendance without fabricated details or workload and accepts genuine same-day sessions', () => {
    const state = fixture(); const result = saveFreeTrainingInState(state, input(), now)
    expect(result).toMatchObject({ success: true, logId: id(10), version: 1, sets: 0, volumeKg: 0, trainedDaysThisWeek: 1, improvements: [] })
    expect(state.tables.exercise_logs).toEqual([])
    expect(state.tables.progress_logs[0]).toMatchObject({ user_id: id(1), workout_id: null, duration_minutes: null, completed_at: now.toISOString(), mobile_session_kind: 'free' })
    expect(state.tables.progress_logs[0]).not.toHaveProperty('occurrence_source_date')
    const context = parseSessionContextSnapshot(state.tables.progress_logs[0].session_context_snapshot)
    expect(context).toMatchObject({ version: 1, plan: null, workout: { id: id(10) }, exercises: [] })
    expect(saveFreeTrainingInState(state, input({ sessionId: id(12), operationId: id(13) }), now)).toMatchObject({ success: true, trainedDaysThisWeek: 1 })
    expect(state.tables.progress_logs).toHaveLength(2)
  })
  it('saves evidence, replays exactly, edits atomically and preserves original time', () => {
    const state = fixture(); const original = input({ name: 'Piernas', detailLevel: 'partial', exercises: [exercise] })
    const result = saveFreeTrainingInState(state, original, now)
    expect(result).toMatchObject({ success: true, sets: 2, volumeKg: 318 })
    expect(state.tables.exercise_logs[0]).toMatchObject({ weights_kg: [20, 22.5], reps_completed: [8, 7], sets_completed: 2 })
    const before = structuredClone(state)
    expect(saveFreeTrainingInState(state, { ...original, name: 'Retry changed' }, now)).toEqual(result)
    expect(state).toEqual(before)
    expect(saveFreeTrainingInState(state, input({ expectedVersion: 1, operationId: id(12) }), new Date('2026-09-11T18:00:00Z'))).toMatchObject({ success: true, version: 2 })
    expect(state.tables.exercise_logs).toEqual([])
    expect(state.tables.progress_logs).toHaveLength(1)
    expect(state.tables.progress_logs[0].completed_at).toBe(now.toISOString())
  })
  it.each([
    { accountId: id(99) }, { date: '2026-02-30' }, { date: '2026-09-12' }, { sessionId: 'invalid' }, { operationId: 'invalid' },
    { durationMinutes: -1 }, { durationMinutes: Infinity }, { weeklyGoal: 8 }, { expectedVersion: 1 },
    { detailLevel: 'partial' as const, exercises: [] }, { exercises: [exercise] },
    { detailLevel: 'complete' as const, exercises: [exercise, exercise] },
    ...[-1, NaN, Infinity, 501, '20'].map(weightKg => ({ detailLevel: 'partial' as const, exercises: [{ exerciseId: id(2), sets: [{ weightKg, reps: 8 }] }] })),
    ...[-1, NaN, 1.5, 101, '8'].map(reps => ({ detailLevel: 'partial' as const, exercises: [{ exerciseId: id(2), sets: [{ weightKg: 20, reps }] }] })),
  ])('rejects invalid input atomically: %j', invalid => {
    const state = fixture(); const before = structuredClone(state)
    expect(saveFreeTrainingInState(state, input(invalid as Partial<FreeTrainingInput>), now).success).toBe(false)
    expect(state).toEqual(before)
  })
  it('rejects stale versions, guided rows, foreign identity collisions and private catalog additions', () => {
    for (const kind of ['stale', 'guided', 'foreign', 'private']) {
      const state = fixture(); saveFreeTrainingInState(state, input(), now)
      if (kind === 'guided') state.tables.progress_logs[0].mobile_session_kind = 'guided'
      if (kind === 'foreign') state.tables.progress_logs[0].user_id = id(99)
      if (kind === 'private') state.tables.exercises[0].is_public = false
      const before = structuredClone(state)
      expect(saveFreeTrainingInState(state, input({ operationId: id(12), expectedVersion: kind === 'stale' ? 0 : 1, detailLevel: 'complete', exercises: [exercise] }), now).success).toBe(false)
      expect(state).toEqual(before)
    }
  })
  it('keeps historical removed-catalog metadata editable and stamps personal goal only without active plan', () => {
    const state = fixture(); saveFreeTrainingInState(state, input({ detailLevel: 'complete', exercises: [exercise] }), now)
    const context = structuredClone(state.tables.progress_logs[0].session_context_snapshot)
    state.tables.exercises = []
    expect(saveFreeTrainingInState(state, input({ detailLevel: 'complete', exercises: [exercise], operationId: id(12), expectedVersion: 1, weeklyGoal: 5 }), now).success).toBe(true)
    expect(state.tables.progress_logs[0].session_context_snapshot).toEqual(context)
    expect(state.tables.profiles[0]).toMatchObject({ days_per_week: 5, updated_at: now.toISOString() })
    state.tables.workout_plans.push({ id: id(30), user_id: id(1), is_active: true })
    expect(saveFreeTrainingInState(state, input({ sessionId: id(31), weeklyGoal: 7 }), now).success).toBe(true)
    expect(state.tables.profiles[0].days_per_week).toBe(5)
  })
  it('requires real timed seconds and stores individual durations without inventing reps or load', () => {
    for (const set of [{ weightKg: 0, reps: 0 }, { weightKg: 0, reps: 0, durationSeconds: 0 }, { weightKg: 1, reps: 1, durationSeconds: 45 }]) {
      expect(saveFreeTrainingInState(fixture(), input({ detailLevel: 'partial', exercises: [{ exerciseId: id(3), sets: [set] }] }), now).success).toBe(false)
    }
    const state = fixture()
    expect(saveFreeTrainingInState(state, input({ detailLevel: 'partial', exercises: [{ exerciseId: id(3), sets: [{ weightKg: 0, reps: 0, durationSeconds: 45 }, { weightKg: 0, reps: 0, durationSeconds: 30 }] }] }), now)).toMatchObject({ success: true, volumeKg: 0, sets: 2 })
    expect(state.tables.exercise_logs[0]).toMatchObject({ duration_seconds: 75, weights_kg: [0, 0], reps_completed: [0, 0] })
  })
  it('places earlier dates at local noon across DST and compares only owned earlier evidence', () => {
    const state = fixture()
    saveFreeTrainingInState(state, input({ date: '2026-01-02', detailLevel: 'complete', exercises: [{ ...exercise, sets: [{ weightKg: 10, reps: 8 }] }] }), now)
    expect(state.tables.progress_logs[0].completed_at).toBe('2026-01-02T17:00:00.000Z')
    const result = saveFreeTrainingInState(state, input({ date: '2026-01-03', sessionId: id(12), detailLevel: 'complete', exercises: [exercise] }), now)
    expect(result).toMatchObject({ improvements: [{ exerciseName: 'Sentadilla', previousWeightKg: 10, previousReps: 8, weightKg: 22.5, reps: 7 }] })
    expect(saveFreeTrainingInState(state, input({ date: '2026-01-01', sessionId: id(14), detailLevel: 'complete', exercises: [exercise] }), now)).toMatchObject({ improvements: [] })
  })
  it('keeps local noon when the daylight-saving offset changes by thirty minutes', () => {
    const state = fixture(); state.tables.profiles[0].timezone = 'Australia/Lord_Howe'
    expect(saveFreeTrainingInState(state, input({ date: '2026-04-05' }), now).success).toBe(true)
    expect(state.tables.progress_logs[0].completed_at).toBe('2026-04-05T01:30:00.000Z')
  })
})

describe('free training storage and model', () => {
  it('reopens the latest unfinished draft from the default entry and honors an explicit new session', async () => {
    await setup()
    const draft = { ...input({ name: 'Unfinished' }), uiDraft: { name: 'Raw unfinished name', durationMinutes: '1.' } }
    await saveFreeTrainingDraft(draft)
    expect((await loadFreeTrainingModel()).initial).toEqual(draft)
    expect((await loadFreeTrainingModel(undefined, id(20))).initial).toMatchObject({ sessionId: id(20), expectedVersion: null, name: '' })
    const latest = input({ sessionId: id(21), operationId: id(22), name: 'Latest draft' })
    await saveFreeTrainingDraft(latest)
    expect((await loadFreeTrainingModel()).initial).toEqual(latest)
  })
  it('does not reopen cleared or durably saved drafts from a stale latest pointer', async () => {
    await setup()
    await saveFreeTrainingDraft(input())
    await clearFreeTrainingDraft(id(1), id(10))
    expect((await loadFreeTrainingModel()).initial.sessionId).not.toBe(id(10))
    const next = input({ sessionId: id(20), operationId: id(21), date: '2026-01-02' })
    await saveFreeTrainingDraft(next)
    expect((await saveFreeTraining(next)).success).toBe(true)
    expect((await loadFreeTrainingModel()).initial.sessionId).not.toBe(id(20))
  })
  it('isolates latest-draft recovery by account and keeps it through sign-out and reopening', async () => {
    const store = await setup(); const draft = input({ name: 'Private unfinished session' })
    await saveFreeTrainingDraft(draft)
    const other = fixture(); other.accountId = id(99); other.tables.profiles[0].id = id(99)
    await store.create(other)
    const otherModel = await loadFreeTrainingModel()
    expect(otherModel.initial.accountId).toBe(id(99))
    expect(otherModel.initial.sessionId).not.toBe(draft.sessionId)
    expect(otherModel.initial.name).toBe('')
    await store.deactivate(); await store.activate(id(1))
    expect((await loadFreeTrainingModel()).initial).toEqual(draft)
  })
  it('restores account/session drafts and clears them after successful save', async () => {
    const store = await setup(); const draft = input({ date: '2026-01-02', name: 'Draft' })
    await saveFreeTrainingDraft(draft)
    expect(await loadFreeTrainingDraft(id(1), id(10))).toEqual(draft)
    expect((await loadFreeTrainingModel(undefined, id(10))).initial).toEqual(draft)
    expect((await saveFreeTraining(draft)).success).toBe(true)
    expect(await loadFreeTrainingDraft(id(1), id(10))).toBeNull()
    expect((await loadFreeTrainingModel(id(10))).initial).toMatchObject({ sessionId: id(10), expectedVersion: 1, name: 'Draft' })
    expect((await loadFreeTrainingModel(undefined, id(10))).initial).toMatchObject({ sessionId: id(10), expectedVersion: 1, name: 'Draft' })
    await expect(saveFreeTrainingDraft(draft)).rejects.toThrow()
    expect((await store.read())?.tables.progress_logs).toHaveLength(1)
  })
  it('rejects wrong-account draft access and stale writes after clear or successful save', async () => {
    await setup(); const draft = input()
    await saveFreeTrainingDraft(draft)
    await clearFreeTrainingDraft(id(1), id(10))
    await expect(saveFreeTrainingDraft(draft)).rejects.toThrow()
    await expect(loadFreeTrainingDraft(id(99), id(10))).rejects.toThrow()
    await expect(saveFreeTrainingDraft({ ...draft, accountId: id(99) })).rejects.toThrow()
  })
  it('surfaces draft persistence failure and logout during a queued write', async () => {
    const store = await setup(); const draft = input()
    const pending = saveFreeTrainingDraft(draft); await store.deactivate()
    await expect(pending).rejects.toThrow()
  })
  it('can still open a saved workout when only the draft cache cannot be read', async () => {
    const store = await setup()
    store.getAccountCache = async () => { throw new Error('Cache unavailable') }
    expect((await loadFreeTrainingModel(undefined, id(10))).initial.sessionId).toBe(id(10))
    await expect(loadFreeTrainingDraft(id(1), id(10))).rejects.toThrow('Cache unavailable')
  })
  it('reports durable save success even if only cache cleanup fails and retries without duplication', async () => {
    const store = await setup(); const draft = input({ date: '2026-01-02' })
    await saveFreeTrainingDraft(draft)
    store.setAccountCache = async () => { throw new Error('Cache unavailable') }
    const result = await saveFreeTraining(draft)
    expect(result).toMatchObject({ success: true, version: 1 })
    expect(await saveFreeTraining(draft)).toEqual(result)
    expect((await store.read())?.tables.progress_logs).toHaveLength(1)
    expect(await loadFreeTrainingDraft(id(1), id(10))).toBeNull()
  })
  it('does not resurrect an in-flight draft after clear and does not cross an account switch', async () => {
    const store = await setup(); const draft = input()
    await saveFreeTrainingDraft(draft)
    await Promise.allSettled([saveFreeTrainingDraft(draft), clearFreeTrainingDraft(id(1), id(10))])
    expect(await loadFreeTrainingDraft(id(1), id(10))).toBeNull()
    const other = fixture(); other.accountId = id(99); other.tables.profiles[0].id = id(99)
    const saving = saveFreeTraining(input({ date: '2026-01-02' }))
    await store.create(other)
    expect((await saving).success).toBe(false)
    expect((await store.read())?.tables.progress_logs).toHaveLength(0)
  })
  it('loads only public catalog plus original removed metadata and strictly prior performance', async () => {
    const state = fixture()
    saveFreeTrainingInState(state, input({ date: '2026-01-02', detailLevel: 'partial', exercises: [exercise] }), now)
    state.tables.exercises[0].is_public = false
    await setup(state)
    const model = await loadFreeTrainingModel(id(10))
    expect(model.catalog.find(row => row.id === id(2))).toMatchObject({ name: 'Sentadilla', previous: null })
    expect((await loadFreeTrainingModel(undefined, id(12))).catalog.some(row => row.id === id(2))).toBe(false)
  })
})
