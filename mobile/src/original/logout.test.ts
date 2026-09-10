import { mkdtempSync, rmdirSync, unlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { NodeSqliteDriver } from '../data/__tests__/node-sqlite-driver'
import { createAppStore, setAppStoreForTests } from './storage'
import { createBoundClient } from './bridge-client'
import { signOut } from './auxiliary-actions'
import { navigate } from './router'
import type { AppState } from './types'

vi.mock('./router', () => ({ navigate: vi.fn(), refresh: vi.fn() }))
vi.mock('./bridge-client', async importOriginal => ({
  ...await importOriginal<typeof import('./bridge-client')>(),
  signOutLocally: vi.fn(async () => {}),
}))

const drivers = new Set<NodeSqliteDriver>()
const directories: string[] = []
afterEach(async () => {
  setAppStoreForTests(null)
  for (const driver of drivers) await driver.close()
  drivers.clear()
  for (const directory of directories.splice(0)) {
    unlinkSync(join(directory, 'state.sqlite'))
    rmdirSync(directory)
  }
  vi.clearAllMocks()
})

function savedState(linked: boolean): AppState {
  const id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
  return {
    version: 1, accountId: id, remoteUserId: linked ? id : null,
    email: linked ? 'ana@example.invalid' : '', revision: 3, lastSyncedRevision: 1, remoteRevision: 'backup-1',
    tables: {
      profiles: [{ id, full_name: 'Ana', onboarding_done: true }],
      workout_plans: [{ id: 'plan-1', user_id: id, name: 'Mi rutina', is_active: true }],
      measurements: [{ id: 'measure-1', user_id: id, weight_kg: 65 }],
    },
  }
}

describe('persistent APK sign out', () => {
  it.each([false, true])('stays signed out after closing and reopening SQLite, preserving linked=%s data', async linked => {
    const directory = mkdtempSync(join(tmpdir(), 'vekira-logout-'))
    directories.push(directory)
    const databasePath = join(directory, 'state.sqlite')
    const driver = new NodeSqliteDriver(databasePath); drivers.add(driver)
    const store = await createAppStore(driver)
    const saved = savedState(linked)
    await store.create(saved)
    setAppStoreForTests(store)

    await signOut()
    await driver.close(); drivers.delete(driver)
    const reopenedDriver = new NodeSqliteDriver(databasePath); drivers.add(reopenedDriver)
    const reopened = await createAppStore(reopenedDriver)
    expect(await reopened.read()).toBeNull()
    expect(await reopened.list()).toEqual([saved])
    expect(navigate).toHaveBeenCalledWith('/login', true)
  })

  it('invalidates an already captured personal client when the profile is signed out', async () => {
    const driver = new NodeSqliteDriver(':memory:'); drivers.add(driver)
    const store = await createAppStore(driver)
    await store.create(savedState(true))
    setAppStoreForTests(store)
    const client = await createBoundClient({ store, remoteClient: null, pathname: '/plan', online: () => false })
    await signOut()
    expect((await client.auth.getUser()).data.user).toBeNull()
    expect((await client.from('workout_plans').select('*')).data).toBeNull()
  })

  it('does not announce a completed logout if its durable commit fails', async () => {
    const driver = new NodeSqliteDriver(':memory:'); drivers.add(driver)
    const store = await createAppStore(driver)
    const saved = savedState(false)
    await store.create(saved)
    setAppStoreForTests(store)
    driver.failNextCommit()
    await expect(signOut()).rejects.toThrow('injected commit failure')
    expect(navigate).not.toHaveBeenCalled()
    expect(await store.read()).toEqual(saved)
  })
})
