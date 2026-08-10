import { NextResponse, type NextRequest } from 'next/server'
import { reinstateTrainerThroughAuthenticatedAdmin } from '@/lib/coaching/trainerSecurityAdmin'
import { isTrainerMarketplacePilotGateEnabled } from '@/lib/features/trainerMarketplacePilot'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export async function POST(request: NextRequest): Promise<NextResponse> {
  if (!isTrainerMarketplacePilotGateEnabled(process.env)) {
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
    return NextResponse.json(await reinstateTrainerThroughAuthenticatedAdmin({ accessToken, targetUserId }))
  } catch {
    return NextResponse.json({ error: 'unavailable' }, { status: 403 })
  }
}
