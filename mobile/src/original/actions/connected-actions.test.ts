import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NodeSqliteDriver } from '../../data/__tests__/node-sqlite-driver'
import { createAppStore, setAppStoreForTests, type AppStore, type AppState } from '../storage'
import { createConnectedClient } from '../bridge-client'
import { navigate } from '../router'
import { setPrivacy, updateProfileName } from './settings'
import { deletePlan } from './plan'

vi.mock('../bridge-client', () => ({ createConnectedClient: vi.fn() }))
vi.mock('../router', () => ({ navigate: vi.fn() }))
const id = (n: number) => `10000000-0000-4000-8000-${String(n).padStart(12, '0')}`
let driver: NodeSqliteDriver; let store: AppStore
function initial(linked = true): AppState {
  return { version: 1, accountId: id(1), remoteUserId: linked ? id(1) : null, email: '', revision: 0, remoteRevision: null, lastSyncedRevision: 0, tables: {
    profiles: [{ id: id(1), full_name: 'Antes', is_private: false }],
    workout_plans: [{ id: id(2), user_id: id(1), family_id: id(2), library_slot: 'professional', prescription_locked: true, trainer_assignment_id: id(4), is_active: true, retired_at: null }, { id: id(3), user_id: id(1), family_id: id(3), library_slot: 'personal', prescription_locked: false, is_active: false, retired_at: null, name: 'Mis cambios locales' }],
    trainer_plan_assignments: [{ id: id(4), client_user_id: id(1), status: 'active' }],
    trainer_assignment_versions: [{ id: id(5), assignment_id: id(4), status: 'active', effective_to: null }],
    progress_logs: [{ id: id(6), user_id: id(1), detail: 'history' }],
  } }
}
beforeEach(async () => { vi.clearAllMocks(); driver = new NodeSqliteDriver(':memory:'); store = await createAppStore(driver); setAppStoreForTests(store); await store.create(initial()) })
afterEach(async () => { setAppStoreForTests(null); await driver.close() })
function profileRemote(result: { data: unknown; error: unknown }, onCommit?: () => Promise<void>) {
  const query: any = { update: vi.fn(() => query), eq: vi.fn(() => query), select: vi.fn(() => query), single: vi.fn(async () => { await onCommit?.(); return result }) }
  const client: any = { from: vi.fn(() => query) }; vi.mocked(createConnectedClient).mockResolvedValue(client)
  return { client, query }
}
function retirementRemote(fail = false, beforeReturn?: () => Promise<void>) {
  const retired = '2026-09-09T04:00:00.000Z'
  const values: Record<string, unknown> = {
    workout_plans: [{ id: id(2), user_id: id(1), trainer_assignment_id: id(4), retired_at: retired, is_active: false, superseded_at: null }, { id: id(3), user_id: id(1), trainer_assignment_id: null, retired_at: null, is_active: true, superseded_at: null }],
    trainer_plan_assignments: { id: id(4), client_user_id: id(1), status: 'cancelled' },
    trainer_assignment_versions: [{ id: id(5), assignment_id: id(4), status: 'cancelled', effective_to: retired }],
  }
  const client: any = { rpc: vi.fn(async () => { await beforeReturn?.(); return { data: fail ? null : id(2), error: fail ? { message: 'RPC denied' } : null } }), from: vi.fn((table: string) => {
    const query: any = { select: () => query, eq: () => query, maybeSingle: () => query, then: (resolve: any) => Promise.resolve({ data: values[table], error: null }).then(resolve) }; return query
  }) }
  vi.mocked(createConnectedClient).mockResolvedValue(client); return client
}
describe('canonical account actions from the original offline UI', () => {
  it('requires a verified online account before claiming linked profile privacy changed', async () => {
    vi.mocked(createConnectedClient).mockRejectedValue(new Error('Conecta a internet para usar esta función.'))
    expect(await setPrivacy(true)).toMatchObject({ ok: false, error: expect.stringMatching(/internet/i) })
    expect((await store.read())!.tables.profiles[0].is_private).toBe(false)
    expect(createConnectedClient).toHaveBeenCalledWith(id(1))
  })
  it('updates canonical privacy before local cache and rejects denied or missing writes', async () => {
    const { query } = profileRemote({ data: { id: id(1), is_private: true }, error: null }, async () => { expect((await store.read())!.tables.profiles[0].is_private).toBe(false) })
    expect(await setPrivacy(true)).toEqual({ ok: true })
    expect(query.update).toHaveBeenCalledWith({ is_private: true }); expect(query.eq).toHaveBeenCalledWith('id', id(1))
    expect((await store.read())!.tables.profiles[0].is_private).toBe(true)
    profileRemote({ data: null, error: { message: 'denied' } })
    expect(await setPrivacy(false)).toMatchObject({ ok: false })
    expect((await store.read())!.tables.profiles[0].is_private).toBe(true)
    profileRemote({ data: null, error: null })
    expect(await setPrivacy(false)).toMatchObject({ ok: false })
  })
  it('keeps local-only privacy and name available without internet', async () => {
    const local = initial(false); local.accountId = id(9); local.tables = { profiles: [{ id: id(9), full_name: 'Local', is_private: false }] }; await store.create(local)
    expect(await setPrivacy(true)).toEqual({ ok: true })
    const form = new FormData(); form.set('fullName', 'Local')
    expect(await updateProfileName({ ok: false, message: null, fieldErrors: {} }, form)).toMatchObject({ ok: true })
    expect(createConnectedClient).not.toHaveBeenCalled()
  })
  it('does not attach a completed public-name change to another selected account', async () => {
    profileRemote({ data: { id: id(1), full_name: 'Actualizado' }, error: null }, async () => { const next = initial(); next.accountId = id(9); next.remoteUserId = id(9); next.tables = { profiles: [{ id: id(9), full_name: 'Otra cuenta' }] }; await store.create(next) })
    const form = new FormData(); form.set('fullName', 'Actualizado')
    expect(await updateProfileName({ ok: false, message: null, fieldErrors: {} }, form)).toMatchObject({ ok: false })
    expect((await store.read())!.tables.profiles[0].full_name).toBe('Otra cuenta')
  })
  it('removes professional assignment through its RPC and caches actual lifecycle without deleting history or local edits', async () => {
    const client = retirementRemote(); const form = new FormData(); form.set('planId', id(2)); await deletePlan(form)
    expect(createConnectedClient).toHaveBeenCalledWith(id(1)); expect(client.rpc).toHaveBeenCalledWith('remove_trainer_assignment', { p_plan_id: id(2) })
    expect(navigate).toHaveBeenCalledWith('/plan?notice=plan_retired')
    const state = (await store.read())!
    expect(state.tables.workout_plans[0]).toMatchObject({ is_active: false, retired_at: '2026-09-09T04:00:00.000Z', prescription_locked: true })
    expect(state.tables.workout_plans[1]).toMatchObject({ is_active: true, name: 'Mis cambios locales' })
    expect(state.tables.trainer_plan_assignments[0].status).toBe('cancelled')
    expect(state.tables.trainer_assignment_versions[0].status).toBe('cancelled')
    expect(state.tables.progress_logs).toEqual(initial().tables.progress_logs)
  })
  it('preserves professional plans on connection or RPC failure and reports why', async () => {
    const form = new FormData(); form.set('planId', id(2))
    vi.mocked(createConnectedClient).mockRejectedValue(new Error('Conecta a internet'))
    await deletePlan(form); expect(navigate).toHaveBeenLastCalledWith('/plan?error=connection_required')
    expect((await store.read())!.tables.workout_plans[0].retired_at).toBeNull()
    retirementRemote(true); await deletePlan(form); expect(navigate).toHaveBeenLastCalledWith('/plan?error=save_failed')
    expect((await store.read())!.tables.workout_plans[0].retired_at).toBeNull()
  })
  it('does not mutate another account if it changes during professional removal', async () => {
    retirementRemote(false, async () => { const next = initial(); next.accountId = id(9); next.remoteUserId = id(9); next.tables = { profiles: [{ id: id(9) }] }; await store.create(next) })
    const form = new FormData(); form.set('planId', id(2)); await deletePlan(form)
    expect(navigate).not.toHaveBeenCalledWith('/plan?notice=plan_retired')
    expect((await store.read())!.tables.workout_plans).toBeUndefined()
  })
  it('keeps a confirmed remote cancellation blocked locally if the lifecycle refresh fails', async () => {
    const client = retirementRemote(); client.from.mockImplementation(() => { throw new Error('Connection lost after RPC') })
    const form = new FormData(); form.set('planId', id(2)); await deletePlan(form)
    expect(navigate).toHaveBeenLastCalledWith('/plan?error=assignment_refresh_pending')
    expect((await store.read())!.tables.workout_plans[0]).toMatchObject({ is_active: false, retired_at: expect.any(String) })
    expect((await store.read())!.tables.progress_logs).toEqual(initial().tables.progress_logs)
  })
  it('preserves a different locally selected personal routine when retiring an inactive assignment', async () => {
    await store.mutate(state => { state.tables.workout_plans[0].is_active = false; state.tables.workout_plans.push({ id: id(8), user_id: id(1), family_id: id(8), library_slot: 'personal', prescription_locked: false, retired_at: null, is_active: true }) })
    retirementRemote(); const form = new FormData(); form.set('planId', id(2)); await deletePlan(form)
    expect((await store.read())!.tables.workout_plans.filter(row => row.is_active).map(row => row.id)).toEqual([id(8)])
  })
})
