import { afterEach, describe, expect, it } from 'vitest'
import { NodeSqliteDriver } from '../../data/__tests__/node-sqlite-driver'
import { createAppStore, type AppState } from '../storage'
import { createPersonalExerciseService } from './data'
import type { PersonalExerciseInput } from '@/lib/exercises/personal-types'

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const drivers: NodeSqliteDriver[] = []
afterEach(async () => { for (const driver of drivers.splice(0)) await driver.close() })
function fixture(accountId = id(1)): AppState {
  return { version: 1, accountId, remoteUserId: null, email: '', revision: 0, remoteRevision: null, lastSyncedRevision: 0, tables: { profiles: [{ id: accountId, language: 'es' }], exercises: [{ id: id(2), name: 'Catalog', is_public: true }] } }
}
async function setup() { const driver = new NodeSqliteDriver(':memory:'); drivers.push(driver); const store = await createAppStore(driver); await store.create(fixture()); return { store, service: createPersonalExerciseService(store) } }
function input(sessionVersion: number, overrides: Partial<PersonalExerciseInput> = {}): PersonalExerciseInput { return { accountId: id(1), sessionVersion, operationId: id(3), name: ' Mi ejercicio ', description: '', muscleGroups: [], recording: 'reps', illustration: null, ...overrides } }

describe('personal exercises private storage', () => {
  it('creates an optional-media exercise atomically, preserves public rows, and replays once across reopening', async () => {
    const { store, service } = await setup(); const original = (await store.read())!.tables.exercises[0]
    const context = await service.loadContext(); expect(context).toEqual({ accountId: id(1), sessionVersion: store.sessionVersion(), language: 'es' })
    const request = input(context!.sessionVersion)
    const [first, retry] = await Promise.all([service.create(request), service.create(request)])
    expect(first).toEqual(retry)
    expect(first).toMatchObject({ id: id(3), name: 'Mi ejercicio', muscleGroups: [], imageUrl: null, exerciseType: 'strength' })
    const state = (await store.read())!
    expect(state.revision).toBe(1); expect(state.tables.exercises).toHaveLength(2); expect(state.tables.exercises[0]).toEqual(original)
    expect(state.tables.exercises[1]).toMatchObject({ user_id: id(1), is_public: false, description: null, instructions: null, image_url: null, source: 'mobile-personal' })
    expect(JSON.parse(await store.exportBackup()).state.tables.exercises).toEqual(state.tables.exercises)
    await store.deactivate(); await store.activate(id(1))
    expect(await service.create({ ...request, sessionVersion: store.sessionVersion() })).toEqual(first)
    expect((await store.read())!.revision).toBe(1)
  })
  it('retains the real description, timing mode, and only a chosen matching anatomy illustration', async () => {
    const { store, service } = await setup()
    const result = await service.create(input(store.sessionVersion(), { description: '  Descripción personal  ', recording: 'time', muscleGroups: ['core'], illustration: 'core' }))
    expect(result).toMatchObject({ exerciseType: 'flexibility', imageUrl: '/exercises/personal/core.svg' })
    expect(await service.getById(result.id)).toMatchObject({ name: 'Mi ejercicio', description: 'Descripción personal', instructions: null, video_url: null, motion_preview_url: null, muscle_groups: ['core'] })
  })
  it.each([{ name: '' }, { name: 'x'.repeat(121) }, { description: 'x'.repeat(2001) }, { recording: 'cardio' }, { muscleGroups: ['invented'] }, { muscleGroups: Array(19).fill('core') }, { illustration: 'core' }, { muscleGroups: ['rotator_cuff'], illustration: 'rotator_cuff' }, { operationId: 'invalid' }])('rejects malformed input without changing any row: %j', async bad => {
    const { store, service } = await setup(); const before = await store.read()
    await expect(service.create(input(store.sessionVersion(), bad as Partial<PersonalExerciseInput>))).rejects.toHaveProperty('code')
    expect(await store.read()).toEqual(before)
  })
  it('rejects account changes, logout/relogin, changed retry payloads and collisions with catalog ids', async () => {
    const { store, service } = await setup(); const request = input(store.sessionVersion())
    await service.create(request)
    await expect(service.create({ ...request, name: 'Another' })).rejects.toThrow()
    await expect(service.create({ ...request, operationId: id(2) })).rejects.toThrow()
    await store.deactivate(); await store.activate(id(1))
    await expect(service.create(request)).rejects.toThrow()
    await store.create(fixture(id(99)))
    await expect(service.create({ ...request, sessionVersion: store.sessionVersion() })).rejects.toThrow()
    expect(await service.getById(id(3))).toBeNull()
    await store.deactivate(); expect(await service.loadContext()).toBeNull()
  })
  it('does not return another account or ownerless private exercise from a mixed backup', async () => {
    const { store, service } = await setup()
    await store.mutate(state => state.tables.exercises.push({ id: id(40), is_public: false, user_id: id(99), name: 'Foreign' }, { id: id(41), is_public: false, name: 'Retired' }))
    expect(await service.getById(id(40))).toBeNull(); expect(await service.getById(id(41))).toBeNull(); expect(await service.getById(id(2))).toBeNull()
  })
  it('rechecks the captured session inside the serialized write', async () => {
    const { store } = await setup(); const version = store.sessionVersion()
    const service = createPersonalExerciseService({ ...store, async mutate(fn) { await store.deactivate(); await store.activate(id(1)); return store.mutate(fn) } })
    await expect(service.create(input(version))).rejects.toHaveProperty('code', 'account-changed')
    expect((await store.read())!.tables.exercises).toHaveLength(1)
  })
})
