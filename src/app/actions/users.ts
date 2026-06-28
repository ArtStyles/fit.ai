// src/app/actions/users.ts
'use server'

import { createClient } from '@/lib/supabase/server'
import type { PostAuthor, SuggestedUser } from '@/lib/social/types'
import { sanitizeSearch, dedupePreservingOrder } from '@/lib/social/discovery'
import { followButtonState } from '@/lib/social/follow'

const SEARCH_LIMIT = 20
const SUGGEST_LIMIT = 10
const RECENT_POSTS_SCAN = 50
const CONNECTION_LIST_LIMIT = 50
const CONNECTION_SEARCH_SCAN_LIMIT = 500

type ProfileConnectionType = 'followers' | 'following'

// ids bloqueados en cualquier dirección respecto a `userId` (userId es UUID de auth, no input).
async function loadBlockedIds(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
): Promise<Set<string>> {
  const set = new Set<string>()
  const { data } = await (supabase.from('user_blocks') as any)
    .select('blocker_id, blocked_id')
    .or(`blocker_id.eq.${userId},blocked_id.eq.${userId}`) as {
      data: { blocker_id: string; blocked_id: string }[] | null
    }
  for (const b of data ?? []) set.add(b.blocker_id === userId ? b.blocked_id : b.blocker_id)
  return set
}

async function loadFollowStatusMap(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
): Promise<Map<string, 'pending' | 'accepted'>> {
  const map = new Map<string, 'pending' | 'accepted'>()
  const { data } = await (supabase.from('follows') as any)
    .select('following_id, status').eq('follower_id', userId) as {
      data: { following_id: string; status: 'pending' | 'accepted' }[] | null
    }
  for (const f of data ?? []) map.set(f.following_id, f.status)
  return map
}

function toSuggested(
  p: PostAuthor & { is_private: boolean },
  statusMap: Map<string, 'pending' | 'accepted'>,
  viewerId?: string,
): SuggestedUser {
  const isMe = p.id === viewerId
  const status = isMe ? 'accepted' : statusMap.get(p.id) ?? 'none'
  return {
    id: p.id, username: p.username, full_name: p.full_name, avatar_url: p.avatar_url,
    isPrivate: p.is_private,
    followState: followButtonState({ isPrivate: p.is_private, status }),
    isMe,
  }
}

export async function searchUsers(rawQuery: string): Promise<SuggestedUser[]> {
  const q = sanitizeSearch(rawQuery)
  if (!q) return []

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  const { data: rows } = await (supabase.from('public_profiles') as any)
    .select('id, username, full_name, avatar_url, is_private')
    .or(`username.ilike.%${q}%,full_name.ilike.%${q}%`)
    .neq('id', user.id)
    .limit(SEARCH_LIMIT) as { data: (PostAuthor & { is_private: boolean })[] | null }
  const profiles = rows ?? []
  if (profiles.length === 0) return []

  const blocked = await loadBlockedIds(supabase, user.id)
  const visible = profiles.filter(p => !blocked.has(p.id))
  if (visible.length === 0) return []

  const statusMap = await loadFollowStatusMap(supabase, user.id)
  return visible.map(p => toSuggested(p, statusMap, user.id))
}

export async function getSuggestedUsers(): Promise<SuggestedUser[]> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  const { data: postRows } = await (supabase.from('posts') as any)
    .select('user_id').order('created_at', { ascending: false }).limit(RECENT_POSTS_SCAN) as {
      data: { user_id: string }[] | null
    }
  const recentAuthorIds = dedupePreservingOrder((postRows ?? []).map(p => p.user_id))
  if (recentAuthorIds.length === 0) return []

  const blocked = await loadBlockedIds(supabase, user.id)
  const statusMap = await loadFollowStatusMap(supabase, user.id)
  const candidateIds = recentAuthorIds
    .filter(id => id !== user.id && !blocked.has(id) && !statusMap.has(id))
    .slice(0, SUGGEST_LIMIT)
  if (candidateIds.length === 0) return []

  const { data: rows } = await (supabase.from('public_profiles') as any)
    .select('id, username, full_name, avatar_url, is_private').in('id', candidateIds) as {
      data: (PostAuthor & { is_private: boolean })[] | null
    }
  const byId = new Map((rows ?? []).map(p => [p.id, p]))
  // .in() no preserva orden: re-ordenar por recencia (orden de candidateIds).
  return candidateIds
    .map(id => byId.get(id))
    .filter((p): p is PostAuthor & { is_private: boolean } => !!p)
    .map(p => toSuggested(p, statusMap, user.id))
}

export async function getProfileConnections(
  username: string,
  type: ProfileConnectionType,
  rawQuery = '',
): Promise<SuggestedUser[]> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  const { data: author } = await (supabase.from('public_profiles') as any)
    .select('id, is_private')
    .eq('username', username)
    .maybeSingle() as { data: { id: string; is_private: boolean } | null }
  if (!author) return []

  const isMe = author.id === user.id
  let profileFollowStatus: 'none' | 'pending' | 'accepted' = 'none'
  if (!isMe) {
    const { data: relation } = await (supabase.from('follows') as any)
      .select('status')
      .eq('follower_id', user.id)
      .eq('following_id', author.id)
      .maybeSingle() as { data: { status: 'pending' | 'accepted' } | null }
    if (relation) profileFollowStatus = relation.status
  }

  const canViewConnections = !author.is_private || isMe || profileFollowStatus === 'accepted'
  if (!canViewConnections) return []

  const q = sanitizeSearch(rawQuery)
  const idColumn = type === 'followers' ? 'follower_id' : 'following_id'
  const ownerColumn = type === 'followers' ? 'following_id' : 'follower_id'
  const scanLimit = q ? CONNECTION_SEARCH_SCAN_LIMIT : CONNECTION_LIST_LIMIT

  const { data: rows } = await (supabase.from('follows') as any)
    .select(idColumn)
    .eq(ownerColumn, author.id)
    .eq('status', 'accepted')
    .order('created_at', { ascending: false })
    .limit(scanLimit) as { data: Record<typeof idColumn, string>[] | null }
  const ids = (rows ?? []).map(row => row[idColumn])
  if (ids.length === 0) return []

  const blocked = await loadBlockedIds(supabase, user.id)
  const visibleIds = ids.filter(id => !blocked.has(id))
  if (visibleIds.length === 0) return []

  let profilesQuery = (supabase.from('public_profiles') as any)
    .select('id, username, full_name, avatar_url, is_private')
    .in('id', visibleIds)
    .limit(CONNECTION_LIST_LIMIT)
  if (q) profilesQuery = profilesQuery.or(`username.ilike.%${q}%,full_name.ilike.%${q}%`)

  const { data: profiles } = await profilesQuery as {
    data: (PostAuthor & { is_private: boolean })[] | null
  }
  const byId = new Map((profiles ?? []).map(profile => [profile.id, profile]))
  const orderedProfiles = visibleIds
    .map(id => byId.get(id))
    .filter((profile): profile is PostAuthor & { is_private: boolean } => !!profile)
    .slice(0, CONNECTION_LIST_LIMIT)
  if (orderedProfiles.length === 0) return []

  const statusMap = await loadFollowStatusMap(supabase, user.id)
  return orderedProfiles.map(profile => toSuggested(profile, statusMap, user.id))
}
