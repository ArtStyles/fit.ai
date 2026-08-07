import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import { createClient } from '@/lib/supabase/server'
import {
  disableProductPushToken,
  listProductNotifications,
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
    const requestedOrders: Array<{ column: string; ascending: boolean }> = []

    const builder: any = {
      select() {
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
        if (table !== 'product_push_tokens') throw new Error(`Unexpected upsert on ${table}`)
        tokens.set(String(value.device_id), {
          user_id: String(value.user_id),
          token: String(value.token),
          platform: String(value.platform),
          device_id: String(value.device_id),
          enabled: Boolean(value.enabled),
          last_seen_at: String(value.last_seen_at),
        })
        return { error: null }
      },
      update(value: Record<string, unknown>) {
        updateValue = value
        return builder
      },
      eq(column: string, value: unknown) {
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
          if (updateValue) {
            const notificationUpdate = updateValue
            notifications.forEach((notification, index) => {
              if (notification.id === filters.id && notification.user_id === filters.user_id) {
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

describe('product notification actions', () => {
  beforeEach(() => {
    createClientMock.mockReset()
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

    const secondPage = await listProductNotifications({ cursor: firstPage.nextCursor })
    expect(secondPage.notifications.map(item => item.id)).toEqual([notificationId(1)])
    expect(secondPage.nextCursor).toBeNull()
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

  it('rejects a malformed notification id before opening a session', async () => {
    await expect(markProductNotificationRead('not-a-uuid')).resolves.toEqual({
      ok: false,
      error: 'Notificación no válida.',
    })

    expect(createClientMock).not.toHaveBeenCalled()
  })
})
