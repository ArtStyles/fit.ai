import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NodeSqliteDriver } from '../../data/__tests__/node-sqlite-driver'
import { createAppStore, setAppStoreForTests, type AppState } from '../storage'
import type { CompanionSnapshot } from '@/lib/companions/types'

const bridge = vi.hoisted(() => ({ createConnectedClient: vi.fn() }))
vi.mock('../bridge-client', () => bridge)
import * as actions from '../companion-actions'

const OWNER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const OTHER = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const RELATIONSHIP = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
const REQUEST = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'
const NOW = '2026-09-10T18:00:00.000Z'
const drivers: NodeSqliteDriver[] = []
const week = { completedSessions: 2, goal: 3, weekStart: '2026-09-07', weekEnd: '2026-09-13', timeZone: 'America/Havana', updatedAt: NOW }
const snapshot = (owner = OWNER): CompanionSnapshot => ({
  viewerId: owner, status: 'active',
  relationship: { id: RELATIONSHIP, other: { userId: owner === OWNER ? OTHER : OWNER, fullName: 'Frank', avatarUrl: null }, expiresAt: null },
  self: week, partner: { ...week, completedSessions: 1 }, greeting: null, nextGreetingAt: null, fetchedAt: NOW,
})
const noCompanion = (): CompanionSnapshot => ({ ...snapshot(), status: 'none', relationship: null, self: null, partner: null })

function account(owner = OWNER): AppState {
  return { version: 1, accountId: owner, remoteUserId: owner, email: `${owner[0]}@example.invalid`, revision: 0, remoteRevision: null, lastSyncedRevision: 0,
    tables: { profiles: [{ id: owner, full_name: 'Ana' }], progress_logs: [] } }
}
async function fixture() {
  const driver = new NodeSqliteDriver(':memory:'); drivers.push(driver)
  const store = await createAppStore(driver); setAppStoreForTests(store); await store.create(account())
  const rpc = vi.fn(async () => ({ data: snapshot(), error: null as { message: string; code?: string } | null }))
  bridge.createConnectedClient.mockResolvedValue({ rpc })
  return { store, rpc }
}
function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(done => { resolve = done })
  return { promise, resolve }
}
beforeEach(() => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date(NOW)); vi.stubGlobal('navigator', { onLine: true }) })
afterEach(async () => {
  setAppStoreForTests(null); bridge.createConnectedClient.mockReset(); vi.unstubAllGlobals(); vi.useRealTimers()
  for (const driver of drivers.splice(0)) await driver.close()
})

describe('Android companion actions', () => {
  it('keeps the received greeting in its account cache without copying it into training backups', async () => {
    const { store, rpc } = await fixture()
    const before = await store.exportBackup()
    const receivedGreeting = { message: 'Cada paso cuenta 💪', sentAt: NOW }
    rpc.mockResolvedValue({ data: { ...snapshot(), receivedGreeting }, error: null })
    expect(await actions.loadCompanion()).toMatchObject({ ok: true, value: { receivedGreeting } })
    vi.stubGlobal('navigator', { onLine: false })
    expect(await actions.loadCompanion()).toMatchObject({ ok: true, value: { receivedGreeting, offline: true } })
    expect(await store.exportBackup()).toBe(before)
    await store.create(account(OTHER))
    expect(await actions.loadCompanion()).toMatchObject({ ok: false })
  })

  it('caches a validated online summary separately from training data and labels its offline reuse', async () => {
    const { store, rpc } = await fixture()
    const before = await store.exportBackup()
    const live = await actions.loadCompanion()
    expect(live.ok, JSON.stringify(live)).toBe(true)
    expect(live).toMatchObject({ ok: true, value: { viewerId: OWNER, status: 'active' } })
    vi.stubGlobal('navigator', { onLine: false })
    expect(await actions.loadCompanion()).toMatchObject({ ok: true, value: { viewerId: OWNER, status: 'active', offline: true } })
    expect(rpc).toHaveBeenCalledTimes(1)
    expect(await store.exportBackup()).toBe(before)
    expect((await store.read())?.revision).toBe(0)
  })

  it('expires cached companion data after 24 hours without inventing an empty relationship', async () => {
    await fixture(); await actions.loadCompanion()
    vi.stubGlobal('navigator', { onLine: false })
    vi.setSystemTime(new Date('2026-09-11T17:59:59.000Z'))
    expect(await actions.loadCompanion()).toMatchObject({ ok: true, value: { offline: true } })
    vi.setSystemTime(new Date('2026-09-11T18:00:00.000Z'))
    expect(await actions.loadCompanion()).toMatchObject({ ok: false, code: 'connection_required' })
  })

  it('does not expose the previous account cache after switching accounts or logging out', async () => {
    const { store } = await fixture(); await actions.loadCompanion()
    await store.create(account(OTHER)); vi.stubGlobal('navigator', { onLine: false })
    expect(await actions.loadCompanion()).toMatchObject({ ok: false })
    await store.activate(OWNER)
    expect(await actions.loadCompanion()).toMatchObject({ ok: true, value: { viewerId: OWNER, offline: true } })
    await store.deactivate()
    expect(await actions.loadCompanion()).toMatchObject({ ok: false })
  })

  it('rejects a corrupted or foreign-owner cached summary', async () => {
    const { store } = await fixture()
    await store.setAccountCache('companion-summary', { version: 1, snapshot: snapshot(OTHER) }, store.sessionVersion(), OWNER)
    vi.stubGlobal('navigator', { onLine: false })
    expect(await actions.loadCompanion()).toMatchObject({ ok: false })
  })

  it('keeps every connected action unavailable offline without dispatching a request', async () => {
    const { rpc } = await fixture(); vi.stubGlobal('navigator', { onLine: false })
    const results = await Promise.all([
      actions.loadCompanion(), actions.getCompanionCode(), actions.previewCompanionCode('VKR-AB12'),
      actions.sendCompanionInvitation('VKR-AB12'), actions.respondCompanionInvitation(RELATIONSHIP, true),
      actions.cancelCompanionInvitation(RELATIONSHIP), actions.leaveCompanion(RELATIONSHIP),
      actions.sendCompanionGreeting(RELATIONSHIP, '¡Ánimo!', REQUEST),
    ])
    expect(results.every(result => !result.ok && result.code === 'connection_required')).toBe(true)
    expect(rpc).not.toHaveBeenCalled()
  })

  it('refuses unlinked profiles even if connectivity is available', async () => {
    const { store, rpc } = await fixture()
    await store.create({ ...account(OTHER), remoteUserId: null })
    expect(await actions.loadCompanion()).toMatchObject({ ok: false })
    expect(await actions.sendCompanionGreeting(RELATIONSHIP, '', REQUEST)).toMatchObject({ ok: false })
    expect(rpc).not.toHaveBeenCalled()
  })

  it('drops a response received after logout and reentry to the same account', async () => {
    const { store, rpc } = await fixture()
    const pending = deferred<{ data: ReturnType<typeof snapshot>; error: null }>(); const entered = deferred<void>()
    rpc.mockImplementationOnce(async () => { entered.resolve(); return pending.promise })
    const result = actions.loadCompanion(); await entered.promise
    await store.deactivate(); await store.activate(OWNER); pending.resolve({ data: snapshot(), error: null })
    expect(await result).toMatchObject({ ok: false, code: 'account_changed' })
    expect(await store.getAccountCache('companion-summary', OWNER)).toBeNull()
  })

  it('blocks a request before dispatch if logout occurred while preparing its connected client', async () => {
    const { store, rpc } = await fixture()
    const pending = deferred<{ rpc: typeof rpc }>(); const entered = deferred<void>()
    bridge.createConnectedClient.mockImplementationOnce(async () => { entered.resolve(); return pending.promise })
    const result = actions.getCompanionCode(); await entered.promise
    await store.deactivate(); pending.resolve({ rpc })
    expect(await result).toMatchObject({ ok: false, code: 'account_changed' })
    expect(rpc).not.toHaveBeenCalled()
  })

  it('does not resurrect a relationship when a pre-unlink read arrives late', async () => {
    const { rpc } = await fixture(); await actions.loadCompanion()
    const pending = deferred<{ data: ReturnType<typeof snapshot>; error: null }>(); const entered = deferred<void>()
    rpc.mockImplementationOnce(async () => { entered.resolve(); return pending.promise })
    const loading = actions.loadCompanion(); await entered.promise
    rpc.mockResolvedValueOnce({ data: noCompanion(), error: null })
    expect(await actions.leaveCompanion(RELATIONSHIP)).toMatchObject({ ok: true, value: { status: 'none' } })
    pending.resolve({ data: snapshot(), error: null })
    expect(await loading).toMatchObject({ ok: false, code: 'stale_result' })
    vi.stubGlobal('navigator', { onLine: false })
    expect(await actions.loadCompanion()).toMatchObject({ ok: true, value: { status: 'none', offline: true } })
  })

  it('invalidates the old relationship snapshot after an ambiguous mutation response', async () => {
    const { rpc } = await fixture(); await actions.loadCompanion()
    rpc.mockRejectedValueOnce(new Error('Connection closed after request'))
    expect(await actions.leaveCompanion(RELATIONSHIP)).toMatchObject({ ok: false })
    vi.stubGlobal('navigator', { onLine: false })
    expect(await actions.loadCompanion()).toMatchObject({ ok: false, code: 'connection_required' })
  })

  it('revalidates on reconnection and replaces the formerly active offline summary with the confirmed empty state', async () => {
    const { rpc } = await fixture(); await actions.loadCompanion()
    vi.stubGlobal('navigator', { onLine: false })
    expect(await actions.loadCompanion()).toMatchObject({ ok: true, value: { status: 'active', offline: true } })
    vi.stubGlobal('navigator', { onLine: true }); rpc.mockResolvedValueOnce({ data: noCompanion(), error: null })
    expect(await actions.loadCompanion()).toMatchObject({ ok: true, value: { status: 'none' } })
    vi.stubGlobal('navigator', { onLine: false })
    expect(await actions.loadCompanion()).toMatchObject({ ok: true, value: { status: 'none', offline: true } })
  })

  it('keeps the newest read when two summaries resolve out of order', async () => {
    const { rpc } = await fixture()
    const pending = deferred<{ data: ReturnType<typeof snapshot>; error: null }>(); const entered = deferred<void>()
    rpc.mockImplementationOnce(async () => { entered.resolve(); return pending.promise })
    const earlier = actions.loadCompanion(); await entered.promise
    rpc.mockResolvedValueOnce({ data: noCompanion(), error: null })
    expect(await actions.loadCompanion()).toMatchObject({ ok: true, value: { status: 'none' } })
    pending.resolve({ data: snapshot(), error: null })
    expect(await earlier).toMatchObject({ ok: false, code: 'stale_result' })
    vi.stubGlobal('navigator', { onLine: false })
    expect(await actions.loadCompanion()).toMatchObject({ ok: true, value: { status: 'none', offline: true } })
  })

  it('does not clear or replace another account cache when an in-flight mutation returns', async () => {
    const { store, rpc } = await fixture(); await actions.loadCompanion()
    await store.create(account(OTHER)); rpc.mockResolvedValueOnce({ data: snapshot(OTHER), error: null })
    await actions.loadCompanion(); await store.activate(OWNER)
    const pending = deferred<{ data: ReturnType<typeof snapshot>; error: null }>(); const entered = deferred<void>()
    rpc.mockImplementationOnce(async () => { entered.resolve(); return pending.promise })
    const leaving = actions.leaveCompanion(RELATIONSHIP); await entered.promise
    await store.activate(OTHER); pending.resolve({ data: noCompanion(), error: null })
    expect(await leaving).toMatchObject({ ok: false, code: 'account_changed' })
    vi.stubGlobal('navigator', { onLine: false })
    expect(await actions.loadCompanion()).toMatchObject({ ok: true, value: { viewerId: OTHER, status: 'active', offline: true } })
  })

  it('does not keep the dashboard waiting indefinitely or cache a response after its deadline', async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date(NOW))
    const { store, rpc } = await fixture()
    const pending = deferred<{ data: ReturnType<typeof snapshot>; error: null }>(); const entered = deferred<void>()
    rpc.mockImplementationOnce(async () => { entered.resolve(); return pending.promise })
    const loading = actions.loadCompanion(); await entered.promise
    let completed: Awaited<typeof loading> | undefined; void loading.then(result => { completed = result })
    await vi.advanceTimersByTimeAsync(8_000)
    expect(completed).toMatchObject({ ok: false })
    pending.resolve({ data: snapshot(), error: null }); await Promise.resolve()
    expect(await store.getAccountCache('companion-summary', OWNER)).toBeNull()
  })

  it('allows the new login to refresh while an old login mutation is still in flight', async () => {
    const { store, rpc } = await fixture()
    const pending = deferred<{ data: ReturnType<typeof snapshot>; error: null }>(); const entered = deferred<void>()
    rpc.mockImplementationOnce(async () => { entered.resolve(); return pending.promise })
    const leaving = actions.leaveCompanion(RELATIONSHIP); await entered.promise
    await store.deactivate(); await store.activate(OWNER)
    rpc.mockResolvedValueOnce({ data: noCompanion(), error: null })
    expect(await actions.loadCompanion()).toMatchObject({ ok: true, value: { status: 'none' } })
    pending.resolve({ data: noCompanion(), error: null })
    expect(await leaving).toMatchObject({ ok: false, code: 'account_changed' })
    vi.stubGlobal('navigator', { onLine: false })
    expect(await actions.loadCompanion()).toMatchObject({ ok: true, value: { status: 'none', offline: true } })
  })
})
