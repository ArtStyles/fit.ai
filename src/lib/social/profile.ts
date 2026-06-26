import type { FeedPost } from './types'

export type TileKind = 'photo' | 'session' | 'routine' | 'text'

export function postTileKind(
  post: Pick<FeedPost, 'photo_urls' | 'session_snapshot' | 'routine_snapshot'>,
): TileKind {
  if (post.photo_urls && post.photo_urls.length > 0) return 'photo'
  if (post.session_snapshot) return 'session'
  if (post.routine_snapshot) return 'routine'
  return 'text'
}
