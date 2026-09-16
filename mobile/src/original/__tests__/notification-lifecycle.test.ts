import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AppState } from '../types'
const io = vi.hoisted(() => ({ state: null as AppState | null, schedule: vi.fn(), cancel: vi.fn(), check: vi.fn(), request: vi.fn(), pushCheck: vi.fn(), register: vi.fn(), unregister: vi.fn(), listener: vi.fn(), connected: vi.fn() }))
vi.mock('../storage', () => ({ getAppStore: async () => ({ read: async () => io.state }) }))
vi.mock('../bridge-client', () => ({ createConnectedClient: io.connected }))
vi.mock('../router', () => ({ navigate: vi.fn() }))
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => true, getPlatform: () => 'android' } }))
vi.mock('@capacitor/local-notifications', () => ({ LocalNotifications: { checkPermissions: io.check, requestPermissions: io.request, getPending: async () => ({ notifications: [] }), schedule: io.schedule, cancel: io.cancel } }))
vi.mock('@capacitor/push-notifications', () => ({ PushNotifications: { checkPermissions: io.pushCheck, requestPermissions: io.request, register: io.register, unregister: io.unregister, addListener: io.listener } }))
import { installMobileNotificationLifecycle, stopMobileNotifications } from '../notification-lifecycle'
import { persistWorkoutReminderPreference } from '@/lib/native/workoutReminderPreferences'
import { ORIGINAL_STATE_CHANGED } from '../types'

let cleanup: (() => void) | undefined
const callbacks = new Map<string, Array<(data: any) => void>>()
const state = (owner: string): AppState => ({ version: 1, accountId: owner, remoteUserId: owner, email: '', revision: 1, remoteRevision: null, lastSyncedRevision: 0,
  tables: { profiles: [{ id: owner, language: 'es', preferred_workout_days: [1] }], product_notification_preferences: [{ user_id: owner, push_enabled: true }] } })
const changed = () => window.dispatchEvent(new CustomEvent(ORIGINAL_STATE_CHANGED, { detail: { accountId: io.state?.accountId ?? null } }))
beforeEach(() => {
  vi.clearAllMocks(); callbacks.clear()
  io.connected.mockReset()
  vi.stubGlobal('window', new EventTarget())
  const values = new Map<string, string>()
  vi.stubGlobal('localStorage', { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value) } })
  vi.stubGlobal('navigator', { onLine: true })
  vi.stubEnv('NEXT_PUBLIC_LOCAL_APP', 'true'); vi.stubEnv('NEXT_PUBLIC_PRODUCT_PUSH_AVAILABLE', 'true')
  io.state = state('a')
  io.check.mockResolvedValue({ display: 'granted' }); io.pushCheck.mockResolvedValue({ receive: 'granted' })
  io.schedule.mockResolvedValue({ notifications: [] }); io.cancel.mockResolvedValue(undefined)
  io.register.mockResolvedValue(undefined); io.unregister.mockResolvedValue(undefined)
  io.listener.mockImplementation(async (name, callback) => { const list = callbacks.get(name) ?? []; list.push(callback); callbacks.set(name, list); return { remove: async () => {} } })
})
afterEach(async () => { await stopMobileNotifications(); cleanup?.(); cleanup = undefined; await Promise.resolve(); vi.unstubAllGlobals(); vi.unstubAllEnvs() })

describe('installed mobile notification coordinator', () => {
  it.each(['token-upload', 'native-registration'] as const)('retries %s failure on the next online event without prompting', async failure => {
    if (failure === 'token-upload') io.connected.mockRejectedValueOnce(new Error('Temporary network failure'))
    cleanup = await installMobileNotificationLifecycle()
    await vi.waitFor(() => expect(io.register).toHaveBeenCalledTimes(1))
    if (failure === 'token-upload') {
      callbacks.get('registration')![0]({ value: 'new-token' })
      await vi.waitFor(() => expect(io.connected).toHaveBeenCalledTimes(1))
      await Promise.resolve(); await Promise.resolve()
    } else callbacks.get('registrationError')![0]({ error: 'Temporary registration failure' })
    window.dispatchEvent(new Event('online'))
    await vi.waitFor(() => expect(io.register).toHaveBeenCalledTimes(2))
    expect(io.request).not.toHaveBeenCalled()
  })
  it('does not reset the replacement account registration when an old token upload fails late', async () => {
    let reject!: (reason: Error) => void
    io.connected.mockImplementationOnce(() => new Promise((_resolve, rejectPromise) => { reject = rejectPromise }))
    cleanup = await installMobileNotificationLifecycle()
    await vi.waitFor(() => expect(io.register).toHaveBeenCalledTimes(1))
    callbacks.get('registration')![0]({ value: 'old-token' })
    await vi.waitFor(() => expect(io.connected).toHaveBeenCalledTimes(1))
    io.state = state('b'); changed()
    await vi.waitFor(() => expect(io.register).toHaveBeenCalledTimes(2))
    reject(new Error('Late old-account upload failure'))
    callbacks.get('registrationError')![0]({ error: 'Late old-account native failure' })
    await Promise.resolve(); await Promise.resolve()
    window.dispatchEvent(new Event('online'))
    await new Promise(resolve => setTimeout(resolve, 25))
    expect(io.register).toHaveBeenCalledTimes(2)
  })
  it('updates preferred days and language from account events and cancels on switch without inheriting preferences', async () => {
    persistWorkoutReminderPreference('a', { enabled: true, time: '08:15' })
    cleanup = await installMobileNotificationLifecycle()
    await vi.waitFor(() => expect(io.schedule).toHaveBeenCalledTimes(1))
    expect(io.schedule.mock.calls[0][0].notifications[0]).toMatchObject({ id: 7101, title: '¡Hora de entrenar! 💪', schedule: { on: { weekday: 2, hour: 8, minute: 15 } } })
    Object.assign(io.state!.tables.profiles[0], { language: 'en', preferred_workout_days: [2, 5] }); changed()
    await vi.waitFor(() => expect(io.schedule).toHaveBeenCalledTimes(2))
    expect(io.schedule.mock.calls[1][0].notifications.map((row: any) => [row.id, row.title])).toEqual([[7102, 'Time to work out! 💪'], [7105, 'Time to work out! 💪']])
    const before = io.cancel.mock.calls.length
    io.state = state('b'); changed()
    await vi.waitFor(() => expect(io.cancel.mock.calls.length).toBeGreaterThan(before))
    expect(io.schedule).toHaveBeenCalledTimes(2)
    expect(io.request).not.toHaveBeenCalled()
  })
  it('does not write a late token to a new account after owner-specific client creation resumes', async () => {
    const writes: unknown[] = []
    let resume!: (client: any) => void
    io.connected.mockImplementationOnce(() => new Promise(resolve => { resume = resolve }))
    cleanup = await installMobileNotificationLifecycle()
    await vi.waitFor(() => expect(callbacks.get('registration')).toHaveLength(1))
    callbacks.get('registration')![0]({ value: 'token-a' })
    expect(io.connected).toHaveBeenCalledWith('a')
    io.state = state('b'); changed()
    await vi.waitFor(() => expect(callbacks.get('registration')).toHaveLength(2))
    const client = { from: () => ({ upsert: async (row: unknown) => { writes.push(row); return { error: null } } }) }
    resume(client)
    await Promise.resolve(); await Promise.resolve()
    expect(writes).toEqual([])
    io.connected.mockResolvedValue(client)
    callbacks.get('registration')![1]({ value: 'token-b' })
    await vi.waitFor(() => expect(writes).toHaveLength(1))
    expect(writes[0]).toMatchObject({ user_id: 'b', token: 'token-b' })
  })
  it('never initializes push when this build lacks capability or no explicit preference exists', async () => {
    vi.stubEnv('NEXT_PUBLIC_PRODUCT_PUSH_AVAILABLE', 'false')
    cleanup = await installMobileNotificationLifecycle()
    await vi.waitFor(() => expect(io.cancel).toHaveBeenCalled())
    expect(io.pushCheck).not.toHaveBeenCalled()
    vi.stubEnv('NEXT_PUBLIC_PRODUCT_PUSH_AVAILABLE', 'true')
    io.state!.tables.product_notification_preferences = []; changed()
    await new Promise(resolve => setTimeout(resolve, 20))
    expect(io.pushCheck).not.toHaveBeenCalled()
    expect(io.request).not.toHaveBeenCalled()
  })
})
