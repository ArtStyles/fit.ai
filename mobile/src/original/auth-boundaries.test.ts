import { afterEach, describe, expect, it, vi } from 'vitest'
import { createClient as createSupabaseClient, type SupabaseClient } from '@supabase/supabase-js'
import { NodeSqliteDriver } from '../data/__tests__/node-sqlite-driver'
import { createAppStore } from './storage'
import { AUTH_STORAGE_KEY, createAuthStorage, createBoundClient, signOutLocally } from './bridge-client'
import { createBrowserAuthClient } from './browser-client'
import type { AppState } from './types'

const ownerA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const ownerB = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const drivers: NodeSqliteDriver[] = []
afterEach(async () => { for (const driver of drivers.splice(0)) await driver.close() })
function state(id: string, linked = true): AppState {
  return { version: 1, accountId: id, remoteUserId: linked ? id : null, email: `${id[0]}@example.invalid`, revision: 0, remoteRevision: null, lastSyncedRevision: 0,
    tables: { profiles: [{ id, full_name: id[0] }], workout_plans: [{ id: `plan-${id[0]}`, user_id: id }] } }
}
async function fixture() {
  const driver = new NodeSqliteDriver(':memory:'); drivers.push(driver)
  const store = await createAppStore(driver); await store.create(state(ownerA)); await store.create(state(ownerB)); await store.activate(ownerA)
  let remoteOwner = ownerA
  const user = () => ({ id: remoteOwner, email: 'a@example.invalid' })
  const auth = {
    getSession: vi.fn(async () => ({ data: { session: { access_token: `token-${remoteOwner}`, user: user() } }, error: null })),
    getUser: vi.fn(async () => ({ data: { user: user() }, error: null })),
    signInWithPassword: vi.fn(async () => ({ data: { session: { user: user() }, user: user() }, error: null })),
    verifyOtp: vi.fn(async () => ({ data: { session: { user: user() }, user: user() }, error: null })),
  }
  const fetcher = vi.fn(async () => new Response(JSON.stringify([{ id: 'remote-row' }]), { headers: { 'Content-Type': 'application/json' } }))
  const remoteClient = { auth } as unknown as SupabaseClient
  const options = { store, remoteClient, url: 'https://test.supabase.co', key: 'public-test-key', online: () => true, pathname: '/trainers', fetcher }
  return { store, auth, fetcher, remoteClient, options, switchRemote: (id: string) => { remoteOwner = id } }
}

describe('original application account boundaries', () => {
  it('rejects connected pages when the remote session belongs to another active local account', async () => {
    const f = await fixture(); await f.store.activate(ownerB)
    await expect(createBoundClient(f.options)).rejects.toThrow(/cuenta/i)
    expect(f.fetcher).not.toHaveBeenCalled()
  })

  it('blocks a delayed remote mutation after the local or authenticated account changes', async () => {
    const f = await fixture(); const client = await createBoundClient(f.options)
    const query = client.from('coaching_requests').update({ message: 'change' }).eq('id', 'request')
    await f.store.activate(ownerB)
    const result = await query
    expect(result.error?.message).toMatch(/cuenta/i)
    expect(f.fetcher).not.toHaveBeenCalled()
  })

  it('blocks a delayed RPC if authentication switches while the original local profile stays active', async () => {
    const f = await fixture(); const client = await createBoundClient(f.options)
    const request = client.rpc('create_coaching_request', { message: 'A request' })
    f.switchRemote(ownerB)
    const result = await request
    expect(result.error?.message).toMatch(/cuenta/i)
    expect(f.fetcher).not.toHaveBeenCalled()
  })

  it('pins an accepted request to its verified token and suppresses a response after switching accounts', async () => {
    const f = await fixture()
    f.fetcher.mockImplementationOnce(async (_input?: unknown, init?: RequestInit) => {
      expect(new Headers(init?.headers).get('authorization')).toBe(`Bearer token-${ownerA}`)
      await f.store.activate(ownerB)
      return new Response(JSON.stringify([{ private: 'A-only' }]), { headers: { 'Content-Type': 'application/json' } })
    })
    const client = await createBoundClient(f.options)
    const result = await client.from('coaching_requests').select('*')
    expect(result.data).toBeNull()
    expect(result.error?.message).toMatch(/cuenta/i)
  })

  it('offers a connection requirement for unlinked profiles and preserves offline local query scope', async () => {
    const f = await fixture(); await f.store.create(state('local', false))
    await expect(createBoundClient(f.options)).rejects.toThrow(/inicia sesión/i)
    const client = await createBoundClient({ ...f.options, pathname: '/plan', online: () => false })
    expect((await client.auth.getUser()).data.user?.id).toBe('local')
    await f.store.activate(ownerA)
    expect((await client.from('workout_plans').select('*')).data).toBeNull()
    expect((await client.auth.getUser()).data.user).toBeNull()
  })

  it('returns an auth error with no missing-method exception when login is unconfigured or offline', async () => {
    const f = await fixture()
    const unavailable = createBrowserAuthClient({ remoteClient: null, online: () => true, prepare: vi.fn() })
    expect((await unavailable.auth.signInWithPassword({ email: 'a@example.invalid', password: 'secret' })).error?.message).toMatch(/configurada/i)
    const offline = createBrowserAuthClient({ remoteClient: f.remoteClient, online: () => false, prepare: vi.fn() })
    expect((await offline.auth.verifyOtp({ email: 'a@example.invalid', token: '12345678', type: 'signup' })).error?.message).toMatch(/internet/i)
    expect(f.auth.signInWithPassword).not.toHaveBeenCalled()
    expect(f.auth.verifyOtp).not.toHaveBeenCalled()
  })

  it('turns thrown auth/download errors into handled auth results and waits for local account preparation', async () => {
    const f = await fixture(); const prepare = vi.fn(async () => { throw new Error('Local download failed') })
    const client = createBrowserAuthClient({ remoteClient: f.remoteClient, online: () => true, prepare })
    const result = await client.auth.signInWithPassword({ email: 'a@example.invalid', password: 'secret' })
    expect(prepare).toHaveBeenCalledOnce()
    expect(result.error?.message).toBe('Local download failed')
    f.auth.signInWithPassword.mockRejectedValueOnce(new Error('Network failed'))
    expect((await client.auth.signInWithPassword({ email: 'a@example.invalid', password: 'secret' })).error?.message).toBe('Network failed')
  })

  it('signs out the actual SDK without network, deletes only its own auth keys, and permits explicit reconnection', async () => {
    const values = new Map<string, string>()
    const storage = createAuthStorage({ getItem: key => values.get(key) ?? null, setItem: (key, value) => { values.set(key, value) }, removeItem: key => { values.delete(key) } })
    const user = { id: ownerA, aud: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() }
    storage.setItem(AUTH_STORAGE_KEY, JSON.stringify({ access_token: 'old-token', refresh_token: 'old-refresh', expires_at: Math.floor(Date.now() / 1000) + 3600, token_type: 'bearer', user }))
    storage.setItem(`${AUTH_STORAGE_KEY}-code-verifier`, 'verifier')
    storage.setItem(`${AUTH_STORAGE_KEY}-user`, 'cached-user')
    storage.setItem('unrelated-user-data', 'preserve')
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ access_token: 'new-token', refresh_token: 'new-refresh', expires_in: 3600, token_type: 'bearer', user }), { headers: { 'Content-Type': 'application/json' } }))
    const sdk = createSupabaseClient('https://test.supabase.co', 'public-test-key', { auth: { storage, storageKey: AUTH_STORAGE_KEY, autoRefreshToken: false, detectSessionInUrl: false }, global: { fetch: fetcher } })
    const events: string[] = []
    const subscription = sdk.auth.onAuthStateChange(event => { events.push(event) }).data.subscription
    try {
      expect((await sdk.auth.getSession()).data.session?.user.id).toBe(ownerA)
      await signOutLocally(sdk, storage)
      expect(fetcher).not.toHaveBeenCalled()
      expect((await sdk.auth.getSession()).data.session).toBeNull()
      expect(events).toContain('SIGNED_OUT')
      expect([...values.entries()]).toEqual([['unrelated-user-data', 'preserve']])
      // A refresh completing after sign-out cannot resurrect the old token.
      storage.setItem(AUTH_STORAGE_KEY, 'late-old-session')
      expect(storage.getItem(AUTH_STORAGE_KEY)).toBeNull()
      storage.resume()
      expect((await sdk.auth.signInWithPassword({ email: 'a@example.invalid', password: 'secret' })).error).toBeNull()
      expect((await sdk.auth.getSession()).data.session?.user.id).toBe(ownerA)
      expect(fetcher).toHaveBeenCalledOnce()
    } finally { subscription.unsubscribe(); await sdk.auth.stopAutoRefresh() }
  })
})
