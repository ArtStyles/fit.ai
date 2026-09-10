import { afterEach, describe, expect, it, vi } from 'vitest'
import { NodeSqliteDriver } from '../data/__tests__/node-sqlite-driver'
import type { AppState } from './types'

const backend = vi.hoisted(() => ({
  auth: { signInWithPassword: vi.fn(), verifyOtp: vi.fn(), getUser: vi.fn(), startAutoRefresh: vi.fn() },
  from: vi.fn(), rpc: vi.fn(),
}))
vi.mock('./bridge-client', () => ({ remote: backend, resumeLocalAuthentication: vi.fn() }))

const owner = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const drivers: NodeSqliteDriver[] = []
afterEach(async () => {
  vi.unstubAllGlobals()
  for (const driver of drivers.splice(0)) await driver.close()
})

function pauseRequest() {
  let release!: () => void
  let started!: () => void
  const released = new Promise<void>(resolve => { release = resolve })
  const entered = new Promise<void>(resolve => { started = resolve })
  return { entered, release, wait: async () => { started(); await released } }
}

describe('production browser authentication logout boundary', () => {
  it.each(['password', 'OTP'] as const)('rejects a late %s result after logout and permits a new explicit login', async flow => {
    vi.resetModules()
    vi.resetAllMocks()
    vi.stubGlobal('navigator', { onLine: true })
    const { createAppStore, setAppStoreForTests } = await import('./storage')
    const { createClient } = await import('./browser-client')
    const driver = new NodeSqliteDriver(':memory:'); drivers.push(driver)
    const app = await createAppStore(driver)
    setAppStoreForTests(app)
    const initial: AppState = {
      version: 1, accountId: owner, remoteUserId: owner, email: 'a@example.invalid',
      revision: 0, remoteRevision: null, lastSyncedRevision: 0,
      tables: { profiles: [{ id: owner, full_name: 'Saved on phone' }], workout_plans: [] },
    }
    await app.create(initial)
    await app.mutate(draft => { draft.tables.profiles[0].full_name = 'Unsynced phone edit' })
    const saved = await app.list()
    const request = pauseRequest()
    const user = { id: owner, email: initial.email }
    const authenticate = async () => {
      await request.wait()
      return { data: { user, session: { user, access_token: 'late-access-token' } }, error: null }
    }
    backend.auth.signInWithPassword.mockImplementation(authenticate)
    backend.auth.verifyOtp.mockImplementation(authenticate)
    // A still-available remote identity must not bypass the local logout.
    backend.auth.getUser.mockResolvedValue({ data: { user }, error: null })
    backend.rpc.mockResolvedValue({ data: null, error: null })
    backend.from.mockImplementation((table: string) => {
      const query = {
        select: () => query, eq: () => query, in: () => query, order: () => query,
        range: async () => ({ data: table === 'profiles' ? initial.tables.profiles : [], error: null }),
      }
      return query
    })
    const client = createClient()
    const login = () => flow === 'password'
      ? client.auth.signInWithPassword({ email: initial.email, password: 'password' })
      : client.auth.verifyOtp({ email: initial.email, token: '12345678', type: 'signup' })
    try {
      const pending = login()
      await request.entered
      await app.deactivate()
      request.release()
      const cancelled = await pending
      expect(cancelled.error).not.toBeNull()
      expect(cancelled.data.session).toBeNull()
      expect(backend.auth.getUser).toHaveBeenCalled()
      expect(await app.read()).toBeNull()
      expect(await app.list()).toEqual(saved)
      expect(backend.auth.startAutoRefresh).not.toHaveBeenCalled()

      expect((await login()).error).toBeNull()
      expect((await app.read())?.accountId).toBe(owner)
      expect((await app.read())?.tables.profiles).toEqual(saved[0].tables.profiles)
      expect(backend.auth.startAutoRefresh).toHaveBeenCalledOnce()
    } finally { setAppStoreForTests(null) }
  })
})
