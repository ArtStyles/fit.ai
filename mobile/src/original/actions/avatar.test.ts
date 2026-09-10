import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NodeSqliteDriver } from '../../data/__tests__/node-sqlite-driver'
import { createAppStore, setAppStoreForTests, type AppState, type AppStore } from '../storage'
import { createConnectedClient } from '../bridge-client'
import { removeAvatar, updateAvatar } from './avatar'

vi.mock('../bridge-client', () => ({ createConnectedClient: vi.fn() }))
const id = (n: number) => `10000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const oldUrl = 'https://example.test/old.webp?v=1'
let driver: NodeSqliteDriver
let store: AppStore
function initial(linked = true, owner = id(1)): AppState {
  const profile = { id: owner, avatar_url: oldUrl, full_name: 'Cuenta de prueba' }
  return { version: 1, accountId: owner, remoteUserId: linked ? owner : null, email: '', revision: 0, remoteRevision: null, lastSyncedRevision: 0,
    tables: { profiles: [profile], mobile_web_base: [{ id: 'canonical', tables: { profiles: [{ ...profile }] } }] } }
}
function photo(type = 'image/webp', data = 'photo') {
  const form = new FormData()
  form.set('file', new File([data], 'avatar.webp', { type }))
  return form
}
function remote({ failUpload = false, failRemove = false, failProfile = false, missing = false, wrongOwner = false, afterUpload, afterProfile }: {
  failUpload?: boolean; failRemove?: boolean; failProfile?: boolean; missing?: boolean; wrongOwner?: boolean;
  afterUpload?: () => Promise<unknown>; afterProfile?: () => Promise<unknown>
} = {}) {
  let update: Record<string, unknown> = {}
  const query: any = {
    update: vi.fn((value: Record<string, unknown>) => { update = value; return query }), eq: vi.fn(() => query), select: vi.fn(() => query),
    single: vi.fn(async () => { await afterProfile?.(); return { data: missing ? null : { id: wrongOwner ? id(9) : id(1), ...update }, error: failProfile ? { message: 'denied' } : null } }),
  }
  const storage = {
    upload: vi.fn(async () => { await afterUpload?.(); return { data: {}, error: failUpload ? { message: 'denied' } : null } }),
    remove: vi.fn(async () => ({ data: [], error: failRemove ? { message: 'denied' } : null })),
    getPublicUrl: vi.fn(() => ({ data: { publicUrl: `https://example.test/avatars/${id(1)}/avatar.webp` } })),
  }
  const client: any = { storage: { from: vi.fn(() => storage) }, from: vi.fn(() => query) }
  vi.mocked(createConnectedClient).mockResolvedValue(client)
  return { client, storage, query }
}
beforeEach(async () => { vi.clearAllMocks(); driver = new NodeSqliteDriver(':memory:'); store = await createAppStore(driver); setAppStoreForTests(store); await store.create(initial()) })
afterEach(async () => { setAppStoreForTests(null); await driver.close() })

describe('Android profile photo actions', () => {
  it('confirms the connected profile before persisting the photo and its sync base', async () => {
    const api = remote({ afterProfile: async () => expect((await store.read())!.tables.profiles[0].avatar_url).toBe(oldUrl) })
    const result = await updateAvatar(photo())
    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error(result.error)
    expect(createConnectedClient).toHaveBeenCalledWith(id(1))
    expect(api.storage.upload).toHaveBeenCalledWith(`${id(1)}/avatar.webp`, expect.any(File), expect.objectContaining({ upsert: true, contentType: 'image/webp' }))
    expect(api.query.eq).toHaveBeenCalledWith('id', id(1))
    expect(result.url).toContain(`/avatars/${id(1)}/avatar.webp?v=`)
    const saved = (await store.read())!
    expect(saved.tables.profiles[0].avatar_url).toBe(result.url)
    expect(saved.tables.mobile_web_base[0].tables.profiles[0].avatar_url).toBe(result.url)
    const reloaded = await createAppStore(driver)
    expect((await reloaded.read())!.tables.profiles[0].avatar_url).toBe(result.url)
  })
  it.each([{ failUpload: true }, { failProfile: true }, { missing: true }, { wrongOwner: true }])('does not claim an unconfirmed online change (%j)', async options => {
    remote(options)
    expect(await updateAvatar(photo())).toMatchObject({ ok: false })
    expect((await store.read())!.tables.profiles[0].avatar_url).toBe(oldUrl)
    expect((await store.read())!.revision).toBe(0)
  })
  it('reports missing connection and preserves the previous photo', async () => {
    vi.mocked(createConnectedClient).mockRejectedValue(new Error('Conecta a internet para usar esta función.'))
    expect(await updateAvatar(photo())).toMatchObject({ ok: false, error: expect.stringMatching(/internet/) })
    expect((await store.read())!.tables.profiles[0].avatar_url).toBe(oldUrl)
  })
  it.each(['upload', 'profile'])('never attaches an in-flight %s to a different account', async phase => {
    const switchAccount = async () => store.create(initial(true, id(9)))
    remote(phase === 'upload' ? { afterUpload: switchAccount } : { afterProfile: switchAccount })
    expect(await updateAvatar(photo())).toMatchObject({ ok: false })
    expect((await store.read())!.accountId).toBe(id(9))
    expect((await store.read())!.tables.profiles[0].avatar_url).toBe(oldUrl)
  })
  it('stores and removes a local-only photo without contacting the server', async () => {
    await store.create(initial(false, id(9)))
    expect(await updateAvatar(photo())).toEqual({ ok: true, url: 'data:image/webp;base64,cGhvdG8=' })
    const reopened = await createAppStore(driver)
    expect((await reopened.read())!.tables.profiles[0].avatar_url).toBe('data:image/webp;base64,cGhvdG8=')
    expect(await removeAvatar()).toEqual({ ok: true })
    expect((await store.read())!.tables.profiles[0].avatar_url).toBeNull()
    expect(createConnectedClient).not.toHaveBeenCalled()
  })
  it.each([new FormData(), photo('text/plain'), photo('image/webp', ''), photo('image/svg+xml')])('rejects invalid input without side effects', async form => {
    expect(await updateAvatar(form)).toMatchObject({ ok: false })
    expect(createConnectedClient).not.toHaveBeenCalled()
    expect((await store.read())!.revision).toBe(0)
  })
  it('removes the connected photo and updates both local and sync state', async () => {
    const api = remote()
    expect(await removeAvatar()).toEqual({ ok: true })
    expect(api.storage.remove).toHaveBeenCalledWith([`${id(1)}/avatar.webp`])
    expect(api.query.update).toHaveBeenCalledWith({ avatar_url: null })
    const saved = (await store.read())!
    expect(saved.tables.profiles[0].avatar_url).toBeNull()
    expect(saved.tables.mobile_web_base[0].tables.profiles[0].avatar_url).toBeNull()
  })
  it.each([{ failRemove: true }, { failProfile: true }, { missing: true }])('preserves local state when deletion is not confirmed (%j)', async options => {
    remote(options)
    expect(await removeAvatar()).toMatchObject({ ok: false })
    expect((await store.read())!.tables.profiles[0].avatar_url).toBe(oldUrl)
  })
})
