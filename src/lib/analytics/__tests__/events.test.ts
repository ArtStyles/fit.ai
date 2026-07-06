import { afterEach, describe, expect, it, vi } from 'vitest'
import { sanitizeEvent, trackEvent, type AnalyticsEventName } from '../events'

const EVENT_NAMES: AnalyticsEventName[] = [
  'landing_view',
  'primary_cta_clicked',
  'language_changed',
  'signup_started',
  'signup_completed',
  'onboarding_step_completed',
  'onboarding_abandoned',
  'plan_generated',
  'first_session_started',
  'first_session_completed',
  'plan_adjustment_used',
  'organic_page_cta_clicked',
]

const originalWindow = globalThis.window
const originalNavigator = globalThis.navigator
const originalFetch = globalThis.fetch

function setBrowser(pathname = '/es') {
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: { location: { pathname } },
  })
}

function setNavigator(value: Partial<Navigator>) {
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value })
}

function restoreGlobal(name: 'window' | 'navigator' | 'fetch', value: unknown) {
  if (value === undefined) delete (globalThis as Record<string, unknown>)[name]
  else Object.defineProperty(globalThis, name, { configurable: true, value })
}

afterEach(() => {
  restoreGlobal('window', originalWindow)
  restoreGlobal('navigator', originalNavigator)
  restoreGlobal('fetch', originalFetch)
  vi.restoreAllMocks()
})

describe('sanitizeEvent', () => {
  it.each(EVENT_NAMES)('accepts the exact event union member %s', name => {
    expect(sanitizeEvent({ name, properties: {} })).toEqual({ name, properties: {} })
  })

  it.each([
    ['locale', 'es'], ['locale', 'en'],
    ['path', '/'], ['path', '/es'], ['path', '/en'], ['path', '/register'], ['path', '/onboarding'],
    ['stage', 'profile'], ['stage', 'availability'], ['stage', 'equipment'],
    ['stage', 'safety'], ['stage', 'confirmation'], ['stage', 'generating'],
    ['source', 'landing'], ['source', 'guide'],
    ['screen', 'landing'], ['screen', 'register'], ['screen', 'onboarding'],
    ['authenticated', true], ['authenticated', false],
    ['duration_bucket', 'short'], ['duration_bucket', 'medium'], ['duration_bucket', 'long'],
  ])('accepts documented %s value %j', (key, value) => {
    const properties = { [key]: value }
    expect(sanitizeEvent({ name: 'landing_view', properties }))
      .toEqual({ name: 'landing_view', properties })
  })

  it.each([
    'password_captured',
    '',
    'Landing_View',
    'landing_view_extra',
  ])('rejects unknown event name %j', name => {
    expect(sanitizeEvent({ name, properties: {} })).toBeNull()
  })

  it.each([
    'email', 'password', 'name', 'username', 'injury', 'injuries', 'limitations',
    'weight', 'weight_kg', 'height', 'height_cm', 'age', 'answers', 'copy', 'plan',
    'query', 'search', 'token', 'section', 'user_id', 'anonymous_id',
  ])('rejects forbidden or unknown property key %s', key => {
    expect(sanitizeEvent({
      name: 'signup_started',
      properties: { [key]: 'sensitive' },
    })).toBeNull()
  })

  it.each([
    ['locale', ['fr', 'user@example.com', 'private_username', 'knee injury', 'es\n', 'x'.repeat(65), 1, true, null]],
    ['path', ['/invite/secret-token', '/member/private_username', '/es/arbitrary-slug', '/user@example.com', '/onboarding\n', `/${'x'.repeat(200)}`, 1, true, null]],
    ['stage', ['unknown', 'user@example.com', 'private_username', 'knee injury', 'profile\n', 'x'.repeat(65), 1, true, null]],
    ['source', ['unknown', 'user@example.com', 'private_username', 'knee injury', 'landing\n', 'x'.repeat(65), 1, true, null]],
    ['screen', ['home', 'user@example.com', 'private_username', 'knee injury', 'landing\n', 'x'.repeat(65), 1, true, null]],
    ['authenticated', ['true', 'user@example.com', 'private_username', 'knee injury', 'true\n', 'x'.repeat(65), 1, null]],
    ['duration_bucket', ['tiny', 'user@example.com', 'private_username', 'knee injury', 'short\n', 'x'.repeat(65), 1, true, null]],
  ])('rejects unsafe %s values', (key, values) => {
    for (const value of values) {
      expect(sanitizeEvent({
        name: 'landing_view',
        properties: { [key]: value },
      }), `${key} accepted ${String(value)}`).toBeNull()
    }
  })

  it.each([
    undefined,
    ['nested'],
    { nested: true },
    Number.NaN,
    Number.POSITIVE_INFINITY,
    Number.NEGATIVE_INFINITY,
  ])('rejects non-scalar or non-JSON-safe value %j', value => {
    expect(sanitizeEvent({ name: 'landing_view', properties: { source: value } })).toBeNull()
  })

  it.each([
    null,
    undefined,
    'landing_view',
    [],
    { name: 'landing_view' },
    { name: 'landing_view', properties: {}, user_id: 'attacker-controlled' },
  ])('rejects malformed or augmented top-level payload %j', payload => {
    expect(sanitizeEvent(payload)).toBeNull()
  })

  it.each([
    'es',
    'es?email=user@example.com',
    '/es#token',
    '/invite/secret-token',
    '/member/private_username',
    '/es/arbitrary-slug',
    '/u/private_username',
    '/user@example.com',
    '/user%40example.com',
    `/${'a'.repeat(200)}`,
  ])('rejects unsafe pathname %j', path => {
    expect(sanitizeEvent({ name: 'landing_view', properties: { path } })).toBeNull()
  })

  it('rejects oversized and multi-byte free-form property values', () => {
    expect(sanitizeEvent({
      name: 'landing_view',
      properties: { source: '\u00e9'.repeat(510) },
    })).toBeNull()
  })
})

describe('trackEvent', () => {
  it('uses a same-origin JSON beacon with window.location.pathname', async () => {
    setBrowser('/en')
    const sendBeacon = vi.fn((_url: string, _data?: BodyInit | null) => true)
    setNavigator({ sendBeacon })
    const fetchMock = vi.fn()
    globalThis.fetch = fetchMock

    await trackEvent('landing_view', { locale: 'en', path: '/onboarding' })

    expect(sendBeacon).toHaveBeenCalledOnce()
    const [url, body] = sendBeacon.mock.calls[0]!
    expect(url).toBe('/api/analytics')
    expect(body).toBeInstanceOf(Blob)
    const blob = body as Blob
    expect(blob.type).toBe('application/json')
    await expect(blob.text()).resolves.toBe(JSON.stringify({
      name: 'landing_view',
      properties: { locale: 'en', path: '/en' },
    }))
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it.each([
    { navigatorValue: {}, label: 'is unavailable' },
    { navigatorValue: { sendBeacon: vi.fn(() => false) }, label: 'declines the payload' },
    { navigatorValue: { sendBeacon: vi.fn(() => { throw new Error('blocked') }) }, label: 'throws' },
  ])('falls back to keepalive fetch when sendBeacon $label', async ({ navigatorValue }) => {
    setBrowser('/register')
    setNavigator(navigatorValue)
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 202 }))
    globalThis.fetch = fetchMock

    await trackEvent('signup_started', { screen: 'register' })

    expect(fetchMock).toHaveBeenCalledWith('/api/analytics', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'signup_started',
        properties: { screen: 'register', path: '/register' },
      }),
      credentials: 'same-origin',
      keepalive: true,
    })
  })

  it('does not transmit an event that becomes invalid after pathname capture', async () => {
    setBrowser('/invite/secret-token')
    const sendBeacon = vi.fn(() => true)
    setNavigator({ sendBeacon })
    const fetchMock = vi.fn()
    globalThis.fetch = fetchMock

    await trackEvent('landing_view')

    expect(sendBeacon).not.toHaveBeenCalled()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('does nothing during server rendering', async () => {
    delete (globalThis as Record<string, unknown>).window
    const sendBeacon = vi.fn(() => true)
    setNavigator({ sendBeacon })

    await trackEvent('landing_view')

    expect(sendBeacon).not.toHaveBeenCalled()
  })

  it('absorbs network failures so analytics cannot break product flows', async () => {
    setBrowser('/onboarding')
    setNavigator({})
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('offline'))

    await expect(trackEvent('onboarding_abandoned', { stage: 'profile' })).resolves.toBeUndefined()
  })
})
