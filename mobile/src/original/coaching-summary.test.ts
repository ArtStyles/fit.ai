import { afterEach, describe, expect, it, vi } from 'vitest'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { NodeSqliteDriver } from '../data/__tests__/node-sqlite-driver'
import { createAppStore, setAppStoreForTests } from './storage'
import { createAppClient } from './query'
import { loadClientCoachingSummary as loadCanonical, type ClientCoachingSummaryClient } from '../../../src/lib/coaching/clientSummary'
import type { AppState } from './types'

const bridge = vi.hoisted(() => ({ createConnectedClient: vi.fn() }))
vi.mock('./bridge-client', () => bridge)
const owner = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const trainer = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const drivers: NodeSqliteDriver[] = []
afterEach(async () => { setAppStoreForTests(null); vi.unstubAllGlobals(); vi.clearAllMocks(); for (const driver of drivers.splice(0)) await driver.close() })

async function fixture() {
  const driver = new NodeSqliteDriver(':memory:'); drivers.push(driver)
  const app = await createAppStore(driver); setAppStoreForTests(app)
  const relationship = { id: 'relationship', client_user_id: owner, trainer_user_id: trainer, service_id: 'service', status: 'active', started_at: '2026-09-05T12:00:00Z' }
  const initial: AppState = { version: 1, accountId: owner, remoteUserId: owner, email: 'a@example.invalid', revision: 0, remoteRevision: null, lastSyncedRevision: 0,
    tables: { profiles: [{ id: owner, full_name: 'Ana' }], coaching_relationships: [relationship], public_profiles: [{ id: trainer, full_name: 'Frank' }], trainer_plan_assignments: [{ id: 'assignment', client_user_id: owner, trainer_user_id: trainer, status: 'active' }], measurements: [{ id: 'weight', user_id: owner, weight_kg: 65 }] } }
  await app.create(initial)
  let consent = true
  const remote = createSupabaseClient('https://coaching.invalid', 'public-key', { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: async input => {
    const url = new URL(String(input)); const name = url.pathname.split('/').at(-1)
    const data = name === 'coaching_relationships' ? [relationship] : name === 'coaching_consents' ? (consent ? [{ scope: 'training_profile', revoked_at: null }] : [])
      : name === 'public_profiles' ? [{ id: trainer, full_name: 'Frank' }] : name === 'active_trainer_directory' ? [{ user_id: trainer, slug: 'frank' }]
      : name === 'trainer_plan_assignments' ? initial.tables.trainer_plan_assignments : name === 'get_requestable_trainer_services' ? [{ service_id: 'service', name: 'Entrenamiento personal' }] : []
    return new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json' } })
  } } })
  bridge.createConnectedClient.mockResolvedValue(remote)
  vi.stubGlobal('navigator', { onLine: true })
  const client = createAppClient(app) as unknown as ClientCoachingSummaryClient
  return { app, client, remote, initial, revoke: () => { consent = false } }
}

describe('mobile coaching summary uses verified connected state', () => {
  it('refreshes an incomplete older cache and preserves training data; reuses the complete summary offline', async () => {
    const f = await fixture()
    // Characterize the screenshot: the old local read invents a missing consent.
    expect((await loadCanonical(f.client, owner)).summary?.trainingConsentActive).toBe(false)
    const { loadClientCoachingSummary } = await import('./coaching-summary')
    const result = await loadClientCoachingSummary(f.client, owner)
    expect(result.summary).toMatchObject({ trainingConsentActive: true, serviceName: 'Entrenamiento personal', assignmentCount: 1 })
    expect((await f.app.read())?.tables.measurements).toEqual(f.initial.tables.measurements)
    expect((await f.app.read())?.revision).toBe(0)
    expect(JSON.parse(await f.app.exportBackup()).state).toEqual(f.initial)
    vi.stubGlobal('navigator', { onLine: false })
    expect(await loadClientCoachingSummary(f.client, owner)).toEqual(result)
    expect(bridge.createConnectedClient).toHaveBeenCalledTimes(1)
  })

  it('does not label an unknown cached consent as missing while offline', async () => {
    const f = await fixture(); vi.stubGlobal('navigator', { onLine: false })
    const { loadClientCoachingSummary } = await import('./coaching-summary')
    const result = await loadClientCoachingSummary(f.client, owner)
    expect(result.summary).toBeNull(); expect(result.error).toMatch(/conexión|internet/i)
  })

  it('reflects a real consent revocation on the next connected read', async () => {
    const f = await fixture(); const { loadClientCoachingSummary } = await import('./coaching-summary')
    expect((await loadClientCoachingSummary(f.client, owner)).summary?.trainingConsentActive).toBe(true)
    f.revoke()
    expect((await loadClientCoachingSummary(f.client, owner)).summary?.trainingConsentActive).toBe(false)
  })

  it('discards a connected result received after logout', async () => {
    const f = await fixture(); let release!: () => void; let started!: () => void
    const gate = new Promise<void>(resolve => { release = resolve }); const entered = new Promise<void>(resolve => { started = resolve })
    bridge.createConnectedClient.mockImplementation(async () => { started(); await gate; return f.remote })
    const { loadClientCoachingSummary } = await import('./coaching-summary')
    const pending = loadClientCoachingSummary(f.client, owner)
    await entered; await f.app.deactivate(); release()
    expect((await pending).summary).toBeNull()
    expect(await f.app.read()).toBeNull(); expect((await f.app.list())[0].tables).toEqual(f.initial.tables)
  })
})
