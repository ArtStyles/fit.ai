// src/app/actions/moderation.ts
'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { communityUnavailableResult, isCommunityEnabled } from '@/lib/features/community'
import type { ActionResult } from './posts'

export interface ReportInput {
  postId?: string
  commentId?: string
  reason: string
}

export async function reportContent(input: ReportInput): Promise<ActionResult> {
  if (!isCommunityEnabled()) return communityUnavailableResult()
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Sesión no válida.' }

  const targets = [input.postId, input.commentId].filter(Boolean)
  if (targets.length !== 1) return { ok: false, error: 'Reporte inválido.' }
  if (!input.reason.trim()) return { ok: false, error: 'Indica un motivo.' }

  const { error } = await (supabase.from('post_reports') as any).insert({
    post_id: input.postId ?? null,
    comment_id: input.commentId ?? null,
    reporter_id: user.id,
    reason: input.reason.trim(),
  })
  if (error) return { ok: false, error: 'No se pudo enviar el reporte.' }
  return { ok: true }
}

export async function blockUser(blockedId: string): Promise<ActionResult> {
  if (!isCommunityEnabled()) return communityUnavailableResult()
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Sesión no válida.' }
  if (blockedId === user.id) return { ok: false, error: 'No puedes bloquearte a ti mismo.' }

  const { error } = await (supabase.from('user_blocks') as any)
    .upsert({ blocker_id: user.id, blocked_id: blockedId })
  if (error) return { ok: false, error: 'No se pudo bloquear.' }

  // Bloquear implica auto-unfollow en ambos sentidos. La dirección bloqueado→yo
  // no se puede borrar con el cliente de usuario (RLS solo permite follower propio),
  // así que se usa service-role.
  const service = createServiceClient()
  await (service.from('follows') as any).delete().eq('follower_id', user.id).eq('following_id', blockedId)
  await (service.from('follows') as any).delete().eq('follower_id', blockedId).eq('following_id', user.id)

  revalidatePath('/feed')
  return { ok: true }
}

export async function unblockUser(blockedId: string): Promise<ActionResult> {
  if (!isCommunityEnabled()) return communityUnavailableResult()
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Sesión no válida.' }

  const { error } = await (supabase.from('user_blocks') as any)
    .delete().eq('blocker_id', user.id).eq('blocked_id', blockedId)
  if (error) return { ok: false, error: 'No se pudo desbloquear.' }

  revalidatePath('/feed')
  return { ok: true }
}
