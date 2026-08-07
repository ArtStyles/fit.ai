import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import { createServiceClient } from '@/lib/supabase/service'
import { createProductNotification } from '../product'

const firebase = vi.hoisted(() => ({
  sendEachForMulticast: vi.fn(),
}))

vi.mock('firebase-admin/app', () => ({
  cert: vi.fn(),
  getApps: vi.fn(() => [{}]),
  initializeApp: vi.fn(),
}))

vi.mock('firebase-admin/messaging', () => ({
  getMessaging: vi.fn(() => ({
    sendEachForMulticast: firebase.sendEachForMulticast,
  })),
}))

const createServiceClientMock = createServiceClient as unknown as Mock

type NotificationRow = {
  id: string
  user_id: string
  type: string
  title: string
  body: string
  url: string | null
  payload: unknown
  dedupe_key: string
  read_at: string | null
  created_at: string
}

type ProductServiceOptions = {
  tokens?: string[]
  pushEnabled?: boolean
  professionalEnabled?: boolean
  events?: string[]
}

function createProductService({
  tokens = [],
  pushEnabled = true,
  professionalEnabled = true,
  events = [],
}: ProductServiceOptions = {}) {
  const notifications = new Map<string, NotificationRow>()
  const disabledTokens = new Set<string>()
  let sequence = 0

  function notificationQuery() {
    let operation: 'read' | 'insert' = 'read'
    let insertValue: Record<string, unknown> | null = null
    const filters: Record<string, unknown> = {}

    const builder: any = {
      insert(value: Record<string, unknown>) {
        operation = 'insert'
        insertValue = value
        return builder
      },
      select() {
        return builder
      },
      eq(column: string, value: unknown) {
        filters[column] = value
        return builder
      },
      async maybeSingle() {
        if (operation === 'insert' && insertValue) {
          const key = `${insertValue.user_id}:${insertValue.dedupe_key}`
          if (notifications.has(key)) {
            return { data: null, error: { code: '23505', message: 'duplicate key' } }
          }

          sequence += 1
          const row: NotificationRow = {
            id: `notification-${sequence}`,
            user_id: String(insertValue.user_id),
            type: String(insertValue.type),
            title: String(insertValue.title),
            body: String(insertValue.body),
            url: insertValue.url === null ? null : String(insertValue.url),
            payload: insertValue.payload ?? {},
            dedupe_key: String(insertValue.dedupe_key),
            read_at: null,
            created_at: '2026-08-07T12:00:00.000Z',
          }
          notifications.set(key, row)
          events.push('persisted')
          return { data: row, error: null }
        }

        const key = `${filters.user_id}:${filters.dedupe_key}`
        return { data: notifications.get(key) ?? null, error: null }
      },
      single() {
        return builder.maybeSingle()
      },
    }
    return builder
  }

  function preferencesQuery() {
    const result = {
      data: { push_enabled: pushEnabled, professional_enabled: professionalEnabled },
      error: null,
    }
    const builder: any = {
      select: () => builder,
      eq: () => builder,
      maybeSingle: () => Promise.resolve(result),
    }
    return builder
  }

  function tokensQuery() {
    let updateValue: { enabled?: boolean } | null = null
    let selectedTokens = [...tokens]
    const builder: any = {
      select: () => builder,
      update(value: { enabled?: boolean }) {
        updateValue = value
        return builder
      },
      eq(column: string, value: unknown) {
        if (column === 'enabled' && value === true) {
          selectedTokens = selectedTokens.filter(token => !disabledTokens.has(token))
        }
        return builder
      },
      in(column: string, values: string[]) {
        if (column === 'token' && updateValue?.enabled === false) {
          values.forEach(token => disabledTokens.add(token))
        }
        return builder
      },
      then(resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) {
        const result = updateValue
          ? { data: null, error: null }
          : { data: selectedTokens.map(token => ({ token })), error: null }
        return Promise.resolve(result).then(resolve, reject)
      },
    }
    return builder
  }

  return {
    service: {
      from: vi.fn((table: string) => {
        if (table === 'product_notifications') return notificationQuery()
        if (table === 'product_notification_preferences') return preferencesQuery()
        if (table === 'product_push_tokens') return tokensQuery()
        throw new Error(`Unexpected table: ${table}`)
      }),
    },
    notifications,
    disabledTokens,
  }
}

const input = {
  recipientUserId: '11111111-1111-4111-8111-111111111111',
  type: 'trainer_application_status' as const,
  title: 'Solicitud recibida',
  body: 'Tu solicitud fue recibida y sera revisada.',
  url: '/coach/apply' as const,
  dedupeKey: 'trainer-application:application-1:submitted',
  payload: { applicationId: 'application-1' },
}

describe('createProductNotification', () => {
  beforeEach(() => {
    process.env.FIREBASE_SERVICE_ACCOUNT_JSON = JSON.stringify({
      project_id: 'fitai-test',
      client_email: 'firebase@example.test',
      private_key: 'private-key',
    })
    firebase.sendEachForMulticast.mockReset()
    firebase.sendEachForMulticast.mockResolvedValue({
      responses: [{ success: true }],
    })
    createServiceClientMock.mockReset()
  })

  afterEach(() => {
    delete process.env.FIREBASE_SERVICE_ACCOUNT_JSON
  })

  it('rejects an external destination before persisting anything', async () => {
    await expect(createProductNotification({
      ...input,
      url: 'https://malicious.example/coach' as `/${string}`,
    })).rejects.toThrow('URL interna no valida')

    expect(createServiceClientMock).not.toHaveBeenCalled()
  })

  it('persists the in-app event before attempting native delivery', async () => {
    const events: string[] = []
    const state = createProductService({ tokens: ['token-a'], events })
    createServiceClientMock.mockReturnValue(state.service)
    firebase.sendEachForMulticast.mockImplementation(async () => {
      events.push('push-attempted')
      return { responses: [{ success: true }] }
    })

    const result = await createProductNotification(input)

    expect(result).toMatchObject({
      user_id: input.recipientUserId,
      dedupe_key: input.dedupeKey,
      url: input.url,
    })
    expect(Array.from(state.notifications.values())).toHaveLength(1)
    expect(events).toEqual(['persisted', 'push-attempted'])
  })

  it('returns the original event and does not send a second push for the same dedupe key', async () => {
    const state = createProductService({ tokens: ['token-a'] })
    createServiceClientMock.mockReturnValue(state.service)

    const first = await createProductNotification(input)
    const retried = await createProductNotification({
      ...input,
      title: 'Este texto no debe sustituir el original',
    })

    expect(retried).toEqual(first)
    expect(retried.title).toBe('Solicitud recibida')
    expect(Array.from(state.notifications.values())).toHaveLength(1)
    expect(firebase.sendEachForMulticast).toHaveBeenCalledTimes(1)
  })

  it('normalizes a dedupe key consistently across a retry', async () => {
    const state = createProductService({ tokens: ['token-a'] })
    createServiceClientMock.mockReturnValue(state.service)

    const first = await createProductNotification({ ...input, dedupeKey: `  ${input.dedupeKey}  ` })
    const retried = await createProductNotification({ ...input, dedupeKey: `  ${input.dedupeKey}  ` })

    expect(retried).toEqual(first)
    expect(retried.dedupe_key).toBe(input.dedupeKey)
    expect(firebase.sendEachForMulticast).toHaveBeenCalledTimes(1)
  })

  it('limits Firebase batches to 500 tokens and disables invalid registrations', async () => {
    const tokens = Array.from({ length: 501 }, (_, index) => `token-${index}`)
    const state = createProductService({ tokens })
    createServiceClientMock.mockReturnValue(state.service)
    firebase.sendEachForMulticast
      .mockResolvedValueOnce({
        responses: Array.from({ length: 500 }, (_, index) => index === 17
          ? { success: false, error: { code: 'messaging/registration-token-not-registered' } }
          : { success: true }),
      })
      .mockResolvedValueOnce({
        responses: [{ success: false, error: { code: 'messaging/internal-error' } }],
      })

    await createProductNotification(input)

    const batches = firebase.sendEachForMulticast.mock.calls.map(([message]) => message.tokens.length)
    expect(batches).toEqual([500, 1])
    expect(state.disabledTokens).toEqual(new Set(['token-17']))
  })

  it('keeps and returns the persisted event when Firebase rejects delivery', async () => {
    const state = createProductService({ tokens: ['token-a'] })
    createServiceClientMock.mockReturnValue(state.service)
    firebase.sendEachForMulticast.mockRejectedValue(new Error('Firebase unavailable'))

    await expect(createProductNotification(input)).resolves.toMatchObject({
      dedupe_key: input.dedupeKey,
    })
    expect(Array.from(state.notifications.values())).toHaveLength(1)
  })
})
