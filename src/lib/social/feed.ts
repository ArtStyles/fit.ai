// Paginación keyset del feed: el cursor codifica (created_at, id) del último post.

export const FEED_PAGE_SIZE = 10

export interface FeedCursor { createdAt: string; id: string }

export function encodeCursor(c: FeedCursor): string {
  return Buffer.from(`${c.createdAt}|${c.id}`, 'utf8').toString('base64url')
}

export function decodeCursor(raw: string | null | undefined): FeedCursor | null {
  if (!raw) return null
  try {
    const decoded = Buffer.from(raw, 'base64url').toString('utf8')
    const sep = decoded.indexOf('|')
    if (sep <= 0) return null
    const createdAt = decoded.slice(0, sep)
    const id = decoded.slice(sep + 1)
    if (!createdAt || !id) return null
    return { createdAt, id }
  } catch {
    return null
  }
}
