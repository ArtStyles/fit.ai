// src/app/actions/follows.ts
'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import type { ActionResult } from './posts'

export async function followUser(targetId: string): Promise<ActionResult<{ following: boolean }>> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Sesión no válida.' }
  if (targetId === user.id) return { ok: false, error: 'No puedes seguirte a ti mismo.' }

  const { error } = await (supabase.from('follows') as any)
    .upsert({ follower_id: user.id, following_id: targetId })
  if (error) return { ok: false, error: 'No se pudo seguir.' }

  revalidatePath('/feed')
  return { ok: true, following: true }
}

export async function unfollowUser(targetId: string): Promise<ActionResult<{ following: boolean }>> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Sesión no válida.' }

  const { error } = await (supabase.from('follows') as any)
    .delete().eq('follower_id', user.id).eq('following_id', targetId)
  if (error) return { ok: false, error: 'No se pudo dejar de seguir.' }

  revalidatePath('/feed')
  return { ok: true, following: false }
}
