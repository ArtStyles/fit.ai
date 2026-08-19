import { NextResponse, type NextRequest } from 'next/server'
import { isCoachAggregateEvent, sanitizeEvent } from '@/lib/analytics/events'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'

const MAX_BODY_BYTES = 2048
const ANONYMOUS_COOKIE = 'fitai-anonymous-id'
const ANONYMOUS_COOKIE_MAX_AGE = 60 * 60 * 24 * 365
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const AGGREGATE_ANONYMOUS_ID = '00000000-0000-4000-8000-000000000000'
const DATABASE_OWNED_SESSION_MILESTONES = new Set([
  'first_session_completed',
  'second_session_completed',
])

function invalidRequest() {
  return analyticsError('ANALYTICS_INVALID_EVENT', 400)
}

function analyticsError(
  code: 'ANALYTICS_INVALID_EVENT' | 'ANALYTICS_AUTH_REQUIRED' | 'ANALYTICS_STORAGE_UNAVAILABLE',
  status: 400 | 401 | 500,
) {
  return NextResponse.json({
    error: { code, correlationId: crypto.randomUUID() },
  }, { status })
}

async function readBody(request: NextRequest): Promise<string | null> {
  const declaredLength = Number(request.headers.get('content-length'))
  if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) return null
  if (!request.body) return ''

  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []
  let byteLength = 0

  let chunk = await reader.read()
  while (!chunk.done) {
    const { value } = chunk
    byteLength += value.byteLength
    if (byteLength > MAX_BODY_BYTES) {
      await reader.cancel()
      return null
    }
    chunks.push(value)
    chunk = await reader.read()
  }

  const body = new Uint8Array(byteLength)
  let offset = 0
  for (const chunk of chunks) {
    body.set(chunk, offset)
    offset += chunk.byteLength
  }
  return new TextDecoder('utf-8', { fatal: true }).decode(body)
}

type ServerAuth =
  | { status: 'verified'; userId: string }
  | { status: 'anonymous' | 'unavailable'; userId: null }

async function serverAuth(): Promise<ServerAuth> {
  try {
    const supabase = await createClient()
    const { data, error } = await supabase.auth.getUser()
    if (error) return { status: 'unavailable', userId: null }
    return data.user?.id
      ? { status: 'verified', userId: data.user.id }
      : { status: 'anonymous', userId: null }
  } catch {
    return { status: 'unavailable', userId: null }
  }
}

export async function POST(request: NextRequest) {
  const requestOrigin = request.headers.get('origin')
  if (!requestOrigin || requestOrigin !== new URL(request.url).origin) return invalidRequest()

  const contentType = request.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase()
  if (contentType !== 'application/json') return invalidRequest()

  let rawBody: string | null
  try {
    rawBody = await readBody(request)
  } catch {
    return invalidRequest()
  }
  if (rawBody === null) return invalidRequest()

  let input: unknown
  try {
    input = JSON.parse(rawBody)
  } catch {
    return invalidRequest()
  }

  const event = sanitizeEvent(input)
  if (!event) return invalidRequest()
  if (DATABASE_OWNED_SESSION_MILESTONES.has(event.name)) return invalidRequest()

  const aggregateEvent = isCoachAggregateEvent(event.name)
  const existingAnonymousId = aggregateEvent ? null : request.cookies.get(ANONYMOUS_COOKIE)?.value
  const anonymousId = aggregateEvent
    ? AGGREGATE_ANONYMOUS_ID
    : existingAnonymousId && UUID_PATTERN.test(existingAnonymousId)
      ? existingAnonymousId
      : crypto.randomUUID()
  const auth = aggregateEvent
    ? { status: 'anonymous', userId: null } as const
    : await serverAuth()
  if (
    event.name === 'pro_interest_submitted'
    && event.properties.authenticated === true
    && auth.status !== 'verified'
  ) return analyticsError('ANALYTICS_AUTH_REQUIRED', 401)

  const properties = 'authenticated' in event.properties
    ? { ...event.properties, authenticated: auth.status === 'verified' }
    : event.properties
  const localeValue = 'locale' in properties ? properties.locale : null
  const pathValue = 'path' in properties ? properties.path : null
  const locale = localeValue === 'es' || localeValue === 'en'
    ? localeValue
    : null
  const path = typeof pathValue === 'string' ? pathValue : null

  try {
    const service = createServiceClient()
    const { error } = await service.from('product_events').insert({
      event_name: event.name,
      anonymous_id: anonymousId,
      user_id: auth.userId,
      locale,
      path,
      properties,
    })
    if (error) return analyticsError('ANALYTICS_STORAGE_UNAVAILABLE', 500)
  } catch {
    return analyticsError('ANALYTICS_STORAGE_UNAVAILABLE', 500)
  }

  const response = NextResponse.json({ accepted: true }, { status: 202 })
  if (!aggregateEvent && anonymousId !== existingAnonymousId) {
    response.cookies.set(ANONYMOUS_COOKIE, anonymousId, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: ANONYMOUS_COOKIE_MAX_AGE,
    })
  }
  return response
}
