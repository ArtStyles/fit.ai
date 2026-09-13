const CARD_SCHEME = 'vekira:'
const CARD_HOST = 'fitness-card'
const PENDING_KEY = 'vekira:pending-fitness-card-invite'
const PENDING_TTL_MS = 30 * 60_000
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

type SessionStore = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

export function buildFitnessCardLink(ownerId: string): string {
  if (!UUID.test(ownerId)) throw new Error('Invalid fitness card owner ID')
  return `${CARD_SCHEME}//${CARD_HOST}/${ownerId.toLowerCase()}`
}

export function parseFitnessCardLink(value: string): string | null {
  try {
    const url = new URL(value)
    if (url.protocol !== CARD_SCHEME || url.hostname !== CARD_HOST || url.port || url.username || url.password || url.search || url.hash) return null
    const match = url.pathname.match(/^\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i)
    return match?.[1]?.toLowerCase() ?? null
  } catch { return null }
}

export function storePendingFitnessInvite(value: string, storage: SessionStore = sessionStorage, now = Date.now()): boolean {
  const ownerId = parseFitnessCardLink(value)
  if (!ownerId) return false
  storage.setItem(PENDING_KEY, JSON.stringify({ ownerId, expiresAt: now + PENDING_TTL_MS }))
  return true
}

export function consumePendingFitnessInvite(storage: SessionStore = sessionStorage, now = Date.now()): string | null {
  const raw = storage.getItem(PENDING_KEY)
  storage.removeItem(PENDING_KEY)
  if (!raw) return null
  try {
    const value = JSON.parse(raw) as { ownerId?: unknown; expiresAt?: unknown }
    return typeof value.ownerId === 'string' && UUID.test(value.ownerId) && typeof value.expiresAt === 'number' && Number.isFinite(value.expiresAt) && value.expiresAt >= now && value.expiresAt <= now + PENDING_TTL_MS
      ? value.ownerId.toLowerCase() : null
  } catch { return null }
}
