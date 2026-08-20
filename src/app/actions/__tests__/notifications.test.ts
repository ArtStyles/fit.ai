import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import { createClient } from '@/lib/supabase/server'
import {
  disableProductPushToken,
  listProductNotifications,
  loadNotificationAttention,
  markProductNotificationRead,
  registerProductPushToken,
  updateProductNotificationPreferences,
} from '../notifications'

type NotificationRow = {
  id: string
  user_id: string
  type: string
  title: string
  body: string
  url: string | null
  read_at: string | null
  created_at: string
}

const createClientMock = createClient as unknown as Mock

function createActionClient(userId: string | null = 'user-1') {
  const tokens = new Map<string, {
    user_id: string
    token: string
    platform: string
    device_id: string
    enabled: boolean
    last_seen_at: string
  }>()
  const preferences = new Map<string, {
    professional_enabled: boolean
    push_enabled: boolean
  }>()
  const notifications: NotificationRow[] = []

  function tableQuery(table: string) {
    const filters: Record<string, unknown> = {}
    let updateValue: Record<string, unknown> | null = null
    let requestedLimit: number | null = null
    let cursorFilter: string | null = null
    let countOnly = false
    const requestedOrders: Array<{ column: string; ascending: boolean }> = []

    const builder: any = {
      select(_columns?: string, options?: { count?: string; head?: boolean }) {
        countOnly = options?.count === 'exact' && options.head === true
        return builder
      },
      order(column: string, options: { ascending?: boolean } = {}) {
        requestedOrders.push({ column, ascending: options.ascending !== false })
        return builder
      },
      limit(value: number) {
        requestedLimit = value
        return builder
      },
      or(value: string) {
        cursorFilter = value
        return builder
      },
      async upsert(value: Record<string, unknown>) {
        if (table === 'product_push_tokens') {
          tokens.set(String(value.device_id), {
            user_id: String(value.user_id),
            token: String(value.token),
            platform: String(value.platform),
            device_id: String(value.device_id),
            enabled: Boolean(value.enabled),
            last_seen_at: String(value.last_seen_at),
          })
          return { error: null }
        }
        if (table === 'product_notification_preferences') {
          const owner = value.user_id === undefined ? userId : String(value.user_id)
          if (!owner || owner !== userId) {
            return { error: new Error('notification preference owner rejected by RLS') }
          }
          preferences.set(owner, {
            professional_enabled: Boolean(value.professional_enabled),
            push_enabled: Boolean(value.push_enabled),
          })
          return { error: null }
        }
        throw new Error(`Unexpected upsert on ${table}`)
      },
      update(value: Record<string, unknown>) {
        updateValue = value
        return builder
      },
      eq(column: string, value: unknown) {
        filters[column] = value
        return builder
      },
      is(column: string, value: unknown) {
        filters[column] = value
        return builder
      },
      then(resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) {
        if (table === 'product_push_tokens' && updateValue?.enabled === false) {
          tokens.forEach((token, deviceId) => {
            if (token.user_id === filters.user_id && token.token === filters.token) {
              tokens.set(deviceId, { ...token, enabled: false })
            }
          })
        }
        if (table === 'product_notification_preferences' && updateValue) {
          preferences.set(String(filters.user_id), {
            professional_enabled: Boolean(updateValue.professional_enabled),
            push_enabled: Boolean(updateValue.push_enabled),
          })
        }
        if (table === 'product_notifications') {
          if (countOnly) {
            const count = notifications.filter(notification => (
              notification.user_id === filters.user_id
              && notification.read_at === filters.read_at
            )).length
            return Promise.resolve({ data: null, count, error: null }).then(resolve, reject)
          }

          if (updateValue) {
            const notificationUpdate = updateValue
            notifications.forEach((notification, index) => {
              const matchesReadState = !('read_at' in filters)
                || notification.read_at === filters.read_at
              if (
                notification.id === filters.id
                && notification.user_id === filters.user_id
                && matchesReadState
              ) {
                notifications[index] = {
                  ...notification,
                  read_at: String(notificationUpdate.read_at),
                }
              }
            })
            return Promise.resolve({ error: null }).then(resolve, reject)
          }

          let rows = notifications
            .filter(notification => notification.user_id === filters.user_id)
            .sort((left, right) => {
              for (const order of requestedOrders) {
                const leftValue = String(left[order.column as keyof NotificationRow])
                const rightValue = String(right[order.column as keyof NotificationRow])
                const comparison = leftValue.localeCompare(rightValue)
                if (comparison !== 0) return order.ascending ? comparison : -comparison
              }
              return 0
            })

          if (cursorFilter) {
            const match = cursorFilter.match(/^created_at\.lt\.([^,]+),and\(created_at\.eq\.([^,]+),id\.lt\.([^)]+)\)$/)
            if (!match) throw new Error(`Unexpected cursor filter: ${cursorFilter}`)
            const [, beforeCreatedAt, equalCreatedAt, beforeId] = match
            rows = rows.filter(notification => (
              notification.created_at < beforeCreatedAt
              || (notification.created_at === equalCreatedAt && notification.id < beforeId)
            ))
          }

          if (requestedLimit !== null) rows = rows.slice(0, requestedLimit)
          return Promise.resolve({ data: rows, error: null }).then(resolve, reject)
        }
        return Promise.resolve({ error: null }).then(resolve, reject)
      },
    }
    return builder
  }

  const client = {
    auth: {
      getUser: vi.fn(() => Promise.resolve({
        data: { user: userId ? { id: userId } : null },
      })),
    },
    from: vi.fn(tableQuery),
  }

  return { client, tokens, preferences, notifications }
}

function notificationId(index: number): string {
  return `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`
}

function notificationRow(index: number, userId = 'authenticated-user'): NotificationRow {
  return {
    id: notificationId(index),
    user_id: userId,
    type: 'trainer.update',
    title: `Aviso ${index}`,
    body: `Detalle ${index}`,
    url: '/trainers',
    read_at: null,
    created_at: '2026-08-07T15:00:00.000Z',
  }
}

function createAttentionClient() {
  const rows: Record<string, unknown> = {
    profiles: {
      last_check_in_at: '2026-08-20T08:00:00.000Z',
      timezone: 'UTC',
    },
    workout_plans: {
      id: 'plan-1',
      name: 'Fuerza base',
      ai_notes: 'Sube el peso de forma gradual.',
      created_at: '2026-08-20T07:00:00.000Z',
      week_number: 2,
      plan_context: 'weekly_regeneration',
    },
    progress_logs: [{ id: 'log-1' }],
    dashboard_banners: {
      slot: 'dashboard-primary',
      kind: 'announcement',
      title: 'Novedad',
      description: 'Detalle',
      image_url: null,
      cta_label: null,
      cta_href: null,
      status: 'active',
      starts_on: null,
      ends_on: null,
      updated_at: '2026-08-20T06:00:00.000Z',
    },
  }

  return {
    auth: {
      getUser: vi.fn(async () => ({ data: { user: { id: 'authenticated-user' } } })),
    },
    from: vi.fn((table: string) => {
      const builder: any = {
        select: () => builder,
        eq: () => builder,
        limit: () => builder,
        maybeSingle: async () => ({ data: rows[table] ?? null, error: null }),
        then: (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) => (
          Promise.resolve({ data: rows[table] ?? null, error: null }).then(resolve, reject)
        ),
      }
      return builder
    }),
  }
}

describe('product notification actions', () => {
  beforeEach(() => {
    createClientMock.mockReset()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('rejects an empty registration token before opening a session', async () => {
    await expect(registerProductPushToken({
      token: '   ',
      platform: 'android',
      deviceId: 'device-1',
    })).resolves.toEqual({ ok: false, error: 'Token de push vacio.' })

    expect(createClientMock).not.toHaveBeenCalled()
  })

  it('rejects unsupported push platforms before opening a session', async () => {
    await expect(registerProductPushToken({
      token: 'token-a',
      platform: 'web',
      deviceId: 'device-1',
    })).resolves.toEqual({ ok: false, error: 'Plataforma de push no soportada.' })

    expect(createClientMock).not.toHaveBeenCalled()
  })

  it('does not write a token without an authenticated session', async () => {
    const state = createActionClient(null)
    createClientMock.mockResolvedValue(state.client)

    await expect(registerProductPushToken({
      token: 'token-a',
      platform: 'ios',
      deviceId: 'device-1',
    })).resolves.toEqual({ ok: false, error: 'Sesion no valida.' })

    expect(state.client.from).not.toHaveBeenCalled()
  })

  it('registers the normalized device only for the authenticated owner', async () => {
    const state = createActionClient('authenticated-user')
    createClientMock.mockResolvedValue(state.client)

    await expect(registerProductPushToken({
      token: '  token-a  ',
      platform: 'android',
      deviceId: '  device-1  ',
    })).resolves.toEqual({ ok: true })

    expect(Array.from(state.tokens.values())).toEqual([expect.objectContaining({
      user_id: 'authenticated-user',
      token: 'token-a',
      platform: 'android',
      device_id: 'device-1',
      enabled: true,
    })])
  })

  it('disables only the authenticated owner token', async () => {
    const state = createActionClient('authenticated-user')
    state.tokens.set('device-1', {
      user_id: 'authenticated-user',
      token: 'token-a',
      platform: 'android',
      device_id: 'device-1',
      enabled: true,
      last_seen_at: '2026-08-07T12:00:00.000Z',
    })
    state.tokens.set('device-2', {
      user_id: 'other-user',
      token: 'token-a',
      platform: 'ios',
      device_id: 'device-2',
      enabled: true,
      last_seen_at: '2026-08-07T12:00:00.000Z',
    })
    createClientMock.mockResolvedValue(state.client)

    await expect(disableProductPushToken(' token-a ')).resolves.toEqual({ ok: true })

    expect(state.tokens.get('device-1')?.enabled).toBe(false)
    expect(state.tokens.get('device-2')?.enabled).toBe(true)
  })

  it('updates only boolean preferences for the authenticated owner', async () => {
    const state = createActionClient('authenticated-user')
    createClientMock.mockResolvedValue(state.client)

    await expect(updateProductNotificationPreferences({
      professionalEnabled: false,
      pushEnabled: true,
    })).resolves.toEqual({ ok: true })

    expect(state.preferences.get('authenticated-user')).toEqual({
      professional_enabled: false,
      push_enabled: true,
    })
  })

  it('rejects malformed preference values before writing', async () => {
    await expect(updateProductNotificationPreferences({
      professionalEnabled: 'yes',
      pushEnabled: true,
    } as never)).resolves.toEqual({ ok: false, error: 'Preferencias no validas.' })

    expect(createClientMock).not.toHaveBeenCalled()
  })

  it('rejects a malformed list cursor before opening a session', async () => {
    await expect(listProductNotifications({ cursor: 'not-a-valid-cursor' })).resolves.toEqual({
      notifications: [],
      nextCursor: null,
      unreadCount: null,
      error: 'Cursor no válido.',
    })

    expect(createClientMock).not.toHaveBeenCalled()
  })

  it('lists at most 30 owner notifications with a stable descending cursor', async () => {
    const state = createActionClient('authenticated-user')
    state.notifications.push(
      ...Array.from({ length: 31 }, (_, index) => notificationRow(index + 1)),
      notificationRow(99, 'other-user'),
    )
    createClientMock.mockResolvedValue(state.client)

    const firstPage = await listProductNotifications()

    expect(firstPage.error).toBeUndefined()
    expect(firstPage.notifications).toHaveLength(30)
    expect(firstPage.notifications[0]?.id).toBe(notificationId(31))
    expect(firstPage.notifications.at(-1)?.id).toBe(notificationId(2))
    expect(firstPage.notifications.every(item => item.title !== 'Aviso 99')).toBe(true)
    expect(firstPage.nextCursor).toEqual(expect.any(String))
    expect(firstPage.unreadCount).toBe(31)

    const secondPage = await listProductNotifications({ cursor: firstPage.nextCursor })
    expect(secondPage.notifications.map(item => item.id)).toEqual([notificationId(1)])
    expect(secondPage.nextCursor).toBeNull()
    expect(secondPage.unreadCount).toBe(31)
  })

  it('marks only the authenticated owner notification as read', async () => {
    const state = createActionClient('authenticated-user')
    state.notifications.push(
      notificationRow(1),
      notificationRow(2, 'other-user'),
    )
    createClientMock.mockResolvedValue(state.client)

    await expect(markProductNotificationRead(notificationId(1))).resolves.toEqual({ ok: true })
    await expect(markProductNotificationRead(notificationId(2))).resolves.toEqual({ ok: true })

    expect(state.notifications[0]?.read_at).toEqual(expect.any(String))
    expect(state.notifications[1]?.read_at).toBeNull()
  })

  it('preserves the first read timestamp when marking the same notification twice', async () => {
    vi.useFakeTimers()
    const state = createActionClient('authenticated-user')
    state.notifications.push(notificationRow(1))
    createClientMock.mockResolvedValue(state.client)

    vi.setSystemTime(new Date('2026-08-07T16:00:00.000Z'))
    await markProductNotificationRead(notificationId(1))
    vi.setSystemTime(new Date('2026-08-07T17:00:00.000Z'))
    await markProductNotificationRead(notificationId(1))

    expect(state.notifications[0]?.read_at).toBe('2026-08-07T16:00:00.000Z')
  })

  it('rejects a malformed notification id before opening a session', async () => {
    await expect(markProductNotificationRead('not-a-uuid')).resolves.toEqual({
      ok: false,
      error: 'Notificación no válida.',
    })

    expect(createClientMock).not.toHaveBeenCalled()
  })

  it('builds the dedicated center attention card with dashboard priority and context', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-20T12:00:00.000Z'))
    const client = createAttentionClient()
    createClientMock.mockResolvedValue(client)
    const result = await loadNotificationAttention()

    expect(result).toEqual({
      status: 'ready',
      attention: {
        notice: { kind: 'ai-notes', text: 'Sube el peso de forma gradual.' },
        aiNotes: 'Sube el peso de forma gradual.',
        planName: 'Fuerza base',
        promo: {
          slot: 'dashboard-primary',
          kind: 'announcement',
          title: 'Novedad',
          description: 'Detalle',
          image_url: null,
          cta_label: null,
          cta_href: null,
          status: 'active',
          starts_on: null,
          ends_on: null,
          updated_at: '2026-08-20T06:00:00.000Z',
        },
      },
    })
    expect(client.from).not.toHaveBeenCalledWith('progress_logs')
  })

  it('keeps the notification history available when attention data cannot load', async () => {
    createClientMock.mockRejectedValue(new Error('attention source unavailable'))

    await expect(loadNotificationAttention()).resolves.toEqual({ status: 'error' })
  })
})
