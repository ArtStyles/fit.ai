import { afterEach, describe, expect, it, vi } from 'vitest'
import { NodeSqliteDriver } from '../../data/__tests__/node-sqlite-driver'
import { createAppStore, type AppState } from '../storage'
import { parseSessionContextSnapshot } from '@/lib/session/contextSnapshot'
import { createFitnessImporter } from './data'

vi.mock('./parse', () => ({ parseFitnessCsv: (text: string) => JSON.parse(text), ImportFormatError: class extends Error {} }))
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const drivers: NodeSqliteDriver[] = []
afterEach(async () => { for (const driver of drivers.splice(0)) await driver.close() })
const fixture = (accountId = id(1)): AppState => ({ version: 1, accountId, remoteUserId: accountId, email: 'test@example.invalid', revision: 0, remoteRevision: null, lastSyncedRevision: 0, tables: {
  profiles: [{ id: accountId, timezone: 'America/Havana', language: 'es' }],
  exercises: [{ id: id(2), name: 'Bench Press', name_es: 'Press de banca', is_public: true, muscle_groups: ['chest', 'triceps'], muscle_groups_es: ['pecho', 'tríceps'], is_compound: true }],
  workout_plans: [{ id: id(3), user_id: accountId, is_active: true }], workouts: [], workout_exercises: [], progress_logs: [], exercise_logs: [], measurements: [],
} })
const set = { reps: 8, weightKg: 50, durationSeconds: null, distanceMeters: null, rpe: 8, kind: 'normal', notes: '' }
function csv(overrides: Record<string, unknown> = {}) { return JSON.stringify({ source: 'hevy', warnings: [], workouts: [{ sourceKey: '2024-06-01T10:00:00:Push', title: 'Push', startedAt: '2024-06-01T10:00:00', completedAt: '2024-06-01T11:00:00', date: '2024-06-01', durationSeconds: 3600, notes: 'original', exercises: [{ key: 'bench press', name: 'Bench Press', notes: '', sets: [set] }], ...overrides }] }) }
async function setup() { const driver = new NodeSqliteDriver(':memory:'); drivers.push(driver); const store = await createAppStore(driver); await store.create(fixture()); return { store, service: createFitnessImporter(store) } }

describe('fitness CSV import into real SQLite', () => {
  it('previews without mutations, then adds dated history with snapshots and leaves plans/catalog intact', async () => {
    const { store, service } = await setup(); const before = await store.read()
    const preview = await service.prepare(csv())
    expect(preview).toMatchObject({ source: 'hevy', newWorkoutCount: 1, duplicateCount: 0, setCount: 1, timeZone: 'America/Havana' })
    expect(preview.exercises[0].exerciseId).toBe(id(2)); expect(await store.read()).toEqual(before)
    expect(await service.commit(preview.token, { 'bench press': id(2) })).toEqual({ imported: 1, duplicates: 0, conflicts: 0 })
    const current = (await store.read())!
    expect(current.tables.exercises).toEqual(before!.tables.exercises); expect(current.tables.workout_plans).toEqual(before!.tables.workout_plans)
    const log = current.tables.progress_logs[0]
    expect(log).toMatchObject({ workout_id: null, mobile_session_kind: 'imported', completed_at: '2024-06-01T15:00:00.000Z', duration_minutes: 60 })
    expect(log.mobile_import).toMatchObject({ source: 'hevy', date: '2024-06-01', notes: 'original' })
    expect(parseSessionContextSnapshot(log.session_context_snapshot)?.exercises[0].muscleGroups).toEqual(['chest', 'triceps'])
    expect(current.tables.exercise_logs[0]).toMatchObject({ exercise_id: id(2), reps_completed: [8], weights_kg: [50], rpe_values: [8] })
  })
  it('omits repeated imports and identifies changed exports without overwriting the saved workout', async () => {
    const { store, service } = await setup(); const first = await service.prepare(csv()); await service.commit(first.token, {})
    const before = structuredClone((await store.read())!.tables.progress_logs)
    const repeated = await service.prepare(csv()); expect(repeated).toMatchObject({ duplicateCount: 1, newWorkoutCount: 0 })
    expect(await service.commit(repeated.token, {})).toEqual({ imported: 0, duplicates: 1, conflicts: 0 })
    const changed = await service.prepare(csv({ notes: 'changed in origin' })); expect(changed).toMatchObject({ conflictCount: 1, newWorkoutCount: 0 })
    expect(await service.commit(changed.token, {})).toEqual({ imported: 0, duplicates: 0, conflicts: 1 })
    expect((await store.read())!.tables.progress_logs).toEqual(before)
  })
  it('preserves unknown exercises and timed/distance sets without fabricating catalog muscles or zero loads', async () => {
    const { store, service } = await setup()
    const preview = await service.prepare(csv({ exercises: [{ key: 'run', name: 'Outdoor Run', notes: 'park', sets: [{ ...set, reps: null, weightKg: null, durationSeconds: 600, distanceMeters: 1500, kind: 'warmup', rpe: null }] }] }))
    expect(preview.exercises[0].exerciseId).toBeNull(); await service.commit(preview.token, { run: null })
    const state = (await store.read())!; const detail = state.tables.exercise_logs[0]
    expect(detail).toMatchObject({ reps_completed: [null], weights_kg: [null], duration_seconds: 600 })
    expect(state.tables.exercises).toHaveLength(1)
    expect(parseSessionContextSnapshot(state.tables.progress_logs[0].session_context_snapshot)?.exercises[0]).toMatchObject({ name: 'Outdoor Run', muscleGroups: [] })
    expect(state.tables.progress_logs[0].mobile_import.exercises[0].sets[0]).toMatchObject({ distanceMeters: 1500, kind: 'warmup' })
  })
  it('cancels previews and rejects account changes even after reactivating the original account', async () => {
    const { store, service } = await setup(); const cancelled = await service.prepare(csv()); service.cancel(cancelled.token)
    await expect(service.commit(cancelled.token, {})).rejects.toThrow()
    const preview = await service.prepare(csv()); await store.create(fixture(id(9))); await store.activate(id(1))
    await expect(service.commit(preview.token, {})).rejects.toThrow(); expect((await store.read())!.tables.progress_logs).toHaveLength(0)
  })
  it('rejects absent/private mappings atomically and allows a corrected retry', async () => {
    const { store, service } = await setup(); const preview = await service.prepare(csv())
    await expect(service.commit(preview.token, { 'bench press': id(99) })).rejects.toThrow()
    expect((await store.read())!.tables.progress_logs).toHaveLength(0)
    expect(await service.commit(preview.token, { 'bench press': id(2) })).toMatchObject({ imported: 1 })
  })
  it('checks duplicates again when two previews are committed concurrently', async () => {
    const { store, service } = await setup(); const a = await service.prepare(csv()); const b = await service.prepare(csv())
    const result = await Promise.all([service.commit(a.token, {}), service.commit(b.token, {})])
    expect(result.reduce((n, row) => n + row.imported, 0)).toBe(1); expect((await store.read())!.tables.progress_logs).toHaveLength(1)
  })
  it('survives backup/restore with import identity and original sets intact', async () => {
    const { store, service } = await setup(); const preview = await service.prepare(csv()); await service.commit(preview.token, {})
    const backup = await store.exportBackup(); const other = await setup(); const restore = await other.store.previewBackupRestore(backup); await other.store.restoreBackup(restore.token, true)
    expect((await other.store.read())!.tables).toEqual((await store.read())!.tables)
    expect(await other.service.prepare(csv())).toMatchObject({ duplicateCount: 1 })
  })
  it('requires a real local instant in the selected time zone, rejecting DST gaps and future workouts', async () => {
    const { store, service } = await setup()
    await expect(service.prepare(csv({ startedAt: '2024-03-10T02:30:00', completedAt: '2024-03-10T02:45:00', date: '2024-03-10' }), { timeZone: 'America/New_York' })).rejects.toThrow()
    await expect(service.prepare(csv({ startedAt: '2024-11-03T01:30:00', completedAt: '2024-11-03T02:45:00', date: '2024-11-03' }), { timeZone: 'America/New_York' })).rejects.toThrow()
    await expect(service.prepare(csv({ startedAt: '2099-01-01T10:00:00', completedAt: '2099-01-01T11:00:00', date: '2099-01-01' }))).rejects.toThrow()
    expect((await store.read())!.tables.progress_logs).toHaveLength(0)
  })
  it('uses elapsed time across DST for Hevy and keeps explicit Strong duration', async () => {
    const hevy = await setup()
    const input = csv({ startedAt: '2024-03-10T01:30:00', completedAt: '2024-03-10T03:30:00', date: '2024-03-10', durationSeconds: 7200 })
    const preview = await hevy.service.prepare(input, { timeZone: 'America/New_York' })
    await hevy.service.commit(preview.token, {})
    expect((await hevy.store.read())!.tables.progress_logs[0].duration_minutes).toBe(60)
    const strong = await setup()
    const parsed = JSON.parse(input); parsed.source = 'strong'
    const other = await strong.service.prepare(JSON.stringify(parsed), { timeZone: 'America/New_York' })
    await strong.service.commit(other.token, {})
    expect((await strong.store.read())!.tables.progress_logs[0]).toMatchObject({ completed_at: '2024-03-10T08:30:00.000Z', duration_minutes: 120 })
  })
  it('preserves local timestamp fractions', async () => {
    const { store, service } = await setup()
    const preview = await service.prepare(csv({ startedAt: '2024-06-01T10:00:00.125', completedAt: '2024-06-01T11:00:00.250' }))
    await service.commit(preview.token, {})
    expect((await store.read())!.tables.progress_logs[0].completed_at).toBe('2024-06-01T15:00:00.250Z')
  })
  it('imports FitNotes civil dates even when midnight is skipped by DST', async () => {
    const { store, service } = await setup()
    const parsed = JSON.parse(csv({ startedAt: '2024-03-10T00:00:00', completedAt: '2024-03-10T00:00:00', date: '2024-03-10', durationSeconds: null })); parsed.source = 'fitnotes'
    const preview = await service.prepare(JSON.stringify(parsed))
    await service.commit(preview.token, {})
    expect((await store.read())!.tables.progress_logs[0]).toMatchObject({ completed_at: '2024-03-10T16:00:00.000Z', duration_minutes: null })
  })
})
