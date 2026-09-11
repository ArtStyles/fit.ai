import { afterEach, describe, expect, it, vi } from 'vitest'
import { createCompanionBackupCoordinator, createCompanionBackupStore } from '../companion-backup'
import { createOriginalSynchronizer } from '../sync'
import type { AppState, AppStore } from '../types'

const owner = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
function state(): AppState { return { version: 1, accountId: owner, remoteUserId: owner, email: '', revision: 2, lastSyncedRevision: 1, remoteRevision: 'old', tables: { profiles: [{ id: owner, timezone: 'UTC' }], progress_logs: [{ id: 'session-1', user_id: owner, completed_at: '2026-09-10T12:00:00Z' }] } } }
function fixture() {
  let current: AppState | null = state(), linked = true, online = true, version = 1
  const synchronize = vi.fn(async (_owner: string, _version: number, _stillCurrent: () => boolean) => { if (current) current.lastSyncedRevision = current.revision; return { pending: false } })
  const updated = vi.fn()
  const coordinator = createCompanionBackupCoordinator({
    read: async () => current, sessionVersion: () => version,
    hasCompanion: async id => linked && current?.accountId === id,
    online: () => online, synchronize, updated,
  })
  return { coordinator, synchronize, updated, get current() { return current }, offline: () => { online = false }, unlink: () => { linked = false }, logout: () => { version++; current = null }, login: () => { current = state() } }
}
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers() })
describe('automatic companion backup policy', () => {
  it('publishes pending training data once for an active companion', async () => {
    const f = fixture(); await f.coordinator.check(); await f.coordinator.check()
    expect(f.synchronize).toHaveBeenCalledExactlyOnceWith(owner, 1, expect.any(Function))
    expect(f.updated).toHaveBeenCalledOnce()
  })
  it.each(['offline', 'unlink', 'logout'] as const)('does not upload when %s', async action => {
    const f = fixture(); f[action](); await f.coordinator.check()
    expect(f.synchronize).not.toHaveBeenCalled()
  })
  it('does not start another upload for unrelated local changes', async () => {
    const f = fixture(); await f.coordinator.check()
    f.current!.revision++; f.current!.tables.measurements = [{ id: 'measurement-1', weight_kg: 70 }]
    await f.coordinator.check()
    expect(f.synchronize).toHaveBeenCalledTimes(1)
  })
  it('backs up goal additions, edits, and removals', async () => {
    const f = fixture(); await f.coordinator.check()
    const goal = { id: 'goal-1', user_id: owner, exercise_id: 'exercise-1', kind: 'strength', target: null, version: 1 }
    f.current!.revision++; f.current!.tables.mobile_exercise_goals = [goal]
    await f.coordinator.check()
    f.current!.revision++; goal.target = { kind: 'strength', weightKg: 60, reps: 10 } as never; goal.version++
    await f.coordinator.check()
    f.current!.revision++; f.current!.tables.mobile_exercise_goals = []
    await f.coordinator.check()
    expect(f.synchronize).toHaveBeenCalledTimes(4)
  })
  it('backs up an edited free session without counting it as a new completion', async () => {
    const f = fixture()
    const log = f.current!.tables.progress_logs[0]
    Object.assign(log, { client_session_id: 'client-session-1', workout_id: null, updated_at: '2026-09-10T12:00:00Z', mobile_free_training: { version: 1 } })
    const completion = [log.id, log.client_session_id, log.completed_at]
    await f.coordinator.check()
    f.current!.revision++
    log.notes = 'Added the missing sets.'
    log.updated_at = '2026-09-10T12:15:00Z'
    await f.coordinator.check()
    expect(f.synchronize).toHaveBeenCalledTimes(2)
    expect(f.current!.lastSyncedRevision).toBe(f.current!.revision)
    expect(f.current!.tables.progress_logs).toHaveLength(1)
    expect([log.id, log.client_session_id, log.completed_at]).toEqual(completion)
  })
  it('retries after reconnect and keeps local changes after an error', async () => {
    const f = fixture(); f.synchronize.mockRejectedValueOnce(new Error('network failure'))
    await f.coordinator.check(); await f.coordinator.check()
    expect(f.current?.revision).toBe(2); expect(f.current?.lastSyncedRevision).toBe(1)
    expect(f.synchronize).toHaveBeenCalledTimes(1)
    await f.coordinator.check(true)
    expect(f.synchronize).toHaveBeenCalledTimes(2)
  })
  it('does not announce a completed upload after logout', async () => {
    const f = fixture(); let release!: () => void
    f.synchronize.mockImplementationOnce(async () => { await new Promise<void>(resolve => { release = resolve }); return { pending: false } })
    const pending = f.coordinator.check()
    await vi.waitFor(() => expect(f.synchronize).toHaveBeenCalledOnce())
    f.logout(); release(); await pending
    expect(f.updated).not.toHaveBeenCalled()
  })
  it('serializes simultaneous signals and picks up a new completed session', async () => {
    const f = fixture(); let release!: () => void
    f.synchronize.mockImplementationOnce(async () => { await new Promise<void>(resolve => { release = resolve }); return { pending: true } })
    const first = f.coordinator.check()
    await vi.waitFor(() => expect(f.synchronize).toHaveBeenCalledOnce())
    f.current!.revision++; f.current!.tables.progress_logs.push({ id: 'session-2', user_id: owner, completed_at: '2026-09-11T12:00:00Z' })
    await f.coordinator.check(); release(); await first
    await vi.waitFor(() => expect(f.synchronize).toHaveBeenCalledTimes(2))
  })
  it('expires a stuck attempt, permits recovery, and ignores its late completion', async () => {
    vi.useFakeTimers()
    const f = fixture(); let release!: () => void
    f.synchronize.mockImplementationOnce(async () => { await new Promise<void>(resolve => { release = resolve }); return { pending: false } })
    const first = f.coordinator.check()
    await vi.advanceTimersByTimeAsync(0)
    expect(f.synchronize).toHaveBeenCalledOnce()
    const stillCurrent = f.synchronize.mock.calls[0][2]
    await vi.advanceTimersByTimeAsync(30_000); await first
    expect(stillCurrent()).toBe(false)
    expect(f.updated).not.toHaveBeenCalled()
    await f.coordinator.check(true)
    expect(f.synchronize).toHaveBeenCalledTimes(2)
    expect(f.updated).toHaveBeenCalledOnce()
    release(); await vi.advanceTimersByTimeAsync(0)
    expect(f.updated).toHaveBeenCalledOnce()
  })
  it('does not block a new login behind the previous account attempt', async () => {
    const f = fixture(); let release!: () => void
    f.synchronize.mockImplementationOnce(async () => { await new Promise<void>(resolve => { release = resolve }); return { pending: false } })
    const first = f.coordinator.check()
    await vi.waitFor(() => expect(f.synchronize).toHaveBeenCalledOnce())
    f.logout(); f.login(); await f.coordinator.check()
    await first
    expect(f.synchronize).toHaveBeenCalledTimes(2)
    expect(f.updated).toHaveBeenCalledOnce()
    release(); await Promise.resolve(); await Promise.resolve()
    expect(f.updated).toHaveBeenCalledOnce()
  })
})

describe('companion backup local store boundary', () => {
  function setup() {
    let version = 1, alive = true, current = state()
    const read = vi.fn(async () => current)
    const mutate = vi.fn(async (fn: (draft: AppState) => unknown) => fn(current))
    const markSynced = vi.fn(async () => {})
    const replaceFromCloud = vi.fn(async () => {})
    const base = { read, mutate, markSynced, replaceFromCloud, sessionVersion: () => version } as unknown as AppStore
    const scoped = createCompanionBackupStore(base, owner, 1, () => alive)
    return { scoped, base, read, mutate, markSynced, replaceFromCloud, get current() { return current }, logoutAndLogin: () => { version++; current = state() }, expire: () => { alive = false } }
  }
  it('rejects a late local read after logout and login as the same owner', async () => {
    const f = setup(); let release!: (value: AppState) => void
    f.read.mockImplementationOnce(() => new Promise(resolve => { release = resolve }))
    const pending = f.scoped.read(); f.logoutAndLogin(); release(f.current)
    await expect(pending).rejects.toThrow('session changed')
  })
  it('guards the queued mutation callback after the preliminary account read', async () => {
    const f = setup(); let release!: () => void
    f.mutate.mockImplementationOnce(async fn => { await new Promise<void>(resolve => { release = resolve }); return fn(f.current) })
    const change = vi.fn((draft: AppState) => { draft.email = 'stale@example.invalid' })
    const pending = f.scoped.mutate(change)
    await vi.waitFor(() => expect(f.mutate).toHaveBeenCalledOnce())
    f.logoutAndLogin(); release()
    await expect(pending).rejects.toThrow('session changed')
    expect(change).not.toHaveBeenCalled(); expect(f.current.email).toBe('')
  })
  it('rejects all later persistence operations once the attempt deadline passes', async () => {
    const f = setup(); f.expire()
    await expect(f.scoped.markSynced(owner, 2, 'new')).rejects.toThrow('session changed')
    await expect(f.scoped.replaceFromCloud(f.current, 2)).rejects.toThrow('session changed')
    expect(f.markSynced).not.toHaveBeenCalled(); expect(f.replaceFromCloud).not.toHaveBeenCalled()
  })
  it('does not merge a downloaded table after an ABA login while the catalog was loading', async () => {
    const f = setup(); let release!: (rows: []) => void
    const catalog = vi.fn(() => new Promise<[]>(resolve => { release = resolve }))
    const gateway = { identity: async () => ({ id: owner, email: '' }), signIn: vi.fn(), readBackup: async () => null,
      downloadWeb: async () => ({ tables: { profiles: [{ id: owner, full_name: 'Old response' }] }, warnings: [] }), pushBackup: vi.fn() }
    const pending = createOriginalSynchronizer(f.scoped, gateway, catalog).synchronize()
    await vi.waitFor(() => expect(catalog).toHaveBeenCalledOnce())
    f.logoutAndLogin(); release([])
    await expect(pending).rejects.toThrow('session changed')
    expect(f.mutate).not.toHaveBeenCalled(); expect(gateway.pushBackup).not.toHaveBeenCalled()
  })
})
