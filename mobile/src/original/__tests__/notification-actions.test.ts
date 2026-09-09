import { afterEach, describe, expect, it, vi } from 'vitest'
import { NodeSqliteDriver } from '../../data/__tests__/node-sqlite-driver'
import { createAppStore, setAppStoreForTests, type AppState } from '../storage'

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
describe('original notification actions', () => {
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
