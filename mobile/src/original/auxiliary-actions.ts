import { getAppStore } from './storage'
import { remote, createConnectedClient, signOutLocally } from './bridge-client'
import { navigate, refresh } from './router'
import { WORKSPACE_COOKIE, workspaceDestination } from '@/lib/coaching/workspace'
import { validateUsername } from '@/lib/social/username'

export async function signOut() {
  await signOutLocally()
  navigate('/login')
}
export async function setWorkspace(formData: FormData) {
  const workspace = formData.get('workspace')
  if (workspace !== 'personal' && workspace !== 'coach') return { ok: false, code: 'invalid_workspace', error: 'Espacio no válido.' }
  if (workspace === 'coach') {
    const state = await (await getAppStore()).read()
    if (!state?.remoteUserId || !navigator.onLine || !remote) return { ok: false, code: 'coach_unavailable', error: 'Conecta tu cuenta de entrenador para abrir el espacio profesional.' }
    let client
    try { client = await createConnectedClient(state.accountId) } catch { return { ok: false, code: 'coach_unavailable', error: 'Vuelve a conectar esta cuenta para abrir el espacio profesional.' } }
    const { data, error } = await client.from('trainer_profiles').select('id').eq('user_id', state.remoteUserId).eq('status', 'active').maybeSingle()
    if (error || !data) return { ok: false, code: 'coach_unavailable', error: 'No se pudo verificar el acceso profesional.' }
  }
  document.cookie = `${WORKSPACE_COOKIE}=${workspace}; path=/; SameSite=Lax`
  return { ok: true, workspace, destination: workspaceDestination(workspace) }
}
export async function checkUsernameAvailable(raw: string) {
  const parsed = validateUsername(raw)
  if (!parsed.ok) return { available: false, error: parsed.error }
  const username = parsed.value
  const state = await (await getAppStore()).read()
  if (!state?.remoteUserId) return { available: true }
  if (!navigator.onLine || !remote) return { available: false, error: 'Conecta a internet para verificar tu nombre público.' }
  try {
    const client = await createConnectedClient(state.accountId)
    const { data, error } = await client.from('public_profiles').select('id').eq('username', username).neq('id', state.accountId).maybeSingle()
    return error ? { available: false, error: error.message } : { available: !data }
  } catch (reason) { return { available: false, error: reason instanceof Error ? reason.message : 'No se pudo verificar el nombre.' } }
}
export async function updateUsername(raw: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const store = await getAppStore(); const state = await store.read()
  if (!state) return { ok: false, error: 'Selecciona un perfil para continuar.' }
  const available = await checkUsernameAvailable(raw)
  if (!available.available) return { ok: false, error: available.error ?? 'Nombre no disponible.' }
  try {
  if (state.remoteUserId) {
    const client = await createConnectedClient(state.accountId)
    const { error } = await client.from('profiles').update({ username: raw.trim().toLowerCase() }).eq('id', state.accountId)
    if (error) return { ok: false, error: error.message }
  }
  await store.mutate(draft => {
    if (draft.accountId !== state.accountId) throw new Error('El perfil activo cambió. Inténtalo de nuevo.')
    draft.tables.profiles.find(row => row.id === state.accountId)!.username = raw.trim().toLowerCase()
  })
  refresh(); return { ok: true }
  } catch (reason) { return { ok: false, error: reason instanceof Error ? reason.message : 'No se pudo guardar el nombre.' } }
}
export async function deleteAccount() {
  // Account deletion needs the existing authenticated backend operation.
  navigate('/settings/cuenta?error=account_delete_online_required')
}
