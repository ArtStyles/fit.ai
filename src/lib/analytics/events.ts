export type AnalyticsEventName =
  | 'landing_view'
  | 'primary_cta_clicked'
  | 'language_changed'
  | 'signup_started'
  | 'signup_completed'
  | 'onboarding_step_completed'
  | 'onboarding_abandoned'
  | 'plan_generated'
  | 'first_session_started'
  | 'first_session_completed'
  | 'plan_adjustment_used'
  | 'organic_page_cta_clicked'

type AnalyticsScalar = string | number | boolean

export type AnalyticsProperties = Partial<Record<
  'locale' | 'path' | 'stage' | 'source' | 'screen' | 'authenticated' | 'duration_bucket',
  AnalyticsScalar
>>

export type SanitizedAnalyticsEvent = {
  name: AnalyticsEventName
  properties: AnalyticsProperties
}

const EVENT_NAMES = new Set<AnalyticsEventName>([
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
])

const PROPERTY_KEYS = new Set<keyof AnalyticsProperties>([
  'locale',
  'path',
  'stage',
  'source',
  'screen',
  'authenticated',
  'duration_bucket',
])

const MAX_PROPERTIES_BYTES = 1024
const MAX_PATH_LENGTH = 200

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

function isScalar(value: unknown): value is AnalyticsScalar {
  return (
    typeof value === 'string' ||
    typeof value === 'boolean' ||
    typeof value === 'number' && Number.isFinite(value)
  )
}

function isSafePath(path: string): boolean {
  if (!path.startsWith('/') || path.length > MAX_PATH_LENGTH || path.includes('?') || path.includes('#')) {
    return false
  }

  let decoded: string
  try {
    decoded = decodeURIComponent(path)
  } catch {
    return false
  }

  const hasControlCharacter = Array.from(decoded).some(character => {
    const code = character.charCodeAt(0)
    return code <= 31 || code === 127
  })
  if (decoded.includes('@') || hasControlCharacter) return false

  const normalized = decoded.toLowerCase()
  return !(
    /(?:^|\/)(?:u|user|users|profile)\/[^/]+/.test(normalized) ||
    /(?:^|\/)(?:buscar|search)\/[^/]+/.test(normalized) ||
    /(?:^|\/)(?:token|verify|confirm|reset)(?:\/|$)/.test(normalized) ||
    /(?:^|\/)auth\/(?:callback|confirm|verify|reset)(?:\/|$)/.test(normalized)
  )
}

function serializedByteLength(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value)).byteLength
}

export function sanitizeEvent(input: unknown): SanitizedAnalyticsEvent | null {
  try {
    if (!isPlainRecord(input)) return null
    if (Object.keys(input).length !== 2 || !('name' in input) || !('properties' in input)) return null
    if (typeof input.name !== 'string' || !EVENT_NAMES.has(input.name as AnalyticsEventName)) return null
    if (!isPlainRecord(input.properties)) return null

    const properties: AnalyticsProperties = {}
    for (const [key, value] of Object.entries(input.properties)) {
      if (!PROPERTY_KEYS.has(key as keyof AnalyticsProperties) || !isScalar(value)) return null
      if (key === 'path' && (typeof value !== 'string' || !isSafePath(value))) return null
      properties[key as keyof AnalyticsProperties] = value
    }

    if (serializedByteLength(properties) > MAX_PROPERTIES_BYTES) return null

    return { name: input.name as AnalyticsEventName, properties }
  } catch {
    return null
  }
}

export async function trackEvent(
  name: AnalyticsEventName,
  properties: AnalyticsProperties = {},
): Promise<void> {
  if (typeof window === 'undefined') return

  const event = sanitizeEvent({
    name,
    properties: { ...properties, path: window.location.pathname },
  })
  if (!event) return

  const body = JSON.stringify(event)
  if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
    try {
      const accepted = navigator.sendBeacon(
        '/api/analytics',
        new Blob([body], { type: 'application/json' }),
      )
      if (accepted) return
    } catch {
      // Some browsers or policies reject beacon payloads; keepalive fetch is safe fallback.
    }
  }

  try {
    await fetch('/api/analytics', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      credentials: 'same-origin',
      keepalive: true,
    })
  } catch {
    // Measurement must never interrupt registration, onboarding, or navigation.
  }
}
