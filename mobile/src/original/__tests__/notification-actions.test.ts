import { afterEach, describe, expect, it, vi } from 'vitest'
import { NodeSqliteDriver } from '../../data/__tests__/node-sqlite-driver'
import { createAppStore, setAppStoreForTests, type AppRow, type AppState } from '../storage'

const mocks = vi.hoisted(() => ({ remote: null as any }))
vi.mock('../bridge-client', () => ({ get remote() { return mocks.remote } }))
import { dismissNotificationAttention, dismissProductNotification, listProductNotifications, loadNotificationAttention, markProductNotificationRead, registerProductPushToken, disableProductPushToken, updateProductNotificationPreferences } from '../notification-actions'

const USER = '00000000-0000-4000-8000-000000000001'
const NOTICE = '10000000-0000-4000-8000-000000000001'
const drivers: NodeSqliteDriver[] = []
afterEach(async () => { for (const driver of drivers.splice(0)) await driver.close(); setAppStoreForTests(null); mocks.remote = null; vi.unstubAllGlobals() })
async function setup(linked = false) {
  const driver = new NodeSqliteDriver(':memory:'); drivers.push(driver)
  const store = await createAppStore(driver); setAppStoreForTests(store)
  const state: AppState = { version: 1, accountId: USER, remoteUserId: linked ? USER : null, email: '', revision: 0, remoteRevision: null, lastSyncedRevision: 0, tables: {
    profiles: [{ id: USER, timezone: 'UTC', last_check_in_at: null }],
    workout_plans: [{ id: 'plan', user_id: USER, is_active: true, name: 'Mi rutina', ai_notes: null }],
    product_notifications: [{ id: NOTICE, user_id: USER, type: 'training', title: 'Tu rutina', body: 'Rutina preparada', url: '/plan', read_at: null, dismissed_at: null, created_at: '2026-09-10T12:00:00.000Z' }],
  } }
  await store.create(state); return store
}

function remotePage(rows: AppRow[], options: { countError?: boolean; beforeResponse?: () => Promise<void> } = {}) {
  vi.stubGlobal('navigator', { onLine: true })
  mocks.remote = {
    auth: { getUser: async () => ({ data: { user: { id: USER } }, error: null }) },
    from: () => {
      let head = false
      const query = {
        select: (_columns: string, selectOptions?: { head?: boolean }) => { head = !!selectOptions?.head; return query },
        eq: () => query, is: () => query, order: () => query, limit: () => query, or: () => query,
        update: () => query, maybeSingle: async () => ({ data: { id: NOTICE }, error: null }),
        then: async (resolve: (value: unknown) => void) => {
          await options.beforeResponse?.()
          return resolve(head ? { count: rows.filter(row => !row.read_at).length, error: options.countError ? { message: 'count unavailable' } : null }
            : { data: rows, error: null })
        },
      }
      return query
    },
  }
}
describe('original notification actions', () => {
  it('reconciles a remotely empty inbox so cached unread notifications do not return offline', async () => {
    const store = await setup(true)
    remotePage([])
    expect(await listProductNotifications()).toMatchObject({ notifications: [], unreadCount: 0 })
    vi.stubGlobal('navigator', { onLine: false })
    expect(await listProductNotifications()).toMatchObject({ notifications: [], unreadCount: 0 })
    expect((await store.read())?.tables.product_notifications).toEqual([])
  })

  it('reconciles only the fetched range, preserving older cached pages and newer rows on page two', async () => {
    const store = await setup(true)
    const sample = (await store.read())!.tables.product_notifications[0]
    const rows = Array.from({ length: 35 }, (_, index) => ({ ...sample,
      id: `10000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
      created_at: `2026-09-${String(index < 31 ? 10 : 9).padStart(2, '0')}T12:00:00.000Z`,
    })).sort((a, b) => b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id))
    await store.mutate(draft => { draft.tables.product_notifications = rows })
    remotePage(rows.slice(0, 31))
    const first = await listProductNotifications()
    expect((await store.read())?.tables.product_notifications).toHaveLength(35)
    remotePage(rows.slice(30, 34)) // The oldest notification was removed remotely.
    const second = await listProductNotifications({ cursor: first.nextCursor })
    expect(second.notifications).toHaveLength(4)
    vi.stubGlobal('navigator', { onLine: false })
    const cached = (await store.read())!.tables.product_notifications
    expect(cached).toHaveLength(34)
    expect(cached.some(row => row.id === rows[0].id)).toBe(true)
    expect(cached.some(row => row.id === rows[34].id)).toBe(false)
  })

  it('does not substitute an old cached unread count when the live count fails', async () => {
    await setup(true)
    remotePage([], { countError: true })
    expect(await listProductNotifications()).toMatchObject({ notifications: [], unreadCount: null })
  })

  it('discards an in-flight remote notification response after logout', async () => {
    const store = await setup(true)
    const rows = (await store.read())!.tables.product_notifications
    let deactivated = false
    remotePage(rows, { beforeResponse: async () => {
      if (!deactivated) { deactivated = true; await store.deactivate() }
    } })
    expect(await listProductNotifications()).toMatchObject({ notifications: [], unreadCount: null, error: expect.any(String) })
    expect(await store.read()).toBeNull()
  })

  it.each(['read', 'dismiss'] as const)('does not restore unread activity from a GET started before a confirmed %s', async action => {
    const store = await setup(true)
    const rows = (await store.read())!.tables.product_notifications
    let release!: () => void
    let started!: () => void
    const pending = new Promise<void>(resolve => { release = resolve })
    const requested = new Promise<void>(resolve => { started = resolve })
    remotePage(rows, { beforeResponse: async () => { started(); await pending } })
    const request = listProductNotifications()
    await requested
    expect(await (action === 'read' ? markProductNotificationRead(NOTICE) : dismissProductNotification(NOTICE))).toEqual({ ok: true })
    release()
    const page = await request
    expect(page.unreadCount).toBeNull()
    if (action === 'dismiss') expect(page.notifications).toEqual([])
    else expect(page.notifications[0].readAt).toEqual(expect.any(String))
    vi.stubGlobal('navigator', { onLine: false })
    expect((await listProductNotifications()).unreadCount).toBe(0)
  })

  it('keeps a notification cached by a newer refresh when an older empty response finishes', async () => {
    const store = await setup(true)
    const sample = (await store.read())!.tables.product_notifications[0]
    await store.mutate(draft => { draft.tables.product_notifications = [] })
    remotePage([], { beforeResponse: async () => {
      await store.mutate(draft => { draft.tables.product_notifications = [sample] })
    } })
    const page = await listProductNotifications()
    expect(page.notifications.map(row => row.id)).toEqual([NOTICE])
    expect(page.unreadCount).toBeNull()
    vi.stubGlobal('navigator', { onLine: false })
    expect((await listProductNotifications()).unreadCount).toBe(1)
  })

  it('keeps a newer empty inbox when an earlier response still contains the removed activity', async () => {
    const store = await setup(true)
    const rows = (await store.read())!.tables.product_notifications
    remotePage(rows, { beforeResponse: async () => {
      await store.mutate(draft => { draft.tables.product_notifications = [] })
    } })
    expect((await listProductNotifications()).notifications).toEqual([])
    vi.stubGlobal('navigator', { onLine: false })
    expect((await listProductNotifications()).unreadCount).toBe(0)
  })

  it('retains the remote next-page cursor when a concurrent archive shrinks a full page', async () => {
    const store = await setup(true)
    const sample = (await store.read())!.tables.product_notifications[0]
    const rows = Array.from({ length: 31 }, (_, index) => ({ ...sample,
      id: `10000000-0000-4000-8000-${String(31 - index).padStart(12, '0')}`,
    }))
    await store.mutate(draft => { draft.tables.product_notifications = rows })
    let archived = false
    remotePage(rows, { beforeResponse: async () => {
      if (archived) return
      archived = true
      expect(await dismissProductNotification(rows[0].id)).toEqual({ ok: true })
    } })
    const page = await listProductNotifications()
    expect(page.notifications).toHaveLength(29)
    expect(page.notifications.some(row => row.id === rows[0].id)).toBe(false)
    expect(page.nextCursor).toEqual(expect.any(String))
  })

  it('preserves local preferences and read/dismiss state durably', async () => {
    const store = await setup()
    expect(await updateProductNotificationPreferences({ professionalEnabled: false, pushEnabled: false })).toEqual({ ok: true })
    expect((await store.read())?.tables.product_notification_preferences[0]).toMatchObject({ user_id: USER, professional_enabled: false, push_enabled: false })
    expect((await listProductNotifications()).unreadCount).toBe(1)
    expect(await markProductNotificationRead(NOTICE)).toEqual({ ok: true })
    expect((await listProductNotifications()).unreadCount).toBe(0)
    expect(await dismissProductNotification(NOTICE)).toEqual({ ok: true })
    expect((await listProductNotifications()).notifications).toEqual([])
    expect((await store.read())?.tables.product_notifications[0].dismissed_at).toBeTruthy()
  })

  it('dismisses only current attention and does not hide future check-ins', async () => {
    const store = await setup()
    const attention = await loadNotificationAttention()
    expect(attention).toMatchObject({ status: 'ready', attention: { dismissalKey: 'check-in:never' } })
    expect(await dismissNotificationAttention('check-in:2020-01-01T00:00:00.000Z')).toMatchObject({ ok: false })
    expect(await dismissNotificationAttention('check-in:never')).toEqual({ ok: true })
    expect(await loadNotificationAttention()).toEqual({ status: 'ready', attention: null })
    await store.mutate(state => { state.tables.profiles[0].last_check_in_at = '2020-01-01T00:00:00.000Z' })
    expect(await loadNotificationAttention()).toMatchObject({ status: 'ready', attention: { dismissalKey: 'check-in:2020-01-01T00:00:00.000Z' } })
  })

  it('does not claim push registration or disabling without token and backend', async () => {
    await setup()
    expect(await registerProductPushToken({ token: 'token', platform: 'android', deviceId: 'device' })).toMatchObject({ ok: false })
    expect(await disableProductPushToken('')).toMatchObject({ ok: false })
    expect(await disableProductPushToken('token')).toMatchObject({ ok: false })
  })

  it('paginates matching timestamps without duplicating or losing notifications', async () => {
    const store = await setup()
    await store.mutate(state => {
      state.tables.product_notifications = Array.from({ length: 35 }, (_, index) => ({
        id: `10000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`, user_id: USER,
        type: 'training', title: `Aviso ${index}`, body: '', url: '/plan', read_at: null, dismissed_at: null, created_at: '2026-09-10T12:00:00.000Z',
      }))
    })
    const first = await listProductNotifications()
    expect(first.notifications).toHaveLength(30)
    const second = await listProductNotifications({ cursor: first.nextCursor })
    expect(second.notifications).toHaveLength(5)
    expect(new Set([...first.notifications, ...second.notifications].map(row => row.id)).size).toBe(35)
    expect(second.nextCursor).toBeNull()
    expect((await listProductNotifications({ cursor: 'invalid' })).error).toBe('Cursor no válido.')
  })

  it('rejects connected writes for a different authenticated identity', async () => {
    const store = await setup(true)
    const from = vi.fn()
    mocks.remote = { auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'different-owner' } }, error: null }) }, from }
    expect(await updateProductNotificationPreferences({ professionalEnabled: false, pushEnabled: true })).toMatchObject({ ok: false })
    expect(await markProductNotificationRead(NOTICE)).toMatchObject({ ok: false })
    expect(from).not.toHaveBeenCalled()
    expect((await store.read())?.tables.product_notifications[0].read_at).toBeNull()
  })

  it('keeps linked cached data unchanged if offline or the remote write fails', async () => {
    const store = await setup(true)
    vi.stubGlobal('navigator', { onLine: false })
    expect(await dismissProductNotification(NOTICE)).toMatchObject({ ok: false })
    expect((await store.read())?.tables.product_notifications[0].dismissed_at).toBeNull()
    vi.stubGlobal('navigator', { onLine: true })
    mocks.remote = { auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: USER } }, error: null }) }, from: vi.fn(() => ({ upsert: vi.fn().mockResolvedValue({ error: { message: 'backend failure' } }) })) }
    expect(await updateProductNotificationPreferences({ professionalEnabled: false, pushEnabled: false })).toMatchObject({ ok: false })
    expect((await store.read())?.tables.product_notification_preferences).toBeUndefined()
  })
})
