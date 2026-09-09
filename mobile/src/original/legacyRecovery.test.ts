import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { NodeSqliteDriver } from '../data/__tests__/node-sqlite-driver'
import { createAppStore, type AppState } from './storage'
import { recoverOriginalDrafts } from './legacyRecovery'
import { loadBackup, loadActiveSession, saveBackup, type SessionSnapshot } from '@/lib/session/persistSession'

class MemoryStorage implements Storage {
  values = new Map<string, string>()
  get length() { return this.values.size }
  clear() { this.values.clear() }
  getItem(key: string) { return this.values.get(key) ?? null }
  key(index: number) { return [...this.values.keys()][index] ?? null }
  setItem(key: string, value: string) { this.values.set(key, value) }
  removeItem(key: string) { this.values.delete(key) }
}
const id = (n: number) => `10000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const drivers: NodeSqliteDriver[] = []
let local: MemoryStorage
beforeEach(() => { local = new MemoryStorage(); vi.stubGlobal('localStorage', local) })
afterEach(async () => { vi.unstubAllGlobals(); for (const driver of drivers.splice(0)) await driver.close() })
function snapshot(): SessionSnapshot {
  return { userId: id(1), clientSessionId: id(2), workoutId: id(3), workoutName: 'Rutina original', startedAt: Date.now() - 60_000, exercises: [{ workoutExerciseId: id(4), exerciseId: id(6), originalExerciseId: id(5), originalName: 'Sentadilla', name: 'Reemplazo del día', imageUrl: '/local.webp', instructions: 'Controla la bajada', muscleGroups: ['quadriceps'], isCompound: true, targetSets: 2, targetReps: 8, targetDuration: null, restSeconds: 90, targetRpe: 8, suggestedWeight: 20, weightSuggestionBasis: 'based_on_previous_logs', notes: 'Nota original', source: 'replacement', skipReason: null, sets: [{ weightKg: '22.5', reps: '8', rpe: 7, completed: true }, { weightKg: '20', reps: '9', rpe: null, completed: false, durationSeconds: 40 }], status: 'active', expanded: true, hasLastSessionData: true, previousPerformance: [{ weightKg: 20, reps: 7, durationSeconds: 38 }] }] }
}
async function setup() {
  const driver = new NodeSqliteDriver(':memory:'); drivers.push(driver)
  const store = await createAppStore(driver)
  const state: AppState = { version: 1, accountId: id(1), remoteUserId: id(1), email: 'test@example.invalid', revision: 0, remoteRevision: null, lastSyncedRevision: 0, tables: { profiles: [{ id: id(1) }], workouts: [{ id: id(3), user_id: id(1) }], progress_logs: [] } }
  await store.create(state)
  return store
}
describe('original WebView draft recovery', () => {
  it('preserves all original fields in SQLite and original live backup without converting to reduced sessions', async () => {
    const store = await setup(); const full = snapshot(); const raw = { version: 2, ...full, extraLegacyEvidence: { retained: true } }
    const source = structuredClone(raw)
    const result = await recoverOriginalDrafts({ store, isNative: () => true, readSessions: async owner => { expect(owner).toBe(id(1)); return { snapshots: [raw] } } })
    expect(result).toEqual({ recovered: 1, skipped: 0 })
    expect(loadBackup(id(1), id(3))).toEqual(full)
    expect(loadActiveSession(id(1))).toEqual(full)
    const draft = (await store.read())!.tables.session_drafts[0]
    expect(draft.snapshot).toEqual(full)
    expect(draft.original_snapshot).toEqual(source)
    expect(raw).toEqual(source)
    expect((await store.read())!.tables.mobile_sessions).toBeUndefined()
  })
  it('skips another owner and unavailable workouts without creating any live backup', async () => {
    const store = await setup(); const full = snapshot()
    const result = await recoverOriginalDrafts({ store, isNative: () => true, readSessions: async () => ({ snapshots: [{ version: 2, ...full, userId: id(9) }, { version: 2, ...full, workoutId: id(8) }] }) })
    expect(result).toEqual({ recovered: 0, skipped: 2 }); expect(local.length).toBe(0)
    expect((await store.read())!.tables.session_drafts ?? []).toHaveLength(0)
  })
  it('deduplicates repeated extraction and never overwrites a newer local draft or active pointer', async () => {
    const store = await setup(); const full = snapshot(); const reader = async () => ({ snapshots: [{ version: 2, ...full }] })
    expect(await recoverOriginalDrafts({ store, isNative: () => true, readSessions: reader })).toEqual({ recovered: 1, skipped: 0 })
    const newer = { ...full, workoutName: 'Cambios guardados después', exercises: full.exercises.map(exercise => ({ ...exercise, sets: exercise.sets.map(set => ({ ...set, reps: '10' })) })) }
    saveBackup(newer)
    const differentActive = { ...full, workoutId: id(7), clientSessionId: id(8), workoutName: 'Otra sesión activa' }; saveBackup(differentActive)
    expect(await recoverOriginalDrafts({ store, isNative: () => true, readSessions: reader })).toEqual({ recovered: 0, skipped: 1 })
    expect(loadBackup(id(1), id(3))).toEqual(newer)
    expect(loadActiveSession(id(1))).toEqual(differentActive)
    expect((await store.read())!.tables.session_drafts).toHaveLength(1)
  })
  it('does not attach an extracted draft after the selected account changes', async () => {
    const store = await setup(); const full = snapshot()
    let release!: (value: { snapshots: unknown[] }) => void
    const pending = recoverOriginalDrafts({ store, isNative: () => true, readSessions: () => new Promise(resolve => { release = resolve }) })
    while (!release) await Promise.resolve()
    await store.create({ version: 1, accountId: id(9), remoteUserId: id(9), email: '', revision: 0, remoteRevision: null, lastSyncedRevision: 0, tables: { profiles: [{ id: id(9) }], workouts: [{ id: id(3), user_id: id(9) }] } })
    release({ snapshots: [{ version: 2, ...full }] })
    await expect(pending).rejects.toThrow(/cuenta/i)
    expect(local.length).toBe(0)
    expect((await store.read())!.tables.session_drafts).toBeUndefined()
  })
  it('keeps the complete SQLite archive if localStorage fails, allowing a safe retry', async () => {
    const store = await setup(); const full = snapshot(); const reader = async () => ({ snapshots: [{ version: 2, ...full }] })
    const write = vi.spyOn(local, 'setItem').mockImplementationOnce(() => { throw new Error('quota exceeded') })
    await expect(recoverOriginalDrafts({ store, isNative: () => true, readSessions: reader })).rejects.toThrow(/quota/i)
    expect((await store.read())!.tables.session_drafts[0].snapshot).toEqual(full)
    write.mockRestore()
    expect(await recoverOriginalDrafts({ store, isNative: () => true, readSessions: reader })).toEqual({ recovered: 1, skipped: 0 })
    expect((await store.read())!.tables.session_drafts).toHaveLength(1)
  })
  it('revalidates nested archived snapshot ownership before publishing a retry', async () => {
    const store = await setup(); const full = snapshot()
    await store.mutate(state => { state.tables.session_drafts = [{ id: full.clientSessionId, client_session_id: full.clientSessionId, user_id: id(1), workout_id: id(3), source: 'legacy_webview', published_at: null, snapshot: { ...full, userId: id(9) } }] })
    expect(await recoverOriginalDrafts({ store, isNative: () => true, readSessions: async () => ({ snapshots: [{ version: 2, ...full }] }) })).toEqual({ recovered: 0, skipped: 1 })
    expect(local.length).toBe(0)
  })
  it('archives expired unfinished drafts intact without activating or renewing them', async () => {
    const store = await setup(); const full = { ...snapshot(), startedAt: Date.now() - 13 * 60 * 60 * 1000 }
    const raw = { version: 2, ...full, legacyEvidence: 'preserve' }
    const reader = async () => ({ snapshots: [raw] })
    expect(await recoverOriginalDrafts({ store, isNative: () => true, readSessions: reader })).toEqual({ recovered: 1, skipped: 0 })
    const archive = (await store.read())!.tables.session_drafts[0]
    expect(archive.snapshot).toEqual(full)
    expect(archive.original_snapshot).toEqual(raw)
    expect(archive.archived_only).toBe(true)
    expect(local.length).toBe(0)
    expect((await store.read())!.tables.session_authorizations ?? []).toHaveLength(0)
    expect(await recoverOriginalDrafts({ store, isNative: () => true, readSessions: reader })).toEqual({ recovered: 0, skipped: 1 })
    expect((await store.read())!.tables.session_drafts).toHaveLength(1)
  })
})
