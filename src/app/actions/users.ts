// src/app/actions/users.ts
'use server'

import { createClient } from '@/lib/supabase/server'
import type { PostAuthor, SuggestedUser } from '@/lib/social/types'
import { sanitizeSearch, dedupePreservingOrder } from '@/lib/social/discovery'
import { followButtonState } from '@/lib/social/follow'

const SEARCH_LIMIT = 20
const SUGGEST_LIMIT = 10
const RECENT_POSTS_SCAN = 50

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

function toSuggested(p: PostAuthor & { is_private: boolean }, statusMap: Map<string, 'pending' | 'accepted'>): SuggestedUser {
  const status = statusMap.get(p.id) ?? 'none'
  return {
    id: p.id, username: p.username, full_name: p.full_name, avatar_url: p.avatar_url,
    isPrivate: p.is_private,
    followState: followButtonState({ isPrivate: p.is_private, status }),
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
  return visible.map(p => toSuggested(p, statusMap))
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
    .map(p => toSuggested(p, statusMap))
}
