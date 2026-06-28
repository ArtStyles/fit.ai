'use server'

import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'

type PushPlatform = 'android' | 'ios'

type PushTokenResult =
  | { ok: true }
  | { ok: false; error: string }

export type SocialNotificationPreferencesInput = {
  likes_enabled: boolean
  comments_enabled: boolean
  follows_enabled: boolean
  follow_requests_enabled: boolean
}

function isPushPlatform(value: string): value is PushPlatform {
  return value === 'android' || value === 'ios'
}

export async function registerSocialPushToken(input: {
  token: string
  platform: string
  deviceId?: string | null
}): Promise<PushTokenResult> {
  const token = input.token.trim()
  if (!token) return { ok: false, error: 'Token de push vacio.' }
  if (!isPushPlatform(input.platform)) return { ok: false, error: 'Plataforma de push no soportada.' }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Sesion no valida.' }

  let service: ReturnType<typeof createServiceClient>
  try {
    service = createServiceClient()
  } catch {
    return { ok: false, error: 'Service role no configurada.' }
  }

  const { error: tokenError } = await (service.from('social_push_tokens') as any)
    .upsert({
      user_id: user.id,
      token,
      platform: input.platform,
      device_id: input.deviceId ?? null,
      enabled: true,
      last_seen_at: new Date().toISOString(),
    }, { onConflict: 'token' })

  if (tokenError) return { ok: false, error: 'No se pudo registrar el dispositivo.' }

  await (service.from('social_notification_preferences') as any)
    .upsert({ user_id: user.id }, { onConflict: 'user_id' })

  return { ok: true }
}

export async function disableSocialPushToken(token: string): Promise<PushTokenResult> {
  const normalized = token.trim()
  if (!normalized) return { ok: true }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Sesion no valida.' }

  let service: ReturnType<typeof createServiceClient>
  try {
    service = createServiceClient()
  } catch {
    return { ok: false, error: 'Service role no configurada.' }
  }

  const { error } = await (service.from('social_push_tokens') as any)
    .update({ enabled: false })
    .eq('token', normalized)
    .eq('user_id', user.id)

  if (error) return { ok: false, error: 'No se pudo desactivar el dispositivo.' }
  return { ok: true }
}

export async function updateSocialNotificationPreferences(
  preferences: SocialNotificationPreferencesInput,
): Promise<PushTokenResult> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Sesion no valida.' }

  const { error } = await (supabase.from('social_notification_preferences') as any)
    .upsert({
      user_id: user.id,
      likes_enabled: preferences.likes_enabled,
      comments_enabled: preferences.comments_enabled,
      follows_enabled: preferences.follows_enabled,
      follow_requests_enabled: preferences.follow_requests_enabled,
    }, { onConflict: 'user_id' })

  if (error) return { ok: false, error: 'No se pudieron guardar las preferencias.' }
  return { ok: true }
}
