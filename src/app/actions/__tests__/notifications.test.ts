import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import { createClient } from '@/lib/supabase/server'
import {
  disableProductPushToken,
  registerProductPushToken,
  updateProductNotificationPreferences,
} from '../notifications'

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

  function tableQuery(table: string) {
    const filters: Record<string, unknown> = {}
    let updateValue: Record<string, unknown> | null = null

    const builder: any = {
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

  return { client, tokens, preferences }
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
})
