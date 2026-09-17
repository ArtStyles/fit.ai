import { afterEach, describe, expect, it, vi } from 'vitest'
import { NodeSqliteDriver } from '../../data/__tests__/node-sqlite-driver'
import { createAppStore, setAppStoreForTests, type AppState } from '../storage'
import { createPersonalExercise, getPersonalExerciseById, loadPersonalExerciseContext } from './platform'
const route = vi.hoisted(() => ({ connected: false }))
vi.mock('../bridge-client', () => ({ isConnectedRoute: () => route.connected }))
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const drivers: NodeSqliteDriver[] = []
afterEach(async () => { vi.restoreAllMocks(); route.connected = false; setAppStoreForTests(null); for (const driver of drivers.splice(0)) await driver.close() })
async function setup() {
  const state: AppState = { version: 1, accountId: id(1), remoteUserId: null, email: '', revision: 0, remoteRevision: null, lastSyncedRevision: 0, tables: { profiles: [{ id: id(1) }], exercises: [{ id: id(2), name: 'Own', user_id: id(1), is_public: false }] } }
  const driver = new NodeSqliteDriver(':memory:'); drivers.push(driver); const store = await createAppStore(driver); await store.create(state); setAppStoreForTests(store); return store
}
describe('personal platform context', () => {
  it('does not return a personal context or row after navigation to a connected screen', async () => {
    const store = await setup(); const read = store.read
    vi.spyOn(store, 'read').mockImplementation(async () => { const state = await read(); route.connected = true; return state })
    expect(await loadPersonalExerciseContext()).toBeNull()
    route.connected = false
    expect(await getPersonalExerciseById(id(2))).toBeNull()
  })
  it('rechecks local context in the serialized write before creating a row', async () => {
    const store = await setup(); const mutate = store.mutate
    vi.spyOn(store, 'mutate').mockImplementation(fn => { route.connected = true; return mutate(fn) })
    await expect(createPersonalExercise({ accountId: id(1), sessionVersion: store.sessionVersion(), operationId: id(3), name: 'Private', description: '', muscleGroups: [], recording: 'reps', illustration: null })).rejects.toHaveProperty('code', 'account-changed')
    expect((await store.read())!.tables.exercises).toHaveLength(1)
  })
})
