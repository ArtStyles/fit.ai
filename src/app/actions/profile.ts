'use server'

import { createClient } from '@/lib/supabase/server'

/**
 * Sincroniza la zona horaria IANA detectada por el cliente (Intl).
 * Se valida server-side: un valor inválido no toca el perfil.
 */
export async function syncTimezone(timezone: string): Promise<{ success: boolean }> {
  if (typeof timezone !== 'string' || timezone.length === 0 || timezone.length > 64) {
    return { success: false }
  }

  try {
    new Intl.DateTimeFormat('en-US', { timeZone: timezone }).format(new Date())
  } catch {
    return { success: false }
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false }

  const { error } = await (supabase
    .from('profiles') as any)
    .update({ timezone })
    .eq('id', user.id) as { error: { message: string } | null }

  if (error) {
    console.error('[profile] syncTimezone falló:', error)
    return { success: false }
  }

  return { success: true }
}
