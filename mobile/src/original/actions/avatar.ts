import { avatarStoragePath, validateAvatarFile } from '@/lib/images/avatar'
import { createConnectedClient } from '../bridge-client'
import { getAppStore, type AppState, type AppStore } from '../storage'
import { profile } from './state'

export type AvatarActionResult = { ok: true; url: string } | { ok: false; error: string }
const BUCKET = 'avatars'
const changedAccount = () => new Error('La cuenta activa cambió. Vuelve a la cuenta original para comprobar la foto.')

async function captureAccount() {
  const store = await getAppStore()
  const sessionVersion = store.sessionVersion()
  const state = await store.read()
  if (!state) throw new Error('Selecciona un perfil para continuar.')
  profile(state)
  return { store, state, sessionVersion }
}

async function persistAvatar(store: AppStore, captured: AppState, sessionVersion: number, url: string | null) {
  await store.mutate(state => {
    if (store.sessionVersion() !== sessionVersion || state.accountId !== captured.accountId || state.remoteUserId !== captured.remoteUserId) throw changedAccount()
    profile(state).avatar_url = url
    // A confirmed online edit is also the new base for the next three-way refresh.
    if (captured.remoteUserId) {
      const base = state.tables.mobile_web_base?.[0]?.tables?.profiles?.find((row: { id: string }) => row.id === captured.accountId)
      if (base) base.avatar_url = url
    }
  })
}

async function localImageUrl(file: File) {
  const bytes = new Uint8Array(await file.arrayBuffer())
  let binary = ''
  for (let offset = 0; offset < bytes.length; offset += 8192) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192))
  }
  return `data:${file.type};base64,${btoa(binary)}`
}

export async function updateAvatar(formData: FormData): Promise<AvatarActionResult> {
  const file = formData.get('file')
  if (!(file instanceof File)) return { ok: false, error: 'No se recibió ninguna imagen.' }
  const valid = validateAvatarFile(file.type, file.size)
  if (!valid.ok) return valid
  if (!['image/webp', 'image/jpeg', 'image/png'].includes(file.type)) return { ok: false, error: 'Usa una imagen JPG, PNG o WebP.' }
  try {
    const { store, state, sessionVersion } = await captureAccount()
    let url: string
    if (state.remoteUserId) {
      const client = await createConnectedClient(state.accountId)
      const storage = client.storage.from(BUCKET)
      const { error: uploadError } = await storage.upload(avatarStoragePath(state.remoteUserId), file, {
        contentType: file.type, upsert: true, cacheControl: '3600',
      })
      if (uploadError) return { ok: false, error: 'No se pudo subir la imagen.' }
      url = `${storage.getPublicUrl(avatarStoragePath(state.remoteUserId)).data.publicUrl}?v=${Date.now()}`
      const { data, error } = await client.from('profiles').update({ avatar_url: url })
        .eq('id', state.remoteUserId).select('id,avatar_url').single()
      if (error || !data || data.id !== state.remoteUserId || data.avatar_url !== url) {
        return { ok: false, error: 'No se pudo guardar el avatar.' }
      }
    } else {
      url = await localImageUrl(file)
    }
    await persistAvatar(store, state, sessionVersion, url)
    return { ok: true, url }
  } catch (reason) {
    return { ok: false, error: reason instanceof Error ? reason.message : 'No se pudo guardar el avatar.' }
  }
}

export async function removeAvatar(): Promise<{ ok: boolean; error?: string }> {
  try {
    const { store, state, sessionVersion } = await captureAccount()
    if (state.remoteUserId) {
      const client = await createConnectedClient(state.accountId)
      const { error: removalError } = await client.storage.from(BUCKET).remove([avatarStoragePath(state.remoteUserId)])
      if (removalError) return { ok: false, error: 'No se pudo eliminar la foto.' }
      const { data, error } = await client.from('profiles').update({ avatar_url: null })
        .eq('id', state.remoteUserId).select('id,avatar_url').single()
      if (error || !data || data.id !== state.remoteUserId || data.avatar_url !== null) return { ok: false, error: 'No se pudo eliminar la foto.' }
    }
    await persistAvatar(store, state, sessionVersion, null)
    return { ok: true }
  } catch (reason) {
    return { ok: false, error: reason instanceof Error ? reason.message : 'No se pudo eliminar la foto.' }
  }
}
