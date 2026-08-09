import { NextResponse, type NextRequest } from 'next/server'
import { suspendTrainerThroughAuthenticatedAdmin } from '@/lib/coaching/trainerSecurityAdmin'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export async function POST(request: NextRequest): Promise<NextResponse> {
  if (process.env.NODE_ENV === 'production' || process.env.E2E_TRAINER_SECURITY_ENABLED !== 'true') {
    return NextResponse.json({ error: 'not_found' }, { status: 404 })
  }
  const authorization = request.headers.get('authorization') ?? ''
  const accessToken = authorization.startsWith('Bearer ') ? authorization.slice(7) : ''
  const body = await request.json().catch(() => null) as { targetUserId?: unknown } | null
  const targetUserId = typeof body?.targetUserId === 'string' ? body.targetUserId : ''
  if (!accessToken || !UUID_PATTERN.test(targetUserId)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  try {
    const result = await suspendTrainerThroughAuthenticatedAdmin({
      accessToken,
      targetUserId,
      reason: 'Trainer security concurrency test',
    })
    return NextResponse.json(result)
  } catch {
    return NextResponse.json({ error: 'unavailable' }, { status: 403 })
  }
}
