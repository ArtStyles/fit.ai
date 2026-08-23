import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import {
  disableProductPushToken,
  listProductNotifications,
  loadNotificationAttention,
  markProductNotificationRead,
  registerProductPushToken,
  updateProductNotificationPreferences,
} from '../notifications'

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

type NotificationRow = {
  id: string
  user_id: string
  type: string
  title: string
  body: string
  url: string | null
  read_at: string | null
  dismissed_at: string | null
  created_at: string
}

const createClientMock = createClient as unknown as Mock
const revalidatePathMock = revalidatePath as unknown as Mock

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
              && (!('dismissed_at' in filters)
                || notification.dismissed_at === filters.dismissed_at)
            )).length
            return Promise.resolve({ data: null, count, error: null }).then(resolve, reject)
          }

          if (updateValue) {
            const notificationUpdate = updateValue
            notifications.forEach((notification, index) => {
              const matchesReadState = !('read_at' in filters)
                || notification.read_at === filters.read_at
              const matchesDismissedState = !('dismissed_at' in filters)
                || notification.dismissed_at === filters.dismissed_at
              if (
                notification.id === filters.id
                && notification.user_id === filters.user_id
                && matchesReadState
                && matchesDismissedState
              ) {
                notifications[index] = {
                  ...notification,
                  ...('read_at' in notificationUpdate
                    ? { read_at: String(notificationUpdate.read_at) }
                    : {}),
                  ...('dismissed_at' in notificationUpdate
                    ? { dismissed_at: String(notificationUpdate.dismissed_at) }
                    : {}),
                }
              }
            })
            return Promise.resolve({ error: null }).then(resolve, reject)
          }

          let rows = notifications
            .filter(notification => (
              notification.user_id === filters.user_id
              && (!('dismissed_at' in filters)
                || notification.dismissed_at === filters.dismissed_at)
            ))
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
    dismissed_at: null,
    created_at: '2026-08-07T15:00:00.000Z',
  }
}

const ATTENTION_PLAN_ID = '77777777-7777-4777-8777-777777777777'
const ATTENTION_PLAN_UPDATED_AT = '2026-08-20T07:00:00.000Z'

function createAttentionClient({
  dismissedKeys = [],
  planUpdatedAt = ATTENTION_PLAN_UPDATED_AT,
  lastCheckInAt = '2026-08-20T08:00:00.000Z',
  bannerUpdatedAt = '2026-08-20T06:00:00.000Z',
}: {
  dismissedKeys?: string[]
  planUpdatedAt?: string
  lastCheckInAt?: string | null
  bannerUpdatedAt?: string
} = {}) {
  const rows: Record<string, unknown> = {
    profiles: {
      last_check_in_at: lastCheckInAt,
      timezone: 'UTC',
    },
    workout_plans: {
      id: ATTENTION_PLAN_ID,
      name: 'Fuerza base',
      ai_notes: 'Sube el peso de forma gradual.',
      created_at: '2026-08-20T07:00:00.000Z',
      updated_at: planUpdatedAt,
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
      updated_at: bannerUpdatedAt,
    },
  }

  return {
    auth: {
      getUser: vi.fn(async () => ({ data: { user: { id: 'authenticated-user' } } })),
    },
    from: vi.fn((table: string) => {
      const filters: Record<string, unknown> = {}
      const builder: any = {
        select: () => builder,
        eq: (column: string, value: unknown) => {
          filters[column] = value
          return builder
        },
        in: (column: string, values: unknown[]) => {
          filters[column] = values
          return builder
        },
        limit: () => builder,
        maybeSingle: async () => {
          if (table === 'notification_attention_dismissals') {
            const noticeKey = String(filters.notice_key ?? '')
            return {
              data: dismissedKeys.includes(noticeKey) ? { notice_key: noticeKey } : null,
              error: null,
            }
          }
          return { data: rows[table] ?? null, error: null }
        },
        then: (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) => {
          if (table === 'notification_attention_dismissals') {
            const requested = Array.isArray(filters.notice_key)
              ? filters.notice_key.map(String)
              : [String(filters.notice_key ?? '')]
            return Promise.resolve({
              data: dismissedKeys
                .filter(key => requested.includes(key))
                .map(notice_key => ({ notice_key })),
              error: null,
            }).then(resolve, reject)
          }
          return Promise.resolve({ data: rows[table] ?? null, error: null }).then(resolve, reject)
        },
      }
      return builder
    }),
  }
}

function createPlanDismissalClient({
  userId = 'authenticated-user',
  planUpdatedAt = ATTENTION_PLAN_UPDATED_AT,
  planAiNotes = 'Sube el peso de forma gradual.',
  lastCheckInAt = '2026-07-01T08:00:00.000Z',
  profileTimeZone = 'UTC',
  bannerUpdatedAt = '2026-08-20T06:00:00.000Z',
  insertError = null,
}: {
  userId?: string | null
  planUpdatedAt?: string
  planAiNotes?: string | null
  lastCheckInAt?: string | null
  profileTimeZone?: string | null
  bannerUpdatedAt?: string
  insertError?: { code?: string } | null
} = {}) {
  const dismissals = new Set<string>()
  let storedProfileTimeZone = profileTimeZone
  const client = {
    auth: {
      getUser: vi.fn(async () => ({ data: { user: userId ? { id: userId } : null } })),
    },
    rpc: vi.fn(async (name: string, args: { p_notice_key: string }) => {
      if (name !== 'dismiss_current_notification_attention') {
        throw new Error(`Unexpected RPC ${name}`)
      }
      if (insertError) return { data: null, error: insertError }
      try {
        if (!storedProfileTimeZone) return { data: false, error: null }
        new Intl.DateTimeFormat('en-US', { timeZone: storedProfileTimeZone }).format(new Date())
      } catch {
        return { data: false, error: null }
      }

      const noticeKey = args.p_notice_key
      let current = false
      if (noticeKey.startsWith('plan-update:')) {
        const currentKey = `plan-update:${ATTENTION_PLAN_ID}:${planUpdatedAt}`
        const recent = Date.parse(planUpdatedAt) > Date.now() - (7 * 24 * 60 * 60 * 1000)
        current = noticeKey === currentKey && Boolean(planAiNotes) && recent
      } else if (noticeKey.startsWith('check-in:')) {
        const currentKey = `check-in:${lastCheckInAt ?? 'never'}`
        const due = lastCheckInAt === null
          || Date.now() - Date.parse(lastCheckInAt) >= 28 * 24 * 60 * 60 * 1000
        current = noticeKey === currentKey && due
      } else if (noticeKey.startsWith('promo:dashboard-primary:')) {
        current = noticeKey === `promo:dashboard-primary:${bannerUpdatedAt}`
      }

      if (current) dismissals.add(noticeKey)
      return { data: current, error: null }
    }),
    from: vi.fn((table: string) => {
      let updateValue: Record<string, unknown> | null = null
      const builder: any = {
        select: () => builder,
        eq: () => builder,
        is: () => builder,
        update: (value: Record<string, unknown>) => {
          updateValue = value
          return builder
        },
        maybeSingle: async () => ({
          data: table === 'workout_plans'
            ? { id: ATTENTION_PLAN_ID, ai_notes: planAiNotes, updated_at: planUpdatedAt }
            : table === 'profiles'
              ? { last_check_in_at: lastCheckInAt, timezone: storedProfileTimeZone }
              : table === 'dashboard_banners'
                ? {
                    slot: 'dashboard-primary',
                    status: 'active',
                    starts_on: null,
                    ends_on: null,
                    updated_at: bannerUpdatedAt,
                  }
                : null,
          error: null,
        }),
        insert: async (value: { notice_key: string }) => {
          if (table !== 'notification_attention_dismissals') {
            throw new Error(`Unexpected insert on ${table}`)
          }
          if (insertError) return { error: insertError }
          if (dismissals.has(value.notice_key)) return { error: { code: '23505' } }
          dismissals.add(value.notice_key)
          return { error: null }
        },
        then: (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) => {
          if (table === 'profiles' && updateValue && 'timezone' in updateValue) {
            storedProfileTimeZone = String(updateValue.timezone)
          }
          return Promise.resolve({ error: null }).then(resolve, reject)
        },
      }
      return builder
    }),
  }
  return { client, dismissals, getProfileTimeZone: () => storedProfileTimeZone }
}

async function getDismissPlanUpdateNotification() {
  const module = await import('../notifications') as unknown as Record<string, unknown>
  const action = module.dismissPlanUpdateNotification
  expect(action).toEqual(expect.any(Function))
  return action as (noticeKey: string) => Promise<
    { ok: true } | { ok: false; error: string }
  >
}

async function getDismissProductNotification() {
  const module = await import('../notifications') as unknown as Record<string, unknown>
  const action = module.dismissProductNotification
  expect(action).toEqual(expect.any(Function))
  return action as (id: string) => Promise<
    { ok: true } | { ok: false; error: string }
  >
}

async function getDismissNotificationAttention() {
  const module = await import('../notifications') as unknown as Record<string, unknown>
  const action = module.dismissNotificationAttention
  expect(action).toEqual(expect.any(Function))
  return action as (noticeKey: string) => Promise<
    { ok: true } | { ok: false; error: string }
  >
}

describe('product notification actions', () => {
  beforeEach(() => {
    createClientMock.mockReset()
    revalidatePathMock.mockReset()
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

  it('omits archived notifications from both the feed and unread count', async () => {
    const state = createActionClient('authenticated-user')
    state.notifications.push(
      {
        ...notificationRow(1),
        dismissed_at: '2026-08-07T16:00:00.000Z',
      },
      notificationRow(2),
      { ...notificationRow(3), read_at: '2026-08-07T15:30:00.000Z' },
    )
    createClientMock.mockResolvedValue(state.client)

    const page = await listProductNotifications()

    expect(page.notifications.map(notification => notification.id)).toEqual([
      notificationId(3),
      notificationId(2),
    ])
    expect(page.unreadCount).toBe(1)
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

  it('soft-archives only the authenticated owner notification', async () => {
    const state = createActionClient('authenticated-user')
    state.notifications.push(
      notificationRow(1),
      notificationRow(2, 'other-user'),
    )
    createClientMock.mockResolvedValue(state.client)
    const dismiss = await getDismissProductNotification()

    await expect(dismiss(notificationId(1))).resolves.toEqual({ ok: true })
    await expect(dismiss(notificationId(2))).resolves.toEqual({ ok: true })

    expect(state.notifications[0]?.dismissed_at).toEqual(expect.any(String))
    expect(state.notifications[1]?.dismissed_at).toBeNull()
    expect(revalidatePathMock).toHaveBeenCalledWith('/notifications')
  })

  it('rejects a malformed archive id before opening a session', async () => {
    const dismiss = await getDismissProductNotification()

    await expect(dismiss('not-a-uuid')).resolves.toEqual({
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
        dismissalKey: `plan-update:${ATTENTION_PLAN_ID}:${ATTENTION_PLAN_UPDATED_AT}`,
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

  it('hides an exactly dismissed plan update and surfaces the next eligible notice', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-20T12:00:00.000Z'))
    const currentKey = `plan-update:${ATTENTION_PLAN_ID}:${ATTENTION_PLAN_UPDATED_AT}`
    createClientMock.mockResolvedValue(createAttentionClient({ dismissedKeys: [currentKey] }))

    await expect(loadNotificationAttention()).resolves.toEqual({
      status: 'ready',
      attention: {
        notice: { kind: 'promo', title: 'Novedad' },
        aiNotes: null,
        planName: 'Fuerza base',
        dismissalKey: 'promo:dashboard-primary:2026-08-20T06:00:00.000Z',
        promo: expect.objectContaining({ title: 'Novedad' }),
      },
    })
  })

  it('hides a dismissed promotion without hiding a later banner version', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-20T12:00:00.000Z'))
    const planKey = `plan-update:${ATTENTION_PLAN_ID}:${ATTENTION_PLAN_UPDATED_AT}`
    const promoKey = 'promo:dashboard-primary:2026-08-20T06:00:00.000Z'
    createClientMock.mockResolvedValue(createAttentionClient({
      dismissedKeys: [planKey, promoKey],
    }))

    await expect(loadNotificationAttention()).resolves.toEqual({
      status: 'ready',
      attention: null,
    })
  })

  it('shows a later promotion version after the previous version was dismissed', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-21T12:00:00.000Z'))
    const planKey = `plan-update:${ATTENTION_PLAN_ID}:${ATTENTION_PLAN_UPDATED_AT}`
    const previousPromoKey = 'promo:dashboard-primary:2026-08-20T06:00:00.000Z'
    const nextBannerUpdatedAt = '2026-08-21T06:00:00.000Z'
    createClientMock.mockResolvedValue(createAttentionClient({
      dismissedKeys: [planKey, previousPromoKey],
      bannerUpdatedAt: nextBannerUpdatedAt,
    }))

    await expect(loadNotificationAttention()).resolves.toEqual({
      status: 'ready',
      attention: expect.objectContaining({
        notice: { kind: 'promo', title: 'Novedad' },
        dismissalKey: `promo:dashboard-primary:${nextBannerUpdatedAt}`,
      }),
    })
  })

  it('gives a due profile review its own versioned dismissal key', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-20T12:00:00.000Z'))
    const lastCheckInAt = '2026-07-01T08:00:00.000Z'
    createClientMock.mockResolvedValue(createAttentionClient({ lastCheckInAt }))

    await expect(loadNotificationAttention()).resolves.toEqual({
      status: 'ready',
      attention: expect.objectContaining({
        notice: { kind: 'check-in' },
        dismissalKey: `check-in:${lastCheckInAt}`,
      }),
    })
  })

  it('surfaces the next eligible notice after a profile review is dismissed', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-20T12:00:00.000Z'))
    const lastCheckInAt = '2026-07-01T08:00:00.000Z'
    createClientMock.mockResolvedValue(createAttentionClient({
      lastCheckInAt,
      dismissedKeys: [`check-in:${lastCheckInAt}`],
    }))

    await expect(loadNotificationAttention()).resolves.toEqual({
      status: 'ready',
      attention: expect.objectContaining({
        notice: { kind: 'ai-notes', text: 'Sube el peso de forma gradual.' },
        dismissalKey: `plan-update:${ATTENTION_PLAN_ID}:${ATTENTION_PLAN_UPDATED_AT}`,
      }),
    })
  })

  it('persists only the current visible promotion version', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-20T12:00:00.000Z'))
    const state = createPlanDismissalClient()
    createClientMock.mockResolvedValue(state.client)
    const dismiss = await getDismissNotificationAttention()
    const currentKey = 'promo:dashboard-primary:2026-08-20T06:00:00.000Z'

    await expect(dismiss(currentKey)).resolves.toEqual({ ok: true })
    await expect(dismiss('promo:dashboard-primary:2026-08-19T06:00:00.000Z')).resolves.toEqual({
      ok: false,
      error: 'El aviso ya no corresponde a tu estado actual.',
    })

    expect(Array.from(state.dismissals)).toEqual([currentKey])
    expect(state.client.rpc).toHaveBeenCalledWith(
      'dismiss_current_notification_attention',
      { p_notice_key: currentKey },
    )
  })

  it('persists only the currently due profile-review version', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-20T12:00:00.000Z'))
    const lastCheckInAt = '2026-07-01T08:00:00.000Z'
    const state = createPlanDismissalClient({ lastCheckInAt })
    createClientMock.mockResolvedValue(state.client)
    const dismiss = await getDismissNotificationAttention()
    const currentKey = `check-in:${lastCheckInAt}`

    await expect(dismiss(currentKey)).resolves.toEqual({ ok: true })

    expect(Array.from(state.dismissals)).toEqual([currentKey])
    expect(revalidatePathMock).toHaveBeenCalledWith('/notifications')
  })

  it('shows a newly updated plan when only the previous version was dismissed', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-21T12:00:00.000Z'))
    const previousKey = `plan-update:${ATTENTION_PLAN_ID}:${ATTENTION_PLAN_UPDATED_AT}`
    const nextUpdatedAt = '2026-08-21T07:00:00.000Z'
    createClientMock.mockResolvedValue(createAttentionClient({
      dismissedKeys: [previousKey],
      planUpdatedAt: nextUpdatedAt,
    }))

    await expect(loadNotificationAttention()).resolves.toEqual({
      status: 'ready',
      attention: expect.objectContaining({
        notice: { kind: 'ai-notes', text: 'Sube el peso de forma gradual.' },
        dismissalKey: `plan-update:${ATTENTION_PLAN_ID}:${nextUpdatedAt}`,
      }),
    })
  })

  it('persists only the current authenticated plan-version notice key', async () => {
    const state = createPlanDismissalClient()
    createClientMock.mockResolvedValue(state.client)
    const dismiss = await getDismissPlanUpdateNotification()
    const currentKey = `plan-update:${ATTENTION_PLAN_ID}:${ATTENTION_PLAN_UPDATED_AT}`

    await expect(dismiss(currentKey)).resolves.toEqual({ ok: true })

    expect(Array.from(state.dismissals)).toEqual([currentKey])
    expect(state.client.rpc).toHaveBeenCalledWith(
      'dismiss_current_notification_attention',
      { p_notice_key: currentKey },
    )
    expect(revalidatePathMock).toHaveBeenCalledWith('/notifications')
  })

  it('rejects a plan-update key when the active plan has no visible AI notes', async () => {
    const state = createPlanDismissalClient({ planAiNotes: null })
    createClientMock.mockResolvedValue(state.client)
    const dismiss = await getDismissNotificationAttention()
    const noticeKey = `plan-update:${ATTENTION_PLAN_ID}:${ATTENTION_PLAN_UPDATED_AT}`

    await expect(dismiss(noticeKey)).resolves.toEqual({
      ok: false,
      error: 'El aviso ya no corresponde a tu estado actual.',
    })

    expect(state.dismissals.size).toBe(0)
  })

  it('rejects a plan-update key once its seven-day visibility window expires', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-20T12:00:00.000Z'))
    const expiredUpdatedAt = '2026-08-12T07:00:00.000Z'
    const state = createPlanDismissalClient({ planUpdatedAt: expiredUpdatedAt })
    createClientMock.mockResolvedValue(state.client)
    const dismiss = await getDismissNotificationAttention()
    const noticeKey = `plan-update:${ATTENTION_PLAN_ID}:${expiredUpdatedAt}`

    await expect(dismiss(noticeKey)).resolves.toEqual({
      ok: false,
      error: 'El aviso ya no corresponde a tu estado actual.',
    })

    expect(state.dismissals.size).toBe(0)
  })

  it('passes the configured app fallback timezone when the profile has none', async () => {
    const previousTimeZone = process.env.NEXT_PUBLIC_APP_TIME_ZONE
    process.env.NEXT_PUBLIC_APP_TIME_ZONE = 'Pacific/Kiritimati'
    try {
      const state = createPlanDismissalClient({ profileTimeZone: null })
      createClientMock.mockResolvedValue(state.client)
      const dismiss = await getDismissNotificationAttention()
      const noticeKey = `plan-update:${ATTENTION_PLAN_ID}:${ATTENTION_PLAN_UPDATED_AT}`

      await expect(dismiss(noticeKey)).resolves.toEqual({ ok: true })
      expect(state.getProfileTimeZone()).toBe('Pacific/Kiritimati')
      expect(state.client.rpc).toHaveBeenCalledWith(
        'dismiss_current_notification_attention',
        { p_notice_key: noticeKey },
      )
    } finally {
      if (previousTimeZone === undefined) delete process.env.NEXT_PUBLIC_APP_TIME_ZONE
      else process.env.NEXT_PUBLIC_APP_TIME_ZONE = previousTimeZone
    }
  })

  it('rejects malformed dismissal keys before opening a session', async () => {
    const dismiss = await getDismissPlanUpdateNotification()

    await expect(dismiss('plan-update:not-valid')).resolves.toEqual({
      ok: false,
      error: 'Aviso no valido.',
    })

    expect(createClientMock).not.toHaveBeenCalled()
  })

  it('does not persist a stale plan-version notice key', async () => {
    const state = createPlanDismissalClient({
      planUpdatedAt: '2026-08-21T07:00:00.000Z',
    })
    createClientMock.mockResolvedValue(state.client)
    const dismiss = await getDismissPlanUpdateNotification()
    const staleKey = `plan-update:${ATTENTION_PLAN_ID}:${ATTENTION_PLAN_UPDATED_AT}`

    await expect(dismiss(staleKey)).resolves.toEqual({
      ok: false,
      error: 'El aviso ya no corresponde al plan actual.',
    })

    expect(state.dismissals.size).toBe(0)
  })

  it('treats a repeated current-version dismissal as success', async () => {
    const state = createPlanDismissalClient()
    createClientMock.mockResolvedValue(state.client)
    const dismiss = await getDismissPlanUpdateNotification()
    const currentKey = `plan-update:${ATTENTION_PLAN_ID}:${ATTENTION_PLAN_UPDATED_AT}`

    await expect(dismiss(currentKey)).resolves.toEqual({ ok: true })
    await expect(dismiss(currentKey)).resolves.toEqual({ ok: true })

    expect(state.dismissals.size).toBe(1)
  })

  it('keeps the notice visible when dismissal persistence fails', async () => {
    const state = createPlanDismissalClient({ insertError: { code: 'XX000' } })
    createClientMock.mockResolvedValue(state.client)
    const dismiss = await getDismissPlanUpdateNotification()
    const currentKey = `plan-update:${ATTENTION_PLAN_ID}:${ATTENTION_PLAN_UPDATED_AT}`

    await expect(dismiss(currentKey)).resolves.toEqual({
      ok: false,
      error: 'No se pudo quitar el aviso.',
    })

    expect(state.dismissals.size).toBe(0)
  })

  it('keeps the notification history available when attention data cannot load', async () => {
    createClientMock.mockRejectedValue(new Error('attention source unavailable'))

    await expect(loadNotificationAttention()).resolves.toEqual({ status: 'error' })
  })
})
