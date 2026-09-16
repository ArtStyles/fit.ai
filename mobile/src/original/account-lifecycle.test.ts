import { afterEach, describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { NodeSqliteDriver } from '../data/__tests__/node-sqlite-driver'
import { createAppStore } from './storage'
import { deleteConnectedAccount, accountDeletionEndpoint, deletionNavigationAllowed } from './account-lifecycle'

const a = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', b = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const drivers: NodeSqliteDriver[] = []
afterEach(async () => { for (const driver of drivers.splice(0)) await driver.close() })
async function fixture() {
  const driver = new NodeSqliteDriver(':memory:'); drivers.push(driver)
  const store = await createAppStore(driver)
  for (const id of [b, a]) await store.create({ version: 1, accountId: id, remoteUserId: id, email: 'test@example.invalid', revision: 0, remoteRevision: null, lastSyncedRevision: 0, tables: { profiles: [{ id }], measurements: [{ id: `measure-${id}`, user_id: id, weight_kg: 80 }] } })
  const session = { user: { id: a }, access_token: 'verified-account-a' }
  const client = { auth: { getSession: vi.fn(async () => ({ data: { session }, error: null })), getUser: vi.fn(async () => ({ data: { user: { id: a } }, error: null })) } } as unknown as SupabaseClient
  const fetcher = vi.fn<typeof fetch>(async () => new Response(JSON.stringify({ ok: true, accountId: a }), { status: 200 }))
  const logout = vi.fn(async () => {})
  return { driver, store, client, fetcher, logout, endpoint: 'https://app.example.invalid/api/account/delete', online: () => true }
}
describe('account deletion client contract', () => {
  it('requires explicit HTTPS backend configuration', () => {
    expect(() => accountDeletionEndpoint('')).toThrow(/configur/i)
    for (const raw of ['http://site.test', 'https://user:pass@site.test', 'https://site.test?token=x']) expect(() => accountDeletionEndpoint(raw)).toThrow()
    expect(accountDeletionEndpoint('https://site.test')).toBe('https://site.test/api/account/delete')
  })
  it('deletes only confirmed account data durably and clears its session', async () => {
    const f = await fixture(); await deleteConnectedAccount('ELIMINAR', f)
    expect(f.fetcher.mock.calls[0]?.[1]).toMatchObject({ method: 'POST', credentials: 'omit', headers: { Authorization: 'Bearer verified-account-a' }, body: JSON.stringify({ confirmText: 'ELIMINAR' }) })
    expect((await (await createAppStore(f.driver)).list()).map(row => row.accountId)).toEqual([b])
    expect(f.logout).toHaveBeenCalledOnce()
  })
  it.each(['failure', 'wrong_ack', 'ambiguous'])('preserves all local data on %s', async kind => {
    const f = await fixture(); const before = await f.store.read()
    f.fetcher.mockImplementationOnce(async () => kind === 'ambiguous' ? new Response('upstream timeout', { status: 504 }) : new Response(JSON.stringify(kind === 'wrong_ack' ? { ok: true, accountId: b } : { ok: false, code: 'delete_failed' }), { status: kind === 'failure' ? 500 : 200 }))
    await expect(deleteConnectedAccount('DELETE', f)).rejects.toThrow()
    expect(await f.store.read()).toEqual(before); expect(f.logout).not.toHaveBeenCalled()
  })
  it('rejects missing confirmation and wrong verified identity before remote destruction', async () => {
    const f = await fixture(); await expect(deleteConnectedAccount('', f)).rejects.toThrow(/confirm/i)
    vi.mocked(f.client.auth.getUser).mockResolvedValueOnce({ data: { user: { id: b } }, error: null } as never)
    await expect(deleteConnectedAccount('DELETE', f)).rejects.toThrow(/cuenta/i)
    expect(f.fetcher).not.toHaveBeenCalled(); expect(await f.store.list()).toHaveLength(2)
  })
  it('preserves both profiles and the replacement login on a switch during deletion', async () => {
    const f = await fixture(); f.fetcher.mockImplementationOnce(async () => { await f.store.activate(b); return new Response(JSON.stringify({ ok: true, accountId: a })) })
    await expect(deleteConnectedAccount('DELETE', f)).rejects.toThrow(/cuenta|sesión/i)
    expect((await f.store.read())?.accountId).toBe(b); expect(await f.store.list()).toHaveLength(2); expect(f.logout).not.toHaveBeenCalled()
  })
  it('cleans browser drafts only after acknowledgment and reports partial local cleanup honestly', async () => {
    const f = await fixture()
    const removeItem = vi.fn(() => { throw new Error('localStorage unavailable') })
    const browserStorage = { length: 1, key: () => `fitai_active_session_v2_${a}`, getItem: () => '{}', removeItem }
    f.fetcher.mockResolvedValueOnce(new Response('timeout', { status: 504 }))
    await expect(deleteConnectedAccount('DELETE', { ...f, browserStorage })).rejects.toThrow('account_delete_unconfirmed')
    expect(removeItem).not.toHaveBeenCalled()
    await expect(deleteConnectedAccount('DELETE', { ...f, browserStorage })).rejects.toThrow('account_delete_local_pending')
    expect(await f.store.list()).toHaveLength(1); expect(f.logout).toHaveBeenCalledOnce()
  })
  it('preserves a new SDK login that arrives during the SQLite delete before its local profile is prepared', async () => {
    const f = await fixture()
    let remoteOwner: string | null = a
    vi.mocked(f.client.auth.getSession).mockImplementation(async () => ({ error: null, data: { session: remoteOwner ? { user: { id: remoteOwner }, access_token: `token-${remoteOwner}` } : null } } as never))
    let release!: () => void, entered!: () => void
    const pause = new Promise<void>(resolve => { release = resolve }), started = new Promise<void>(resolve => { entered = resolve })
    const execute = f.driver.execute.bind(f.driver)
    f.driver.execute = async (sql, parameters) => { const result = await execute(sql, parameters); if (sql.startsWith('DELETE FROM original_app_accounts')) { entered(); await pause } return result }
    f.logout.mockImplementation(async () => { remoteOwner = null })
    const deleting = deleteConnectedAccount('DELETE', f)
    await started; remoteOwner = b; release()
    const result = await deleting
    expect(remoteOwner).toBe(b); expect(f.logout).not.toHaveBeenCalled()
    expect(result).toMatchObject({ navigateToLogin: false })
    expect(await deletionNavigationAllowed(f.store, f.client, a, f.store.sessionVersion(), true)).toBe(false)
  })
})
