import { afterEach, describe, expect, it, vi } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { NodeSqliteDriver } from '../../data/__tests__/node-sqlite-driver'
import { createAppStore } from '../storage'
import type { AppState } from '../types'

const drivers: NodeSqliteDriver[] = []
const directories: string[] = []
afterEach(async () => {
  vi.restoreAllMocks()
  for (const driver of drivers.splice(0)) await driver.close()
  for (const directory of directories.splice(0)) await rm(directory, { recursive: true, force: true })
})
function state(id = 'account-a', restored = false): AppState {
  return { version: 1, accountId: id, remoteUserId: id, email: restored ? 'backup@example.test' : 'current@example.test', revision: restored ? 12 : 2,
    remoteRevision: restored ? 'old-cloud' : 'current-cloud', lastSyncedRevision: restored ? 12 : 2,
    tables: {
      profiles: [{ id, full_name: restored ? 'Backup profile' : 'Fresh login' }],
      measurements: restored ? [{ id: 'm1', user_id: id, weight_kg: 65 }] : [],
      progress_logs: restored ? [{ id: 's1', user_id: id, completed_at: '2026-09-10', session_context_snapshot: { name: 'Historical snapshot' } }] : [],
      exercise_logs: restored ? [{ id: 'e1', progress_log_id: 's1', weights_kg: [12, 14], reps_completed: [10, 8] }] : [],
    } }
}
function backup(input = state('account-a', true)) { return JSON.stringify({ format: 'vekira-original-app-backup', version: 1, exportedAt: '2026-09-10T10:00:00.000Z', state: input }) }
async function fixture(path = ':memory:') {
  const driver = new NodeSqliteDriver(path); drivers.push(driver)
  const store = await createAppStore(driver); await store.create(state())
  return { driver, store }
}

describe('explicit account backup restoration', () => {
  it('previews reinstall/login differences without writing, restores complete rows and keeps a durable undo copy after restart', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'vekira-restore-')); directories.push(directory)
    const { driver, store } = await fixture(join(directory, 'state.sqlite'))
    await expect(store.importBackup(backup())).rejects.toThrow(/conflict/i)
    const preview = await store.previewBackupRestore(backup())
    expect(preview).toMatchObject({ accountId: 'account-a', source: 'file', current: { sessions: 0, measurements: 0 }, incoming: { sessions: 1, measurements: 1 } })
    expect(await store.read()).toEqual(state())
    expect(await store.readBackupRecovery()).toBeNull()
    await store.restoreBackup(preview.token, true)
    expect(await store.read()).toEqual({ ...state('account-a', true), email: 'current@example.test', revision: 13, remoteRevision: 'current-cloud', lastSyncedRevision: 2 })
    await driver.close(); drivers.splice(drivers.indexOf(driver), 1)
    const reopenedDriver = new NodeSqliteDriver(join(directory, 'state.sqlite')); drivers.push(reopenedDriver)
    const reopened = await createAppStore(reopenedDriver)
    expect(JSON.parse(await reopened.exportRecoveryBackup()).state).toEqual(state())
    const recovery = await reopened.previewRecoveryRestore()
    await reopened.restoreBackup(recovery.token, true)
    expect(await reopened.read()).toEqual({ ...state(), revision: 14 })
    expect(JSON.parse(await reopened.exportRecoveryBackup()).state.tables).toEqual(state('account-a', true).tables)
  })

  it('rejects missing confirmation and cancellation without replacing data or creating a recovery copy', async () => {
    const { store } = await fixture()
    const preview = await store.previewBackupRestore(backup())
    await expect(store.restoreBackup(preview.token, false)).rejects.toThrow(/confirm/i)
    store.cancelBackupRestore(preview.token)
    await expect(store.restoreBackup(preview.token, true)).rejects.toThrow(/preview/i)
    expect(await store.read()).toEqual(state())
    expect(await store.readBackupRecovery()).toBeNull()
  })

  it('rejects another owner in both default import and explicit restore', async () => {
    const { store } = await fixture()
    await expect(store.importBackup(backup(state('account-b', true)))).rejects.toThrow(/owner/i)
    await expect(store.previewBackupRestore(backup(state('account-b', true)))).rejects.toThrow(/owner/i)
    expect(await store.list()).toEqual([state()])
  })

  it.each(['{broken', JSON.stringify({ format: 'other', version: 1 }), backup({ ...state('account-a', true), tables: { profiles: [{ id: 'account-b' }] } })])('rejects malformed or forged backup %s', async json => {
    const { store } = await fixture()
    await expect(store.previewBackupRestore(json)).rejects.toThrow()
    expect(await store.read()).toEqual(state())
  })

  it.each<AppState['tables']>([
    {},
    { profiles: [] },
    { profiles: [{ id: 'account-a' }], workouts: [{ id: 'orphan', user_id: 'account-a', plan_id: 'missing' }] },
    { profiles: [{ id: 'account-a' }], measurements: [{ user_id: 'account-a', weight_kg: 60 }] },
  ])('rejects incomplete or incoherent backup tables without replacing data: %j', async tables => {
    const { store } = await fixture()
    await expect(store.previewBackupRestore(backup({ ...state(), tables }))).rejects.toThrow(/invalid/i)
    expect(await store.read()).toEqual(state())
    expect(await store.readBackupRecovery()).toBeNull()
  })

  it('accepts an older valid backup without optional tables and ignores its web merge metadata', async () => {
    const { store } = await fixture()
    const incoming = { ...state(), tables: { profiles: [{ id: 'account-a', full_name: 'Legacy' }], mobile_web_base: [{ id: 'canonical', tables: 'untrusted' }] } }
    const preview = await store.previewBackupRestore(backup(incoming))
    await store.restoreBackup(preview.token, true)
    expect((await store.read())?.tables).toEqual({ profiles: incoming.tables.profiles })
  })

  it('requires a linked active account and rejects logout and local edits after preview', async () => {
    const { store } = await fixture()
    const preview = await store.previewBackupRestore(backup())
    await store.mutate(draft => { draft.tables.measurements.push({ id: 'new', user_id: draft.accountId, weight_kg: 70 }) })
    await expect(store.restoreBackup(preview.token, true)).rejects.toThrow(/stale/i)
    expect((await store.read())?.tables.measurements[0].weight_kg).toBe(70)
    const logoutPreview = await store.previewBackupRestore(backup())
    await store.deactivate(); await store.activate('account-a')
    await expect(store.restoreBackup(logoutPreview.token, true)).rejects.toThrow()
    await store.deactivate()
    await expect(store.previewBackupRestore(backup())).rejects.toThrow(/session/i)
    const local = { ...state('local'), remoteUserId: null }; await store.create(local)
    await expect(store.previewBackupRestore(backup(local))).rejects.toThrow(/session/i)
  })

  it('invalidates preview after switching away and back or after cloud metadata changes', async () => {
    const { store } = await fixture()
    const preview = await store.previewBackupRestore(backup())
    await store.create(state('account-b')); await store.activate('account-a')
    await expect(store.restoreBackup(preview.token, true)).rejects.toThrow()
    const second = await store.previewBackupRestore(backup())
    await store.markSynced('account-a', 2, 'new-cloud')
    await expect(store.restoreBackup(second.token, true)).rejects.toThrow(/stale/i)
    expect((await store.read())?.remoteRevision).toBe('new-cloud')
  })

  it.each(['recovery-write', 'replacement-write', 'commit'])('rolls back %s failure and retains original state and previous recovery', async failure => {
    const { driver, store } = await fixture()
    const first = await store.previewBackupRestore(backup()); await store.restoreBackup(first.token, true)
    const before = await store.read(), recovery = await store.exportRecoveryBackup()
    const next = await store.previewBackupRestore(backup(state()))
    const execute = driver.execute.bind(driver)
    vi.spyOn(driver, 'execute').mockImplementation(async (sql, parameters) => {
      if (failure === 'recovery-write' && parameters?.[0] === 'backup-recovery:account-a') throw new Error('injected storage failure')
      if (failure === 'replacement-write' && sql.startsWith('INSERT INTO original_app_accounts')) throw new Error('injected storage failure')
      return execute(sql, parameters)
    })
    if (failure === 'commit') driver.failNextCommit()
    await expect(store.restoreBackup(next.token, true)).rejects.toThrow()
    expect(await store.read()).toEqual(before)
    expect(await store.exportRecoveryBackup()).toBe(recovery)
  })

  it('rolls back restoration when logout begins during SQLite replacement', async () => {
    const { driver, store } = await fixture()
    const preview = await store.previewBackupRestore(backup())
    let release!: () => void, started!: () => void
    const pause = new Promise<void>(resolve => { release = resolve }), entered = new Promise<void>(resolve => { started = resolve })
    const execute = driver.execute.bind(driver)
    vi.spyOn(driver, 'execute').mockImplementation(async (sql, parameters) => {
      const result = await execute(sql, parameters)
      if (sql.startsWith('INSERT INTO original_app_accounts')) { started(); await pause }
      return result
    })
    const restoring = store.restoreBackup(preview.token, true).then(() => null, error => error)
    await entered
    const logout = store.deactivate(); release()
    expect(await restoring).toBeInstanceOf(Error); await logout
    expect(await store.list()).toEqual([state()])
    await store.activate('account-a'); expect(await store.readBackupRecovery()).toBeNull()
  })
})

describe('guarded removal after remote account deletion', () => {
  it('deletes only the confirmed account, its cache and recovery copy durably', async () => {
    const { driver, store } = await fixture()
    await store.setAccountCache('summary', { private: 'a' }, store.sessionVersion(), 'account-a')
    const preview = await store.previewBackupRestore(backup()); await store.restoreBackup(preview.token, true)
    await store.create(state('account-b'))
    await store.setAccountCache('summary', { private: 'b' }, store.sessionVersion(), 'account-b')
    await store.activate('account-a')
    const previousSession = store.sessionVersion()
    await store.removeAccount('account-a', previousSession)
    expect(store.sessionVersion()).toBeGreaterThan(previousSession)
    const reopened = await createAppStore(driver)
    expect(await reopened.read()).toBeNull(); expect(await reopened.list()).toEqual([state('account-b')])
    expect(await driver.query('SELECT key FROM original_app_settings WHERE key IN (?, ?)', ['cache:account-a:summary', 'backup-recovery:account-a'])).toEqual([])
    await reopened.activate('account-b'); expect(await reopened.getAccountCache('summary', 'account-b')).toEqual({ private: 'b' })
  })

  it('preserves every account on wrong owner, stale session, switch away/back and commit failure', async () => {
    const { driver, store } = await fixture()
    const session = store.sessionVersion()
    await expect(store.removeAccount('account-b', session)).rejects.toThrow()
    await store.create(state('account-b')); await store.activate('account-a')
    await expect(store.removeAccount('account-a', session)).rejects.toThrow()
    driver.failNextCommit()
    await expect(store.removeAccount('account-a', store.sessionVersion())).rejects.toThrow()
    expect(await store.list()).toEqual([state(), state('account-b')]); expect(await store.read()).toEqual(state())
  })
})
