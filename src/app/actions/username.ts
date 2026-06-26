// src/app/actions/username.ts
'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { validateUsername } from '@/lib/social/username'
import type { ActionResult } from './posts'

export async function checkUsernameAvailable(raw: string): Promise<{ available: boolean; error?: string }> {
  const v = validateUsername(raw)
  if (!v.ok) return { available: false, error: v.error }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { available: false, error: 'Sesión no válida.' }

  const { data } = await (supabase.from('public_profiles') as any)
    .select('id').eq('username', v.value).neq('id', user.id).maybeSingle() as { data: { id: string } | null }
  return { available: !data }
}

export async function updateUsername(raw: string): Promise<ActionResult> {
  const v = validateUsername(raw)
  if (!v.ok) return { ok: false, error: v.error }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Sesión no válida.' }

  const { data: taken } = await (supabase.from('public_profiles') as any)
    .select('id').eq('username', v.value).neq('id', user.id).maybeSingle() as { data: { id: string } | null }
  if (taken) return { ok: false, error: 'Ese nombre de usuario ya está en uso.' }

  const { error } = await (supabase.from('profiles') as any)
    .update({ username: v.value }).eq('id', user.id)
  if (error) return { ok: false, error: 'Ese nombre de usuario ya está en uso.' }

  revalidatePath('/settings/perfil')
  return { ok: true }
}
