// src/app/actions/engagement.ts
'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { notifyPostCommented, notifyPostLiked } from '@/lib/notifications/socialPush'
import type { ActionResult } from './posts'

function revalidatePostEngagement(postId: string) {
  revalidatePath('/feed')
  revalidatePath(`/post/${postId}`)
}

export async function toggleLike(postId: string): Promise<ActionResult<{ liked: boolean }>> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Sesión no válida.' }

  const { data: existing } = await (supabase.from('post_likes') as any)
    .select('post_id').eq('post_id', postId).eq('user_id', user.id).maybeSingle() as {
      data: { post_id: string } | null
    }

  if (existing) {
    const { error } = await (supabase.from('post_likes') as any)
      .delete().eq('post_id', postId).eq('user_id', user.id)
    if (error) return { ok: false, error: 'No se pudo quitar el like.' }
    revalidatePostEngagement(postId)
    return { ok: true, liked: false }
  }

  const { error } = await (supabase.from('post_likes') as any)
    .insert({ post_id: postId, user_id: user.id })
  if (error) return { ok: false, error: 'No se pudo dar like.' }
  revalidatePostEngagement(postId)
  try {
    await notifyPostLiked(postId, user.id)
  } catch {
    /* La notificacion push no debe bloquear el like. */
  }
  return { ok: true, liked: true }
}

export async function addComment(postId: string, body: string): Promise<ActionResult<{ id: string }>> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Sesión no válida.' }

  const text = body.trim()
  if (text.length < 1 || text.length > 1000) return { ok: false, error: 'Comentario fuera de rango (1–1000).' }

  const { data, error } = await (supabase.from('post_comments') as any)
    .insert({ post_id: postId, user_id: user.id, body: text }).select('id').single() as {
      data: { id: string } | null; error: unknown
    }
  if (error || !data) return { ok: false, error: 'No se pudo comentar.' }

  try {
    await notifyPostCommented(postId, user.id)
  } catch {
    /* La notificacion push no debe bloquear el comentario. */
  }
  revalidatePath(`/post/${postId}`)
  return { ok: true, id: data.id }
}

export async function deleteComment(commentId: string, postId: string): Promise<ActionResult> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Sesión no válida.' }

  const { error } = await (supabase.from('post_comments') as any)
    .delete().eq('id', commentId).eq('user_id', user.id)
  if (error) return { ok: false, error: 'No se pudo eliminar el comentario.' }

  revalidatePath(`/post/${postId}`)
  return { ok: true }
}
