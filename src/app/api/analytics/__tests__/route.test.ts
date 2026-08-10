import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { POST } from '../route'

const createClientMock = createClient as unknown as Mock
const createServiceClientMock = createServiceClient as unknown as Mock

const VALID_UUID = '8a629f3c-65c7-4ad7-9444-3f2d8f93f146'

function request(
  body: unknown,
  options: { origin?: string | null; cookie?: string; contentType?: string; rawBody?: string } = {},
) {
  const headers = new Headers()
  if (options.origin !== null) headers.set('Origin', options.origin ?? 'https://vekira.test')
  if (options.cookie) headers.set('Cookie', options.cookie)
  if (options.contentType !== null) headers.set('Content-Type', options.contentType ?? 'application/json')

  return new NextRequest('https://vekira.test/api/analytics', {
    method: 'POST',
    headers,
    body: options.rawBody ?? JSON.stringify(body),
  })
}

function installSupabaseMocks({
  userId = 'server-user-id',
  authError = null as Error | null,
  insertError = null as { message: string } | null,
} = {}) {
  const getUser = vi.fn().mockResolvedValue({
    data: { user: userId ? { id: userId } : null },
    error: authError,
  })
  const insert = vi.fn().mockResolvedValue({ error: insertError })
  const from = vi.fn(() => ({ insert }))
  createClientMock.mockResolvedValue({ auth: { getUser } })
  createServiceClientMock.mockReturnValue({ from })
  return { getUser, insert, from }
}

beforeEach(() => {
  createClientMock.mockReset()
  createServiceClientMock.mockReset()
})

describe('POST /api/analytics', () => {
  it('rejects a missing or cross-origin Origin before touching Supabase', async () => {
    const missing = await POST(request({ name: 'landing_view', properties: {} }, { origin: null }))
    const crossOrigin = await POST(request(
      { name: 'landing_view', properties: {} },
      { origin: 'https://attacker.test' },
    ))

    expect(missing.status).toBe(400)
    expect(crossOrigin.status).toBe(400)
    expect(createClientMock).not.toHaveBeenCalled()
    expect(createServiceClientMock).not.toHaveBeenCalled()
  })

  it('rejects non-JSON and malformed JSON bodies', async () => {
    const nonJson = await POST(request(
      { name: 'landing_view', properties: {} },
      { contentType: 'text/plain' },
    ))
    const malformed = await POST(request(null, { rawBody: '{' }))

    expect(nonJson.status).toBe(400)
    expect(malformed.status).toBe(400)
  })

  it('enforces the 2 KB raw-body limit before parsing or storage', async () => {
    const oversized = 'x'.repeat(2049)

    const response = await POST(request(null, { rawBody: oversized }))

    expect(response.status).toBe(400)
    expect(createClientMock).not.toHaveBeenCalled()
    expect(createServiceClientMock).not.toHaveBeenCalled()
  })

  it('rejects invalid and privacy-unsafe events with 400', async () => {
    const invalidName = await POST(request({ name: 'password_captured', properties: {} }))
    const sensitiveKey = await POST(request({
      name: 'signup_started',
      properties: { email: 'private@example.com' },
    }))
    const unsafePath = await POST(request({
      name: 'landing_view',
      properties: { path: '/es?token=secret' },
    }))
    const piiInAllowedKey = await POST(request({
      name: 'signup_started',
      properties: { source: 'private@example.com' },
    }))
    const unknownStaticPath = await POST(request({
      name: 'landing_view',
      properties: { path: '/invite/secret-token' },
    }))

    expect(invalidName.status).toBe(400)
    expect(sensitiveKey.status).toBe(400)
    expect(unsafePath.status).toBe(400)
    expect(piiInAllowedKey.status).toBe(400)
    expect(unknownStaticPath.status).toBe(400)
    expect(createServiceClientMock).not.toHaveBeenCalled()
  })

  it('derives the user id server-side and inserts only the sanitized event', async () => {
    const { getUser, from, insert } = installSupabaseMocks()
    const event = {
      name: 'onboarding_step_completed',
      properties: {
        path: '/onboarding',
        stage: 'profile',
        screen: 'onboarding',
        authenticated: true,
      },
    }

    const response = await POST(request(event, {
      cookie: `fitai-anonymous-id=${VALID_UUID}`,
    }))

    expect(response.status).toBe(202)
    expect(getUser).toHaveBeenCalledOnce()
    expect(from).toHaveBeenCalledWith('product_events')
    expect(insert).toHaveBeenCalledWith({
      event_name: 'onboarding_step_completed',
      anonymous_id: VALID_UUID,
      user_id: 'server-user-id',
      locale: null,
      path: '/onboarding',
      properties: event.properties,
    })
    expect(response.headers.get('set-cookie')).toBeNull()
  })

  it('stores an anonymous event when auth lookup fails', async () => {
    const { insert } = installSupabaseMocks({
      userId: '',
      authError: new Error('expired session'),
    })

    const response = await POST(request({
      name: 'landing_view',
      properties: { locale: 'en', path: '/en' },
    }, { cookie: `fitai-anonymous-id=${VALID_UUID}` }))

    expect(response.status).toBe(202)
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ user_id: null }))
  })

  it('stores coach aggregates without an actor identity or persistent cookie', async () => {
    const insert = vi.fn().mockResolvedValue({ error: null })
    const from = vi.fn(() => ({ insert }))
    createServiceClientMock.mockReturnValue({ from })

    const response = await POST(request({
      name: 'coach_client_insights_viewed',
      properties: {
        period_weeks: 4,
        prescribed_session_count: 8,
        evidence_session_count: 6,
      },
    }, { cookie: `fitai-anonymous-id=${VALID_UUID}` }))

    expect(response.status).toBe(202)
    expect(createClientMock).not.toHaveBeenCalled()
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({
      event_name: 'coach_client_insights_viewed',
      user_id: null,
      anonymous_id: '00000000-0000-4000-8000-000000000000',
    }))
    expect(response.headers.get('set-cookie')).toBeNull()
  })

  it('sets a server-generated HttpOnly SameSite=Lax UUID cookie when absent', async () => {
    const { insert } = installSupabaseMocks({ userId: '' })

    const response = await POST(request({ name: 'landing_view', properties: { path: '/es' } }))

    expect(response.status).toBe(202)
    const inserted = insert.mock.calls[0]?.[0]
    expect(inserted.anonymous_id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    )
    const cookie = response.headers.get('set-cookie') ?? ''
    expect(cookie).toContain(`fitai-anonymous-id=${inserted.anonymous_id}`)
    expect(cookie.toLowerCase()).toContain('httponly')
    expect(cookie.toLowerCase()).toContain('samesite=lax')
    expect(cookie.toLowerCase()).toContain('path=/')
  })

  it('replaces an invalid client-supplied anonymous cookie', async () => {
    const { insert } = installSupabaseMocks({ userId: '' })

    const response = await POST(request(
      { name: 'landing_view', properties: { path: '/es' } },
      { cookie: 'fitai-anonymous-id=attacker-value' },
    ))

    const inserted = insert.mock.calls[0]?.[0]
    expect(inserted.anonymous_id).not.toBe('attacker-value')
    expect(response.headers.get('set-cookie')).toContain(inserted.anonymous_id)
  })

  it('returns 500 without accepting the event when storage fails', async () => {
    installSupabaseMocks({ insertError: { message: 'database unavailable' } })

    const response = await POST(request(
      { name: 'landing_view', properties: { path: '/es' } },
      { cookie: `fitai-anonymous-id=${VALID_UUID}` },
    ))

    expect(response.status).toBe(500)
    const payload = await response.json()
    expect(payload).toEqual({
      error: {
        code: 'ANALYTICS_STORAGE_UNAVAILABLE',
        correlationId: expect.stringMatching(/^[0-9a-f-]{36}$/i),
      },
    })
    expect(JSON.stringify(payload)).not.toContain('database unavailable')
  })
})
