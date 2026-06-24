'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { validateAvatarFile, avatarStoragePath } from '@/lib/images/avatar'

const BUCKET = 'avatars'

export type AvatarActionResult =
  | { ok: true; url: string }
  | { ok: false; error: string }

export async function updateAvatar(formData: FormData): Promise<AvatarActionResult> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Sesión no válida.' }

  const file = formData.get('file')
  if (!(file instanceof File)) return { ok: false, error: 'No se recibió ninguna imagen.' }

  const check = validateAvatarFile(file.type, file.size)
  if (!check.ok) return check

  const service = createServiceClient()
  const path = avatarStoragePath(user.id)

  const { error: uploadError } = await service.storage
    .from(BUCKET)
    .upload(path, file, { contentType: file.type, upsert: true, cacheControl: '3600' })
  if (uploadError) return { ok: false, error: 'No se pudo subir la imagen.' }

  const publicUrl = service.storage.from(BUCKET).getPublicUrl(path).data.publicUrl
  const urlWithVersion = `${publicUrl}?v=${Date.now()}`

  const { error: updateError } = await (service.from('profiles') as any)
    .update({ avatar_url: urlWithVersion })
    .eq('id', user.id)
  if (updateError) return { ok: false, error: 'No se pudo guardar el avatar.' }

  revalidatePath('/dashboard')
  revalidatePath('/settings/perfil')
  return { ok: true, url: urlWithVersion }
}

export async function removeAvatar(): Promise<{ ok: boolean }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false }

  const service = createServiceClient()
  await service.storage.from(BUCKET).remove([avatarStoragePath(user.id)])

  const { error } = await (service.from('profiles') as any)
    .update({ avatar_url: null })
    .eq('id', user.id)
  if (error) return { ok: false }

  revalidatePath('/dashboard')
  revalidatePath('/settings/perfil')
  return { ok: true }
}
