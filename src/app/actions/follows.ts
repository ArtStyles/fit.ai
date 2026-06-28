// src/app/actions/follows.ts
'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { notifyFollowAccepted, notifyFollowCreated } from '@/lib/notifications/socialPush'
import type { ActionResult } from './posts'
import type { PostAuthor, RequestUser } from '@/lib/social/types'

export async function followUser(targetId: string): Promise<ActionResult<{ status: 'pending' | 'accepted' }>> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Sesión no válida.' }
  if (targetId === user.id) return { ok: false, error: 'No puedes seguirte a ti mismo.' }

  const { data: target } = await (supabase.from('public_profiles') as any)
    .select('is_private').eq('id', targetId).maybeSingle() as { data: { is_private: boolean } | null }
  const status: 'pending' | 'accepted' = target?.is_private ? 'pending' : 'accepted'

  const { error } = await (supabase.from('follows') as any)
    .upsert({ follower_id: user.id, following_id: targetId, status })
  if (error) return { ok: false, error: 'No se pudo seguir.' }

  try {
    await notifyFollowCreated(targetId, user.id, status)
  } catch {
    /* La notificacion push no debe bloquear el follow. */
  }
  revalidatePath('/feed')
  return { ok: true, status }
}

export async function unfollowUser(targetId: string): Promise<ActionResult> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Sesión no válida.' }

  const { error } = await (supabase.from('follows') as any)
    .delete().eq('follower_id', user.id).eq('following_id', targetId)
  if (error) return { ok: false, error: 'No se pudo actualizar.' }

  revalidatePath('/feed')
  return { ok: true }
}

export async function getPendingRequestCount(): Promise<number> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return 0
  const { count } = await (supabase.from('follows') as any)
    .select('*', { count: 'exact', head: true })
    .eq('following_id', user.id).eq('status', 'pending') as { count: number | null }
  return count ?? 0
}

export async function getFollowRequests(): Promise<RequestUser[]> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  const { data: rows } = await (supabase.from('follows') as any)
    .select('follower_id').eq('following_id', user.id).eq('status', 'pending')
    .order('created_at', { ascending: false }) as { data: { follower_id: string }[] | null }
  const ids = (rows ?? []).map(r => r.follower_id)
  if (ids.length === 0) return []

  const { data: profiles } = await (supabase.from('public_profiles') as any)
    .select('id, username, full_name, avatar_url, is_private').in('id', ids) as {
      data: (PostAuthor & { is_private: boolean })[] | null
    }
  const byId = new Map((profiles ?? []).map(p => [p.id, p]))
  return ids
    .map(id => byId.get(id))
    .filter((p): p is PostAuthor & { is_private: boolean } => !!p)
    .map(p => ({ id: p.id, username: p.username, full_name: p.full_name, avatar_url: p.avatar_url, isPrivate: p.is_private }))
}

export async function acceptFollowRequest(followerId: string): Promise<ActionResult> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Sesión no válida.' }
  const { error } = await (supabase.from('follows') as any)
    .update({ status: 'accepted' })
    .eq('follower_id', followerId).eq('following_id', user.id).eq('status', 'pending')
  if (error) return { ok: false, error: 'No se pudo aceptar.' }
  try {
    await notifyFollowAccepted(followerId, user.id)
  } catch {
    /* La notificacion push no debe bloquear la aceptacion. */
  }
  revalidatePath('/solicitudes'); revalidatePath('/feed')
  return { ok: true }
}

export async function rejectFollowRequest(followerId: string): Promise<ActionResult> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Sesión no válida.' }
  const { error } = await (supabase.from('follows') as any)
    .delete().eq('follower_id', followerId).eq('following_id', user.id).eq('status', 'pending')
  if (error) return { ok: false, error: 'No se pudo rechazar.' }
  revalidatePath('/solicitudes')
  return { ok: true }
}
