'use server'

import { createClient } from '@/lib/supabase/server'

type PushPlatform = 'android' | 'ios'

type PushTokenResult =
  | { ok: true }
  | { ok: false; error: string }

export async function registerProductPushToken(input: {
  token: string
  platform: string
  deviceId: string
}): Promise<PushTokenResult> {
  const token = input.token.trim()
  const deviceId = input.deviceId.trim()
  if (!token) return { ok: false, error: 'Token de push vacio.' }
  if (!isPushPlatform(input.platform)) return { ok: false, error: 'Plataforma de push no soportada.' }
  if (!deviceId) return { ok: false, error: 'Dispositivo no valido.' }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Sesion no valida.' }

  const { error } = await (supabase
    .from('product_push_tokens') as any)
    .upsert({
      user_id: user.id,
      token,
      platform: input.platform,
      device_id: deviceId,
      enabled: true,
      last_seen_at: new Date().toISOString(),
    }, { onConflict: 'user_id,device_id' })

  if (error) return { ok: false, error: 'No se pudo registrar el dispositivo.' }
  return { ok: true }
}

function isPushPlatform(value: string): value is PushPlatform {
  return value === 'android' || value === 'ios'
}

export async function disableProductPushToken(token: string): Promise<PushTokenResult> {
  const normalized = token.trim()
  if (!normalized) return { ok: true }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Sesion no valida.' }

  const { error } = await (supabase
    .from('product_push_tokens') as any)
    .update({ enabled: false })
    .eq('token', normalized)
    .eq('user_id', user.id)

  if (error) return { ok: false, error: 'No se pudo desactivar el dispositivo.' }
  return { ok: true }
}

export async function updateProductNotificationPreferences(input: {
  professionalEnabled: boolean
  pushEnabled: boolean
}): Promise<PushTokenResult> {
  if (typeof input.professionalEnabled !== 'boolean' || typeof input.pushEnabled !== 'boolean') {
    return { ok: false, error: 'Preferencias no validas.' }
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Sesion no valida.' }

  const { error } = await (supabase
    .from('product_notification_preferences') as any)
    .update({
      professional_enabled: input.professionalEnabled,
      push_enabled: input.pushEnabled,
    })
    .eq('user_id', user.id)

  if (error) return { ok: false, error: 'No se pudieron guardar las preferencias.' }
  return { ok: true }
}
