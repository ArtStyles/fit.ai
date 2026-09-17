import { afterEach, describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { NodeSqliteDriver } from '../data/__tests__/node-sqlite-driver'
import { createAppStore, setAppStoreForTests } from './storage'
import { createBoundClient } from './bridge-client'
import { saveOnboardingAnswers } from './actions/onboarding'
import { defaultAnswers } from '@/app/onboarding/types'
import type { AppState } from './types'

const owner = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const other = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const answers = { ...defaultAnswers, full_name: 'Ana', goal: 'build_muscle', fitness_level: 'beginner', days_per_week: 3, session_duration: 45, gym_type: 'home_basic', equipment: ['dumbbells'], cardio_preferences: ['walking' as const], activity_level: 'insufficiently_active' as const, age: '30', weight_kg: '70', height_cm: '170', gender: 'female' }
const drivers: NodeSqliteDriver[] = []
afterEach(async () => { setAppStoreForTests(null); for (const driver of drivers.splice(0)) await driver.close() })

function state(id = owner): AppState {
  return { version: 1, accountId: id, remoteUserId: id, email: 'member@example.test', revision: 0, remoteRevision: null, lastSyncedRevision: 0,
    tables: { profiles: [{ id, onboarding_done: false, timezone: 'America/Havana', preferred_workout_days: [1, 3, 5], is_admin: true, subscription_tier: 'pro', account_status: 'active', suspended_until: null }] } }
}

async function fixture(completed = true) {
  const driver = new NodeSqliteDriver(':memory:'); drivers.push(driver)
  const store = await createAppStore(driver); setAppStoreForTests(store); await store.create(state())
  if (completed) await saveOnboardingAnswers(answers)
  const canonical = { id: owner, onboarding_done: false, weight_kg: null as number | null }
  const writes: Record<string, unknown>[] = []
  const requests: { url: URL; init?: RequestInit }[] = []
  let fail = false
  let before: (() => Promise<void>) | undefined
  let beforePatch: (() => Promise<void>) | undefined
  let competingCompletion = false
  const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input)); requests.push({ url, init })
    expect(new Headers(init?.headers).get('authorization')).toBe('Bearer owner-token')
    if (before) { const callback = before; before = undefined; await callback() }
    if (!url.pathname.endsWith('/profiles')) return Response.json({ allowed: canonical.onboarding_done })
    if (init?.method === 'PATCH') {
      await beforePatch?.()
      if (fail) return Response.json({ code: '42501', message: 'denied' }, { status: 403 })
      expect(url.searchParams.get('id')).toBe(`eq.${owner}`)
      expect(url.searchParams.get('onboarding_done')).toBe('eq.false')
      if (competingCompletion) { canonical.onboarding_done = true; return Response.json(null) }
      const patch = JSON.parse(String(init.body)); writes.push(patch); Object.assign(canonical, patch)
    }
    const data = { id: canonical.id, onboarding_done: canonical.onboarding_done, weight_kg: canonical.weight_kg }
    return Response.json(new Headers(init?.headers).get('accept')?.includes('vnd.pgrst.object') ? data : [data])
  })
  let remoteOwner = owner
  const remoteClient = { auth: {
    getSession: vi.fn(async () => ({ data: { session: { access_token: 'owner-token', user: { id: remoteOwner } } }, error: null })),
    getUser: vi.fn(async () => ({ data: { user: { id: remoteOwner } }, error: null })),
  } } as unknown as SupabaseClient
  const options = { store, remoteClient, url: 'https://test.supabase.co', key: 'publishable-test-key', pathname: '/coach/apply', online: () => true, fetcher }
  return { store, canonical, writes, requests, options, fetcher, fail: (value: boolean) => { fail = value }, before: (callback: () => Promise<void>) => { before = callback }, beforePatch: (callback: () => Promise<void>) => { beforePatch = callback }, competing: () => { competingCompletion = true }, remoteOwner: (id: string) => { remoteOwner = id } }
}

describe('canonical completion of onboarding saved on Android', () => {
  it('keeps onboarding available offline and synchronizes its allowlist before the first connected RPC', async () => {
    const f = await fixture(); const local = await f.store.read()
    await expect(createBoundClient({ ...f.options, online: () => false })).rejects.toThrow(/internet/i)
    expect(f.fetcher).not.toHaveBeenCalled()
    const client = await createBoundClient(f.options)
    expect(f.canonical.onboarding_done).toBe(true)
    expect(f.writes).toHaveLength(1)
    expect(f.writes[0]).toMatchObject({ full_name: 'Ana', onboarding_done: true, primary_goal: 'build_muscle', weight_kg: 70, height_cm: 170, readiness_status: 'cleared', available_equipment: ['dumbbells'] })
    for (const key of ['id', 'is_admin', 'subscription_tier', 'account_status', 'suspended_until', 'timezone', 'username']) expect(f.writes[0]).not.toHaveProperty(key)
    expect(await f.store.read()).toEqual(local)
    expect((await client.rpc('ensure_trainer_application_draft')).data).toEqual({ allowed: true })
    expect(f.requests.at(-1)?.url.pathname).toContain('/rpc/')
  })

  it('does not touch a remotely completed profile or overwrite local data from its old remote copy', async () => {
    const f = await fixture(); f.canonical.onboarding_done = true; f.canonical.weight_kg = 90
    const local = await f.store.read()
    await createBoundClient(f.options); await createBoundClient(f.options)
    expect(f.writes).toEqual([])
    expect(f.fetcher).toHaveBeenCalledOnce()
    expect(await f.store.read()).toEqual(local)
  })

  it('preserves a weight already derived on the server when completing the remaining onboarding', async () => {
    const f = await fixture(); f.canonical.weight_kg = 81
    await createBoundClient(f.options)
    expect(f.canonical.onboarding_done).toBe(true)
    expect(f.writes[0]).not.toHaveProperty('weight_kg')
    expect(f.canonical.weight_kg).toBe(81)
  })

  it('retains local completion and retries after a denied or failed canonical update', async () => {
    const f = await fixture(); f.fail(true); const local = await f.store.read()
    await expect(createBoundClient(f.options)).rejects.toThrow(/sincronizar/i)
    expect(await f.store.read()).toEqual(local)
    expect(f.canonical.onboarding_done).toBe(false)
    f.fail(false); await createBoundClient(f.options)
    expect(f.canonical.onboarding_done).toBe(true)
    expect(f.writes).toHaveLength(1)
  })

  it('does not complete an unfinished local onboarding and retries once it is actually finished', async () => {
    const f = await fixture(false)
    await createBoundClient(f.options)
    expect(f.fetcher).not.toHaveBeenCalled()
    expect(f.canonical.onboarding_done).toBe(false)
    await saveOnboardingAnswers(answers)
    await createBoundClient(f.options)
    expect(f.canonical.onboarding_done).toBe(true)
  })

  it('blocks account switches, including leaving and returning to the same account, before an update', async () => {
    const f = await fixture()
    f.before(async () => { await f.store.create(state(other)); await f.store.activate(owner) })
    await expect(createBoundClient(f.options)).rejects.toThrow(/cuenta/i)
    expect(f.writes).toEqual([])
    expect(f.canonical.onboarding_done).toBe(false)
  })

  it('does not overwrite a concurrent completion from another device', async () => {
    const f = await fixture(); f.competing()
    await createBoundClient(f.options)
    expect(f.writes).toEqual([])
    expect(f.canonical.onboarding_done).toBe(true)
  })

  it('coalesces simultaneous connected loaders into one canonical onboarding update', async () => {
    const f = await fixture()
    await Promise.all([createBoundClient(f.options), createBoundClient(f.options)])
    expect(f.writes).toHaveLength(1)
  })

  it('rejects a response after an in-flight write when the account changes without touching the new account', async () => {
    const f = await fixture()
    f.beforePatch(async () => { await f.store.create(state(other)); f.remoteOwner(other) })
    await expect(createBoundClient(f.options)).rejects.toThrow(/cuenta/i)
    expect((await f.store.read())?.tables.profiles[0]).toMatchObject({ id: other, onboarding_done: false })
    expect(f.writes).toHaveLength(1)
    expect(f.requests.filter(request => request.init?.method === 'PATCH').every(request => request.url.searchParams.get('id') === `eq.${owner}`)).toBe(true)
  })

  it('refuses invalid locally stored training data and retries after correction', async () => {
    const f = await fixture()
    await f.store.mutate(draft => { draft.tables.profiles[0].fitness_level = 'invalid-level' })
    await expect(createBoundClient(f.options)).rejects.toThrow(/datos iniciales/i)
    expect(f.writes).toEqual([])
    await f.store.mutate(draft => { draft.tables.profiles[0].fitness_level = 'beginner' })
    await createBoundClient(f.options)
    expect(f.canonical.onboarding_done).toBe(true)
  })
})
