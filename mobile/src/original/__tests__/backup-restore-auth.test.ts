import { afterEach, describe, expect, it } from 'vitest'
import { NodeSqliteDriver } from '../../data/__tests__/node-sqlite-driver'
import { createAppStore } from '../storage'
import { createBackupRestoreController, backupErrorMessage } from '../backup-restore'
import type { AppState } from '../types'

const drivers: NodeSqliteDriver[] = []
afterEach(async () => { for (const driver of drivers.splice(0)) await driver.close() })
const state = (id: string): AppState => ({ version: 1, accountId: id, remoteUserId: id, email: `${id}@example.test`, revision: 0, lastSyncedRevision: 0, remoteRevision: null, tables: { profiles: [{ id }] } })
async function fixture() {
  const driver = new NodeSqliteDriver(':memory:'); drivers.push(driver)
  const store = await createAppStore(driver); await store.create(state('a'))
  const backup = JSON.stringify({ format: 'vekira-original-app-backup', version: 1, state: { ...state('a'), tables: { profiles: [{ id: 'a', full_name: 'Restored' }] } } })
  return { store, backup }
}

describe('authenticated restore controller', () => {
  it('requires the verified remote identity to match the local account before preview and again before replacement', async () => {
    const { store, backup } = await fixture()
    let remoteOwner = 'b'
    const controller = createBackupRestoreController(store, async () => remoteOwner)
    await expect(controller.preview(backup)).rejects.toThrow(/session/)
    remoteOwner = 'a'; const preview = await controller.preview(backup)
    remoteOwner = 'b'; await expect(controller.restore(preview, true)).rejects.toThrow(/session/)
    expect(await store.read()).toEqual(state('a'))
    remoteOwner = 'a'; await controller.restore(preview, true)
    expect((await store.read())?.tables.profiles[0].full_name).toBe('Restored')
  })

  it('does not confirm if the active account changes while remote identity verification is pending', async () => {
    const { store, backup } = await fixture()
    const controller = createBackupRestoreController(store, async () => 'a')
    const preview = await controller.preview(backup)
    let release!: (id: string) => void, started!: () => void
    const entered = new Promise<void>(resolve => { started = resolve })
    const delayed = createBackupRestoreController(store, () => { started(); return new Promise(resolve => { release = resolve }) })
    const result = delayed.restore(preview, true).then(() => null, error => error)
    await entered; await store.create(state('b')); await store.activate('a'); release('a')
    expect(await result).toBeInstanceOf(Error)
    expect(await store.read()).toEqual(state('a'))
  })

  it('turns connection failures into readable Spanish and English without exposing raw database errors', async () => {
    const { store, backup } = await fixture()
    const controller = createBackupRestoreController(store, async () => { throw new Error('private low-level error') })
    const failure = await controller.preview(backup).catch(error => error)
    expect(backupErrorMessage(failure, 'es')).toMatch(/sesión/)
    expect(backupErrorMessage(failure, 'en')).toMatch(/sign in/i)
    expect(backupErrorMessage(new Error('SQLITE_FULL private details'), 'es')).not.toMatch(/SQLITE|private/)
    expect(await store.read()).toEqual(state('a'))
  })
})
