import { describe, expect, it } from 'vitest'
import { createCloudWithGateway, type CloudGateway } from '../sync'
import type { MobileAccount, MobileData, MobileRepository, OutboxOperation } from '../../domain/types'

const user = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const account = { id: user, remoteUserId: user, name: 'Ana', profile: {}, createdAt: '2026-09-01', updatedAt: '2026-09-01' } as MobileAccount
const empty = (): MobileData => ({ plans: [], sessions: [], measurements: [], activePlanId: null })
function harness() {
  let operations: OutboxOperation[] = []
  const data = empty()
  let active: string | null = user
  const failures: string[] = []
  const uploads: string[] = []
  const repository = {
    listAccounts: async () => [account], getActiveAccountId: async () => active,
    setActiveAccountId: async (id: string | null) => { active = id },
    pending: async () => operations.slice(), loadData: async () => data,
    acknowledge: async (_: string, id: string) => { operations = operations.filter(o => o.id !== id) },
    recordFailure: async (_: string, __: string, error: string) => { failures.push(error) },
    savePlan: async (plan: MobileData['plans'][number]) => { data.plans = [...data.plans.filter(p => p.id !== plan.id), plan] },
    saveSession: async () => {}, saveMeasurement: async () => {}, saveAccount: async () => {},
    setActivePlan: async (_: string, id: string) => { data.activePlanId = id },
  } as unknown as MobileRepository
  const gateway: CloudGateway = {
    currentUser: async () => user, signIn: async () => account, signOut: async () => {},
    upload: async (op) => { uploads.push(op.id) }, download: async () => ({ ...empty(), account: null }),
    listTrainers: async () => [], listCoaching: async () => ({ requests: [], assignments: [], relationships: [] }),
    requestTrainer: async () => {}, dispose: () => {},
  }
  const enqueue = (id = 'op-1') => operations.push({ id, accountId: user, entityId: 'plan-1', kind: 'plan', payload: { id: 'plan-1', accountId: user }, createdAt: '2026-09-01', attempts: 0, error: null })
  return { repository, gateway, failures, uploads, enqueue, operations: () => operations, data: () => data }
}
describe('account scoped mobile cloud', () => {
  it('allows a local-only profile to sign out without cloud configuration', async () => {
    const h = harness()
    await createCloudWithGateway(h.repository, null).signOut()
    expect(await h.repository.getActiveAccountId()).toBe(user)
  })
  it('rejects the wrong authenticated owner before sending anything', async () => {
    const h = harness(); h.enqueue(); h.gateway.currentUser = async () => 'another-user'
    await expect(createCloudWithGateway(h.repository, h.gateway).sync(user)).rejects.toThrow(/cuenta/i)
    expect(h.uploads).toEqual([]); expect(h.operations()).toHaveLength(1)
  })
  it('keeps stable retry IDs after a response is lost and recovers serial queue', async () => {
    const h = harness(); h.enqueue(); let first = true
    h.gateway.upload = async op => { h.uploads.push(op.id); if (first) { first = false; throw new Error('Conexión perdida') } }
    const cloud = createCloudWithGateway(h.repository, h.gateway)
    await expect(cloud.sync(user)).rejects.toThrow('Conexión perdida')
    expect(h.operations()).toHaveLength(1)
    expect(await cloud.sync(user)).toEqual({ uploaded: 1, downloaded: 0, pending: 0 })
    expect(h.uploads).toEqual(['op-1', 'op-1'])
  })
  it('serializes simultaneous sync calls so one operation is transmitted once', async () => {
    const h = harness(); h.enqueue(); const cloud = createCloudWithGateway(h.repository, h.gateway)
    await Promise.all([cloud.sync(user), cloud.sync(user)])
    expect(h.uploads).toEqual(['op-1'])
  })
  it('retains work and reports missing deployment instead of unsafe fallback', async () => {
    const h = harness(); h.enqueue(); h.gateway.upload = async () => { throw new Error('El respaldo móvil necesita habilitarse en el servidor.') }
    await expect(createCloudWithGateway(h.repository, h.gateway).sync(user)).rejects.toThrow(/habilitarse/)
    expect(h.operations()).toHaveLength(1); expect(h.failures).toHaveLength(1)
  })
  it('still imports assigned plans when mobile backup upload is unavailable', async () => {
    const h = harness(); h.enqueue()
    h.gateway.upload = async () => { throw new Error('Respaldo móvil pendiente de despliegue') }
    h.gateway.download = async () => ({ ...empty(), account: null, plans: [{ id: 'assigned-plan', accountId: user, source: 'trainer', updatedAt: '2026-09-01' } as MobileData['plans'][number]] })
    await expect(createCloudWithGateway(h.repository, h.gateway).sync(user)).rejects.toThrow(/despliegue/)
    expect(h.data().plans.map(p => p.id)).toEqual(['assigned-plan'])
    expect(h.operations()).toHaveLength(1)
  })
  it('does not overwrite a local write arriving while a download is in flight', async () => {
    const h = harness()
    h.gateway.download = async () => { h.enqueue('new-op'); return { ...empty(), account: null, plans: [{ id: 'plan-1', accountId: user, updatedAt: '2026-09-01' } as MobileData['plans'][number]] } }
    await createCloudWithGateway(h.repository, h.gateway).sync(user)
    expect(h.data().plans).toEqual([]); expect(h.operations()).toHaveLength(1)
  })
  it('checks auth again before every upload and does not acknowledge a changed session', async () => {
    const h = harness(); h.enqueue()
    h.gateway.upload = async () => { h.gateway.currentUser = async () => 'changed-user' }
    await expect(createCloudWithGateway(h.repository, h.gateway).sync(user)).rejects.toThrow(/cuenta/i)
    expect(h.operations()).toHaveLength(1)
  })
  it('never accepts a mismatched account in an immutable outbox payload', async () => {
    const h = harness(); h.enqueue(); (h.operations()[0].payload as {accountId: string}).accountId = 'other'
    await expect(createCloudWithGateway(h.repository, h.gateway).sync(user)).rejects.toThrow(/propietario/i)
    expect(h.uploads).toEqual([])
  })
})
