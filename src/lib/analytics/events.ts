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
  | 'coach_overview_viewed'
  | 'coach_client_insights_viewed'
  | 'coach_alert_filter_used'

export const ANALYTICS_LOCALES = ['es', 'en'] as const
export const ANALYTICS_PATHS = ['/', '/es', '/en', '/register', '/onboarding'] as const
export const ANALYTICS_STAGES = [
  'profile', 'availability', 'equipment', 'safety', 'confirmation', 'generating',
] as const
export const ANALYTICS_SOURCES = ['landing', 'guide'] as const
export const ANALYTICS_SCREENS = ['landing', 'register', 'onboarding'] as const
export const ANALYTICS_DURATION_BUCKETS = ['short', 'medium', 'long'] as const
export const ANALYTICS_INSIGHT_PERIODS = [4, 12] as const
export const ANALYTICS_ALERT_FILTERS = ['all', 'attention'] as const

export type AnalyticsProperties = {
  locale?: (typeof ANALYTICS_LOCALES)[number]
  path?: (typeof ANALYTICS_PATHS)[number]
  stage?: (typeof ANALYTICS_STAGES)[number]
  source?: (typeof ANALYTICS_SOURCES)[number]
  screen?: (typeof ANALYTICS_SCREENS)[number]
  authenticated?: boolean
  duration_bucket?: (typeof ANALYTICS_DURATION_BUCKETS)[number]
  active_client_count?: number
  pending_request_count?: number
  paused_relationship_count?: number
  period_weeks?: (typeof ANALYTICS_INSIGHT_PERIODS)[number]
  prescribed_session_count?: number
  evidence_session_count?: number
  measurements_shared?: boolean
  alert_filter?: (typeof ANALYTICS_ALERT_FILTERS)[number]
  matching_client_count?: number
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
  'plan_adjustment_used',
  'organic_page_cta_clicked',
  'coach_overview_viewed',
  'coach_client_insights_viewed',
  'coach_alert_filter_used',
])

const PROPERTY_KEYS = new Set<keyof AnalyticsProperties>([
  'locale',
  'path',
  'stage',
  'source',
  'screen',
  'authenticated',
  'duration_bucket',
  'active_client_count',
  'pending_request_count',
  'paused_relationship_count',
  'period_weeks',
  'prescribed_session_count',
  'evidence_session_count',
  'measurements_shared',
  'alert_filter',
  'matching_client_count',
])

const LEGACY_PROPERTY_KEYS = new Set<keyof AnalyticsProperties>([
  'locale', 'path', 'stage', 'source', 'screen', 'authenticated', 'duration_bucket',
])

const INSIGHT_EVENT_PROPERTY_KEYS: Record<Extract<AnalyticsEventName,
  'coach_overview_viewed' | 'coach_client_insights_viewed' | 'coach_alert_filter_used'>,
readonly (keyof AnalyticsProperties)[]> = {
  coach_overview_viewed: ['active_client_count', 'pending_request_count', 'paused_relationship_count'],
  coach_client_insights_viewed: ['period_weeks', 'prescribed_session_count', 'evidence_session_count', 'measurements_shared'],
  coach_alert_filter_used: ['alert_filter', 'matching_client_count'],
}

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
  active_client_count: value => isAggregateCount(value),
  pending_request_count: value => isAggregateCount(value),
  paused_relationship_count: value => isAggregateCount(value),
  period_weeks: value => typeof value === 'number' && (ANALYTICS_INSIGHT_PERIODS as readonly number[]).includes(value),
  prescribed_session_count: value => isAggregateCount(value),
  evidence_session_count: value => isAggregateCount(value),
  measurements_shared: value => typeof value === 'boolean',
  alert_filter: value => isOneOf(value, ANALYTICS_ALERT_FILTERS),
  matching_client_count: value => isAggregateCount(value),
}

function isAggregateCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && value <= 10_000
}

function allowedPropertiesForEvent(name: AnalyticsEventName): ReadonlySet<keyof AnalyticsProperties> {
  if (name in INSIGHT_EVENT_PROPERTY_KEYS) {
    return new Set(INSIGHT_EVENT_PROPERTY_KEYS[name as keyof typeof INSIGHT_EVENT_PROPERTY_KEYS])
  }
  return LEGACY_PROPERTY_KEYS
}

function capturesPath(name: AnalyticsEventName): boolean {
  return allowedPropertiesForEvent(name).has('path')
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

    const propertyKeys = allowedPropertiesForEvent(input.name as AnalyticsEventName)
    const properties: Record<string, string | number | boolean> = {}
    for (const [key, value] of Object.entries(input.properties)) {
      if (!PROPERTY_KEYS.has(key as keyof AnalyticsProperties) || !propertyKeys.has(key as keyof AnalyticsProperties)) return null
      const propertyKey = key as keyof AnalyticsProperties
      if (!PROPERTY_VALIDATORS[propertyKey](value)) return null
      properties[key] = value as string | number | boolean
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

  const event = sanitizeEvent({
    name,
    properties: capturesPath(name) ? { ...properties, path: window.location.pathname } : properties,
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
