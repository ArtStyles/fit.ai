// src/app/actions/moderation.ts
'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import type { ActionResult } from './posts'

export interface ReportInput {
  postId?: string
  commentId?: string
  reason: string
}

export async function reportContent(input: ReportInput): Promise<ActionResult> {
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
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Sesión no válida.' }
  if (blockedId === user.id) return { ok: false, error: 'No puedes bloquearte a ti mismo.' }

  const { error } = await (supabase.from('user_blocks') as any)
    .upsert({ blocker_id: user.id, blocked_id: blockedId })
  if (error) return { ok: false, error: 'No se pudo bloquear.' }

  revalidatePath('/feed')
  return { ok: true }
}

export async function unblockUser(blockedId: string): Promise<ActionResult> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Sesión no válida.' }

  const { error } = await (supabase.from('user_blocks') as any)
    .delete().eq('blocker_id', user.id).eq('blocked_id', blockedId)
  if (error) return { ok: false, error: 'No se pudo desbloquear.' }

  revalidatePath('/feed')
  return { ok: true }
}
