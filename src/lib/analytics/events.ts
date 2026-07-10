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
  | 'second_session_completed'
  | 'plan_adjustment_used'
  | 'organic_page_cta_clicked'
  | 'paywall_viewed'
  | 'checkout_started'
  | 'pro_interest_submitted'

export const ANALYTICS_LOCALES = ['es', 'en'] as const
export const ANALYTICS_PATHS = ['/', '/es', '/en', '/register', '/onboarding', '/pricing', '/session'] as const
export const ANALYTICS_STAGES = [
  'profile', 'availability', 'equipment', 'safety', 'confirmation', 'generating',
] as const
export const ANALYTICS_SOURCES = ['landing', 'guide', 'pricing'] as const
export const ANALYTICS_SCREENS = ['landing', 'register', 'onboarding', 'pricing', 'session'] as const
export const ANALYTICS_DURATION_BUCKETS = ['short', 'medium', 'long'] as const

export type AnalyticsProperties = {
  locale?: (typeof ANALYTICS_LOCALES)[number]
  path?: (typeof ANALYTICS_PATHS)[number]
  stage?: (typeof ANALYTICS_STAGES)[number]
  source?: (typeof ANALYTICS_SOURCES)[number]
  screen?: (typeof ANALYTICS_SCREENS)[number]
  authenticated?: boolean
  duration_bucket?: (typeof ANALYTICS_DURATION_BUCKETS)[number]
}

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
  'second_session_completed',
  'plan_adjustment_used',
  'organic_page_cta_clicked',
  'paywall_viewed',
  'checkout_started',
  'pro_interest_submitted',
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

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

function isOneOf<T extends string>(value: unknown, values: readonly T[]): value is T {
  return typeof value === 'string' && (values as readonly string[]).includes(value)
}

const PROPERTY_VALIDATORS: Record<keyof AnalyticsProperties, (value: unknown) => boolean> = {
  locale: value => isOneOf(value, ANALYTICS_LOCALES),
  path: value => isOneOf(value, ANALYTICS_PATHS),
  stage: value => isOneOf(value, ANALYTICS_STAGES),
  source: value => isOneOf(value, ANALYTICS_SOURCES),
  screen: value => isOneOf(value, ANALYTICS_SCREENS),
  authenticated: value => typeof value === 'boolean',
  duration_bucket: value => isOneOf(value, ANALYTICS_DURATION_BUCKETS),
}

function serializedByteLength(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value)).byteLength
}

export function normalizeAnalyticsPath(pathname: string): (typeof ANALYTICS_PATHS)[number] | null {
  if ((ANALYTICS_PATHS as readonly string[]).includes(pathname)) {
    return pathname as (typeof ANALYTICS_PATHS)[number]
  }

  if (pathname === '/session' || pathname.startsWith('/session/')) return '/session'

  return null
}

export function sanitizeEvent(input: unknown): SanitizedAnalyticsEvent | null {
  try {
    if (!isPlainRecord(input)) return null
    if (Object.keys(input).length !== 2 || !('name' in input) || !('properties' in input)) return null
    if (typeof input.name !== 'string' || !EVENT_NAMES.has(input.name as AnalyticsEventName)) return null
    if (!isPlainRecord(input.properties)) return null

    const properties: Record<string, string | boolean> = {}
    for (const [key, value] of Object.entries(input.properties)) {
      if (!PROPERTY_KEYS.has(key as keyof AnalyticsProperties)) return null
      const propertyKey = key as keyof AnalyticsProperties
      if (!PROPERTY_VALIDATORS[propertyKey](value)) return null
      properties[key] = value as string | boolean
    }

    if (serializedByteLength(properties) > MAX_PROPERTIES_BYTES) return null

    return { name: input.name as AnalyticsEventName, properties: properties as AnalyticsProperties }
  } catch {
    return null
  }
}

export async function trackEvent(
  name: AnalyticsEventName,
  properties: AnalyticsProperties = {},
): Promise<void> {
  if (typeof window === 'undefined') return

  const path = normalizeAnalyticsPath(window.location.pathname)
  const event = sanitizeEvent({
    name,
    properties: { ...properties, path: path ?? window.location.pathname },
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
