import { afterEach, describe, expect, it, vi } from 'vitest'
import { NodeSqliteDriver } from '../../data/__tests__/node-sqlite-driver'
import { createAppStore, setAppStoreForTests, type AppState } from '../storage'
import { loadExerciseCatalogPage } from './catalog'
const boundary = vi.hoisted(() => ({ connected: false, publicPage: vi.fn(async () => ({ items: [{ id: 'public-only' }] })) }))
vi.mock('../bridge-client', () => ({ isConnectedRoute: () => boundary.connected }))
vi.mock('../../../../src/app/actions/exerciseCatalog', () => ({ loadExerciseCatalogPage: boundary.publicPage }))
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const drivers: NodeSqliteDriver[] = []
afterEach(async () => { setAppStoreForTests(null); boundary.connected = false; boundary.publicPage.mockClear(); for (const driver of drivers.splice(0)) await driver.close() })
async function setup() {
  const state: AppState = { version: 1, accountId: id(1), remoteUserId: null, email: '', revision: 0, remoteRevision: null, lastSyncedRevision: 0, tables: { profiles: [{ id: id(1), language: 'es' }], exercises: [
    ...Array.from({ length: 25 }, (_, i) => ({ id: id(100 + i), name: `Public ${String(i).padStart(2, '0')}`, is_public: true, muscle_groups: ['chest'], equipment: ['barbell'] })),
    { id: id(2), name: 'Mi acción', is_public: false, user_id: id(1), muscle_groups: ['core'], muscle_groups_es: ['Abdomen'], equipment: [], exercise_type: 'flexibility' },
    { id: id(3), name: 'Ajeno', is_public: false, user_id: id(99), muscle_groups: ['neck'] }, { id: id(4), name: 'Retirado', is_public: false, muscle_groups: ['back'] },
  ] } }
  const driver = new NodeSqliteDriver(':memory:'); drivers.push(driver); const store = await createAppStore(driver); await store.create(state); setAppStoreForTests(store); return store
}
describe('personal catalog route boundary', () => {
  it('keeps ordinary and connected public requests on the public service', async () => {
    await setup(); expect(await loadExerciseCatalogPage({})).toEqual({ items: [{ id: 'public-only' }] })
    boundary.connected = true; await loadExerciseCatalogPage({ query: 'press' }); expect(boundary.publicPage).toHaveBeenCalledTimes(2)
  })
  it('requires explicit local personal scope and rejects connected access', async () => {
    await setup(); boundary.connected = true
    await expect(loadExerciseCatalogPage({ includePersonal: true })).rejects.toThrow()
    expect(boundary.publicPage).not.toHaveBeenCalled()
  })
  it('paginates public plus owned rows without leaking private facets and searches accents', async () => {
    await setup()
    const first = await loadExerciseCatalogPage({ includePersonal: true })
    expect(first.total).toBe(26); expect(first.items).toHaveLength(24); expect(first.totalPages).toBe(2)
    expect(first.facets.muscles.map(item => item.value).sort()).toEqual(['chest', 'core'])
    expect((await loadExerciseCatalogPage({ includePersonal: true, page: 2 })).items).toHaveLength(2)
    const personal = await loadExerciseCatalogPage({ includePersonal: true, query: 'accion', muscle: 'core' })
    expect(personal.items).toMatchObject([{ id: id(2), name: 'Mi acción', exerciseType: 'flexibility', personal: true }])
    expect((await loadExerciseCatalogPage({ includePersonal: true, equipment: 'barbell' })).total).toBe(25)
  })
})
