// src/app/actions/feed.ts
'use server'

import { createClient } from '@/lib/supabase/server'
import { decodeCursor, encodeCursor, FEED_PAGE_SIZE } from '@/lib/social/feed'
import type { FeedPage, FeedPost, PostAuthor, PostCommentView, PostDetail } from '@/lib/social/types'
import type { RoutineSnapshot, SessionSnapshot } from '@/lib/social/snapshots'

interface PostRow {
  id: string
  user_id: string
  body: string | null
  photo_urls: string[]
  session_snapshot: SessionSnapshot | null
  routine_snapshot: RoutineSnapshot | null
  like_count: number
  comment_count: number
  created_at: string
}

async function loadAuthors(
  supabase: Awaited<ReturnType<typeof createClient>>,
  ids: string[],
): Promise<Map<string, PostAuthor>> {
  const map = new Map<string, PostAuthor>()
  if (!ids.length) return map
  const { data } = await (supabase.from('public_profiles') as any)
    .select('id, username, full_name, avatar_url').in('id', ids) as { data: PostAuthor[] | null }
  for (const a of data ?? []) map.set(a.id, a)
  return map
}

async function loadMyLikes(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  postIds: string[],
): Promise<Set<string>> {
  const set = new Set<string>()
  if (!postIds.length) return set
  const { data } = await (supabase.from('post_likes') as any)
    .select('post_id').eq('user_id', userId).in('post_id', postIds) as {
      data: { post_id: string }[] | null
    }
  for (const l of data ?? []) set.add(l.post_id)
  return set
}

function toFeedPost(
  row: PostRow, authors: Map<string, PostAuthor>, likedSet: Set<string>, meId: string,
): FeedPost {
  return {
    id: row.id,
    author: authors.get(row.user_id) ?? { id: row.user_id, username: null, full_name: null, avatar_url: null },
    body: row.body,
    photo_urls: row.photo_urls ?? [],
    session_snapshot: row.session_snapshot,
    routine_snapshot: row.routine_snapshot,
    like_count: row.like_count,
    comment_count: row.comment_count,
    liked_by_me: likedSet.has(row.id),
    is_mine: row.user_id === meId,
    created_at: row.created_at,
  }
}

const POST_COLS = 'id, user_id, body, photo_urls, session_snapshot, routine_snapshot, like_count, comment_count, created_at'

export async function getDiscoverFeed(cursorToken?: string | null): Promise<FeedPage> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { posts: [], nextCursor: null }

  const cursor = decodeCursor(cursorToken)
  let query = (supabase.from('posts') as any)
    .select(POST_COLS)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(FEED_PAGE_SIZE + 1)

  if (cursor) {
    // Keyset: (created_at, id) < (cursor.createdAt, cursor.id)
    query = query.or(
      `created_at.lt.${cursor.createdAt},and(created_at.eq.${cursor.createdAt},id.lt.${cursor.id})`,
    )
  }

  const { data: rows } = await query as { data: PostRow[] | null }
  const page = rows ?? []
  const hasMore = page.length > FEED_PAGE_SIZE
  const visible = hasMore ? page.slice(0, FEED_PAGE_SIZE) : page

  const authors = await loadAuthors(supabase, visible.map(r => r.user_id))
  const liked = await loadMyLikes(supabase, user.id, visible.map(r => r.id))
  const posts = visible.map(r => toFeedPost(r, authors, liked, user.id))

  const last = visible[visible.length - 1]
  const nextCursor = hasMore && last ? encodeCursor({ createdAt: last.created_at, id: last.id }) : null
  return { posts, nextCursor }
}

export async function getFollowingFeed(cursorToken?: string | null): Promise<FeedPage> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { posts: [], nextCursor: null }

  const { data: followRows } = await (supabase.from('follows') as any)
    .select('following_id').eq('follower_id', user.id) as {
      data: { following_id: string }[] | null
    }
  const followingIds = (followRows ?? []).map(f => f.following_id)
  if (followingIds.length === 0) return { posts: [], nextCursor: null }

  const cursor = decodeCursor(cursorToken)
  let query = (supabase.from('posts') as any)
    .select(POST_COLS)
    .in('user_id', followingIds)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(FEED_PAGE_SIZE + 1)

  if (cursor) {
    query = query.or(
      `created_at.lt.${cursor.createdAt},and(created_at.eq.${cursor.createdAt},id.lt.${cursor.id})`,
    )
  }

  const { data: rows } = await query as { data: PostRow[] | null }
  const page = rows ?? []
  const hasMore = page.length > FEED_PAGE_SIZE
  const visible = hasMore ? page.slice(0, FEED_PAGE_SIZE) : page

  const authors = await loadAuthors(supabase, visible.map(r => r.user_id))
  const liked = await loadMyLikes(supabase, user.id, visible.map(r => r.id))
  const posts = visible.map(r => toFeedPost(r, authors, liked, user.id))

  const last = visible[visible.length - 1]
  const nextCursor = hasMore && last ? encodeCursor({ createdAt: last.created_at, id: last.id }) : null
  return { posts, nextCursor }
}

export async function getProfile(username: string): Promise<{
  author: PostAuthor | null
  posts: FeedPost[]
  followerCount: number
  followingCount: number
  isFollowing: boolean
  isMe: boolean
}> {
  const empty = { author: null, posts: [], followerCount: 0, followingCount: 0, isFollowing: false, isMe: false }
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return empty

  const { data: author } = await (supabase.from('public_profiles') as any)
    .select('id, username, full_name, avatar_url').eq('username', username).maybeSingle() as {
      data: PostAuthor | null
    }
  if (!author) return empty

  const { data: rows } = await (supabase.from('posts') as any)
    .select(POST_COLS).eq('user_id', author.id)
    .order('created_at', { ascending: false }).limit(60) as { data: PostRow[] | null }
  const page = rows ?? []
  const authors = new Map([[author.id, author]])
  const liked = await loadMyLikes(supabase, user.id, page.map(r => r.id))
  const posts = page.map(r => toFeedPost(r, authors, liked, user.id))

  // Contadores globales y públicos del perfil (no se filtran por bloqueo): el nº de
  // seguidores de un usuario es un dato público, mientras que la lista de posts sí la
  // filtra el RLS de 'posts' según bloqueos. La diferencia solo es visible entre pares
  // bloqueados y es intencional.
  const { count: followerCount } = await (supabase.from('follows') as any)
    .select('*', { count: 'exact', head: true }).eq('following_id', author.id) as { count: number | null }
  const { count: followingCount } = await (supabase.from('follows') as any)
    .select('*', { count: 'exact', head: true }).eq('follower_id', author.id) as { count: number | null }

  const isMe = author.id === user.id
  let isFollowing = false
  if (!isMe) {
    const { data: rel } = await (supabase.from('follows') as any)
      .select('following_id').eq('follower_id', user.id).eq('following_id', author.id).maybeSingle() as {
        data: { following_id: string } | null
      }
    isFollowing = !!rel
  }

  return {
    author, posts,
    followerCount: followerCount ?? 0,
    followingCount: followingCount ?? 0,
    isFollowing, isMe,
  }
}

export async function getPostDetail(postId: string): Promise<PostDetail | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: row } = await (supabase.from('posts') as any)
    .select(POST_COLS).eq('id', postId).maybeSingle() as { data: PostRow | null }
  if (!row) return null

  const { data: commentRows } = await (supabase.from('post_comments') as any)
    .select('id, user_id, body, created_at').eq('post_id', postId)
    .order('created_at', { ascending: true }).limit(200) as {
      data: { id: string; user_id: string; body: string; created_at: string }[] | null
    }
  const comments = commentRows ?? []

  const authorIds = Array.from(new Set([row.user_id, ...comments.map(c => c.user_id)]))
  const authors = await loadAuthors(supabase, authorIds)
  const liked = await loadMyLikes(supabase, user.id, [row.id])

  const post = toFeedPost(row, authors, liked, user.id)
  const commentViews: PostCommentView[] = comments.map(c => ({
    id: c.id,
    author: authors.get(c.user_id) ?? { id: c.user_id, username: null, full_name: null, avatar_url: null },
    body: c.body,
    created_at: c.created_at,
    is_mine: c.user_id === user.id,
  }))
  return { post, comments: commentViews }
}
