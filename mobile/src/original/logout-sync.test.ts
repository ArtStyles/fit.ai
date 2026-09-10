import { afterEach, describe, expect, it } from 'vitest'
import { NodeSqliteDriver } from '../data/__tests__/node-sqlite-driver'
import { createAppStore } from './storage'
import { createOriginalSynchronizer, type OriginalCloudGateway } from './sync'
import type { AppState } from './types'

const owner = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const drivers: NodeSqliteDriver[] = []
afterEach(async () => { for (const driver of drivers.splice(0)) await driver.close() })

function state(id: string, linked: boolean): AppState {
  return {
    version: 1, accountId: id, remoteUserId: linked ? id : null, email: linked ? 'a@example.invalid' : '',
    revision: 0, remoteRevision: null, lastSyncedRevision: 0,
    tables: { profiles: [{ id, full_name: 'Saved on phone' }], workout_plans: [] },
  }
}

function pauseRequest() {
  let release!: () => void
  let started!: () => void
  const released = new Promise<void>(resolve => { release = resolve })
  const entered = new Promise<void>(resolve => { started = resolve })
  return { entered, release, wait: async () => { started(); await released } }
}

describe('logout during account preparation', () => {
  it.each([
    { account: 'existing', phase: 'identity' },
    { account: 'new', phase: 'download' },
    { account: 'existing', phase: 'signIn' },
    { account: 'new', phase: 'signIn' },
  ] as const)('does not reactivate a $account account when logout interrupts $phase', async ({ account, phase }) => {
    const driver = new NodeSqliteDriver(':memory:'); drivers.push(driver)
    const app = await createAppStore(driver)
    await app.create(state(account === 'existing' ? owner : 'local-profile', account === 'existing'))
    await app.mutate(draft => { draft.tables.profiles[0].full_name = 'Unsynced phone edit' })
    const saved = await app.list()
    const request = pauseRequest()
    const gateway: OriginalCloudGateway = {
      async identity() {
        if (phase === 'identity') await request.wait()
        return { id: owner, email: 'a@example.invalid' }
      },
      async signIn() { if (phase === 'signIn') await request.wait() },
      async downloadWeb() {
        if (phase === 'download') await request.wait()
        return { tables: state(owner, true).tables, warnings: [] }
      },
      async readBackup() { return null },
      async pushBackup() { throw new Error('Preparation must not upload a backup') },
    }
    const synchronizer = createOriginalSynchronizer(app, gateway, async () => [])
    const preparing = phase === 'signIn'
      ? synchronizer.connectAccount('a@example.invalid', 'password')
      : synchronizer.prepareSignedInAccount()
    // Observe rejection immediately so a cancellation cannot become unhandled.
    const finished = preparing.then(() => null, error => error)
    await request.entered
    await app.deactivate()
    request.release()
    expect(await finished).toBeInstanceOf(Error)
    expect(await app.read()).toBeNull()
    expect(await app.list()).toEqual(saved)

    await synchronizer.connectAccount('a@example.invalid', 'password')
    expect((await app.read())?.accountId).toBe(owner)
    const retained = (await app.list()).find(profile => profile.accountId === saved[0].accountId)
    expect(retained?.tables.profiles).toEqual(saved[0].tables.profiles)
    expect(retained?.tables.workout_plans).toEqual(saved[0].tables.workout_plans)
    expect(await app.list()).toHaveLength(account === 'existing' ? 1 : 2)
  })
})
