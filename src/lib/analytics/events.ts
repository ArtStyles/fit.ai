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
  | 'coach_overview_viewed'
  | 'coach_client_insights_viewed'
  | 'coach_alert_filter_used'

export const ANALYTICS_LOCALES = ['es', 'en'] as const
export const ANALYTICS_PATHS = ['/', '/es', '/en', '/register', '/onboarding', '/pricing', '/session'] as const
export const ANALYTICS_STAGES = [
  'profile', 'availability', 'equipment', 'safety', 'confirmation', 'generating',
] as const
export const ANALYTICS_SOURCES = ['landing', 'guide', 'pricing'] as const
export const ANALYTICS_SCREENS = ['landing', 'register', 'onboarding', 'pricing', 'session'] as const
export const ANALYTICS_DURATION_BUCKETS = ['short', 'medium', 'long'] as const
export const ANALYTICS_INSIGHT_PERIODS = [4, 12] as const
export const ANALYTICS_ALERT_FILTERS = ['all', 'attention'] as const
export const COACH_AGGREGATE_EVENTS = [
  'coach_overview_viewed',
  'coach_client_insights_viewed',
  'coach_alert_filter_used',
] as const

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
  alert_filter?: (typeof ANALYTICS_ALERT_FILTERS)[number]
  matching_client_count?: number
}

type SessionMilestoneProperties = {
  path?: '/session'
  authenticated: true
  duration_bucket: (typeof ANALYTICS_DURATION_BUCKETS)[number]
}

type PricingEventProperties = {
  path?: '/pricing'
  source: 'pricing'
  screen: 'pricing'
  authenticated: boolean
}

export type AnalyticsEventProperties = {
  landing_view: Pick<AnalyticsProperties, 'locale' | 'path' | 'screen'>
  primary_cta_clicked: Pick<AnalyticsProperties, 'locale' | 'path' | 'source' | 'screen'>
  language_changed: Pick<AnalyticsProperties, 'locale' | 'path' | 'screen'>
  signup_started: Pick<AnalyticsProperties, 'locale' | 'path' | 'screen'>
  signup_completed: Pick<AnalyticsProperties, 'locale' | 'path' | 'screen' | 'authenticated'>
  onboarding_step_completed: Pick<AnalyticsProperties, 'path' | 'stage' | 'screen' | 'authenticated'>
  onboarding_abandoned: Pick<AnalyticsProperties, 'path' | 'stage' | 'screen' | 'authenticated'>
  plan_generated: Pick<AnalyticsProperties, 'path' | 'stage' | 'screen' | 'authenticated'>
  first_session_started: Pick<AnalyticsProperties, 'path' | 'authenticated' | 'duration_bucket'>
  first_session_completed: Pick<AnalyticsProperties, 'path' | 'authenticated' | 'duration_bucket'>
  second_session_completed: SessionMilestoneProperties
  plan_adjustment_used: Pick<AnalyticsProperties, 'path' | 'authenticated' | 'duration_bucket'>
  organic_page_cta_clicked: Pick<AnalyticsProperties, 'locale' | 'path' | 'source' | 'screen'>
  paywall_viewed: PricingEventProperties
  checkout_started: PricingEventProperties
  pro_interest_submitted: PricingEventProperties
  coach_overview_viewed: Pick<AnalyticsProperties, 'active_client_count' | 'pending_request_count' | 'paused_relationship_count'>
  coach_client_insights_viewed: Pick<AnalyticsProperties, 'period_weeks' | 'prescribed_session_count' | 'evidence_session_count'>
  coach_alert_filter_used: Pick<AnalyticsProperties, 'alert_filter' | 'matching_client_count'>
}

export type SanitizedAnalyticsEvent = {
  [Name in AnalyticsEventName]: { name: Name; properties: AnalyticsEventProperties[Name] }
}[AnalyticsEventName]

const EVENT_PROPERTY_KEYS = {
  landing_view: ['locale', 'path', 'screen'],
  primary_cta_clicked: ['locale', 'path', 'source', 'screen'],
  language_changed: ['locale', 'path', 'screen'],
  signup_started: ['locale', 'path', 'screen'],
  signup_completed: ['locale', 'path', 'screen', 'authenticated'],
  onboarding_step_completed: ['path', 'stage', 'screen', 'authenticated'],
  onboarding_abandoned: ['path', 'stage', 'screen', 'authenticated'],
  plan_generated: ['path', 'stage', 'screen', 'authenticated'],
  first_session_started: ['path', 'authenticated', 'duration_bucket'],
  first_session_completed: ['path', 'authenticated', 'duration_bucket'],
  second_session_completed: ['path', 'authenticated', 'duration_bucket'],
  plan_adjustment_used: ['path', 'authenticated', 'duration_bucket'],
  organic_page_cta_clicked: ['locale', 'path', 'source', 'screen'],
  paywall_viewed: ['path', 'source', 'screen', 'authenticated'],
  checkout_started: ['path', 'source', 'screen', 'authenticated'],
  pro_interest_submitted: ['path', 'source', 'screen', 'authenticated'],
  coach_overview_viewed: ['active_client_count', 'pending_request_count', 'paused_relationship_count'],
  coach_client_insights_viewed: ['period_weeks', 'prescribed_session_count', 'evidence_session_count'],
  coach_alert_filter_used: ['alert_filter', 'matching_client_count'],
} as const satisfies Record<AnalyticsEventName, readonly (keyof AnalyticsProperties)[]>

const EVENT_NAMES = new Set<AnalyticsEventName>(Object.keys(EVENT_PROPERTY_KEYS) as AnalyticsEventName[])

const COACH_AGGREGATE_EVENT_NAMES = new Set<AnalyticsEventName>(COACH_AGGREGATE_EVENTS)

export function isCoachAggregateEvent(name: AnalyticsEventName): boolean {
  return COACH_AGGREGATE_EVENT_NAMES.has(name)
}

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
  'alert_filter',
  'matching_client_count',
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
  active_client_count: value => isAggregateCount(value),
  pending_request_count: value => isAggregateCount(value),
  paused_relationship_count: value => isAggregateCount(value),
  period_weeks: value => typeof value === 'number' && (ANALYTICS_INSIGHT_PERIODS as readonly number[]).includes(value),
  prescribed_session_count: value => isAggregateCount(value),
  evidence_session_count: value => isAggregateCount(value),
  alert_filter: value => isOneOf(value, ANALYTICS_ALERT_FILTERS),
  matching_client_count: value => isAggregateCount(value),
}

function isAggregateCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && value <= 10_000
}

function allowedPropertiesForEvent(name: AnalyticsEventName): ReadonlySet<keyof AnalyticsProperties> {
  return new Set(EVENT_PROPERTY_KEYS[name])
}

function capturesPath(name: AnalyticsEventName): boolean {
  return allowedPropertiesForEvent(name).has('path')
}

function serializedByteLength(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value)).byteLength
}

function hasExactKeys(
  properties: Record<string, string | number | boolean>,
  expectedKeys: readonly string[],
): boolean {
  const keys = Object.keys(properties)
  return keys.length === expectedKeys.length && expectedKeys.every(key => key in properties)
}

function matchesStrictEventContract(
  name: AnalyticsEventName,
  properties: Record<string, string | number | boolean>,
): boolean {
  if (name === 'second_session_completed') {
    return hasExactKeys(properties, ['path', 'authenticated', 'duration_bucket'])
      && properties.path === '/session'
      && properties.authenticated === true
  }

  if (name === 'paywall_viewed' || name === 'checkout_started' || name === 'pro_interest_submitted') {
    return hasExactKeys(properties, ['path', 'source', 'screen', 'authenticated'])
      && properties.path === '/pricing'
      && properties.source === 'pricing'
      && properties.screen === 'pricing'
  }

  return true
}

export function normalizeAnalyticsPath(pathname: string): (typeof ANALYTICS_PATHS)[number] | null {
  if ((ANALYTICS_PATHS as readonly string[]).includes(pathname)) {
    return pathname as (typeof ANALYTICS_PATHS)[number]
  }

  if (pathname.startsWith('/session/')) return '/session'

  return null
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

    if (!matchesStrictEventContract(input.name as AnalyticsEventName, properties)) return null
    if (serializedByteLength(properties) > MAX_PROPERTIES_BYTES) return null

    return { name: input.name, properties } as SanitizedAnalyticsEvent
  } catch {
    return null
  }
}

function browserEvent<Name extends AnalyticsEventName>(
  name: Name,
  properties: AnalyticsEventProperties[Name],
): SanitizedAnalyticsEvent | null {
  if (typeof window === 'undefined') return null

  const normalizedPath = normalizeAnalyticsPath(window.location.pathname)
  return sanitizeEvent({
    name,
    properties: capturesPath(name)
      ? { ...properties, path: normalizedPath ?? window.location.pathname }
      : properties,
  })
}

async function postEvent(body: string, keepalive: boolean): Promise<boolean> {
  try {
    const response = await fetch('/api/analytics', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      credentials: 'same-origin',
      keepalive,
    })
    return response.status === 202
  } catch {
    return false
  }
}

export async function trackEvent<Name extends AnalyticsEventName>(
  name: Name,
  properties: AnalyticsEventProperties[Name],
): Promise<void> {
  const event = browserEvent(name, properties)
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

  await postEvent(body, true)
}

export async function trackEventConfirmed<Name extends AnalyticsEventName>(
  name: Name,
  properties: AnalyticsEventProperties[Name],
): Promise<boolean> {
  const event = browserEvent(name, properties)
  if (!event) return false
  return postEvent(JSON.stringify(event), false)
}
