import { NextResponse, type NextRequest } from 'next/server'
import { isCoachAggregateEvent, sanitizeEvent } from '@/lib/analytics/events'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'

const MAX_BODY_BYTES = 2048
const ANONYMOUS_COOKIE = 'fitai-anonymous-id'
const ANONYMOUS_COOKIE_MAX_AGE = 60 * 60 * 24 * 365
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const AGGREGATE_ANONYMOUS_ID = '00000000-0000-4000-8000-000000000000'

function invalidRequest() {
  return NextResponse.json({ error: 'Invalid analytics event' }, { status: 400 })
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

async function serverUserId(): Promise<string | null> {
  try {
    const supabase = await createClient()
    const { data, error } = await supabase.auth.getUser()
    return error ? null : data.user?.id ?? null
  } catch {
    return null
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

  const aggregateEvent = isCoachAggregateEvent(event.name)
  const existingAnonymousId = aggregateEvent ? null : request.cookies.get(ANONYMOUS_COOKIE)?.value
  const anonymousId = aggregateEvent
    ? AGGREGATE_ANONYMOUS_ID
    : existingAnonymousId && UUID_PATTERN.test(existingAnonymousId)
      ? existingAnonymousId
      : crypto.randomUUID()
  const userId = aggregateEvent ? null : await serverUserId()
  const locale = event.properties.locale === 'es' || event.properties.locale === 'en'
    ? event.properties.locale
    : null
  const path = typeof event.properties.path === 'string' ? event.properties.path : null

  try {
    const service = createServiceClient()
    const { error } = await service.from('product_events').insert({
      event_name: event.name,
      anonymous_id: anonymousId,
      user_id: userId,
      locale,
      path,
      properties: event.properties,
    })
    if (error) return NextResponse.json({ error: 'Analytics storage unavailable' }, { status: 500 })
  } catch {
    return NextResponse.json({ error: 'Analytics storage unavailable' }, { status: 500 })
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
