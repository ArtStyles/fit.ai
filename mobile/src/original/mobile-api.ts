import { createConnectedClient } from './bridge-client'
import { getAppStore } from './storage'
import { redirect } from './router'

type Payload = Record<string, unknown> | FormData
type Envelope<T> = { ok: true; data?: T; redirect?: string } | { ok: false; error?: { code?: string; message?: string } }

export async function requestMobileApi<T>({ url, token, payload = {}, assertCurrent, fetcher = fetch }: {
  url: string; token: string; payload?: Payload; assertCurrent: () => Promise<void>; fetcher?: typeof fetch
}): Promise<T> {
  await assertCurrent()
  const multipart = payload instanceof FormData
  const response = await fetcher(url, {
    method: 'POST', credentials: 'omit', redirect: 'error', cache: 'no-store',
    headers: { Authorization: `Bearer ${token}`, ...(!multipart ? { 'Content-Type': 'application/json' } : {}) },
    body: multipart ? payload : JSON.stringify(payload), signal: AbortSignal.timeout(90_000),
  })
  await assertCurrent()
  let result: Envelope<T>
  try { result = await response.json() } catch { throw new Error('No se pudo conectar con el servicio de Vekira. Intenta de nuevo.') }
  await assertCurrent()
  if (!response.ok || !result || !result.ok) {
    throw new Error(result && !result.ok && result.error?.message || 'No se pudo completar la operación. Vuelve a intentarlo.')
  }
  if (result.redirect) {
    if (!/^\/(?:coach|chat|admin)(?:[/?]|$)/.test(result.redirect) || result.redirect.includes('\\')) throw new Error('El servicio devolvió un destino no válido.')
    redirect(result.redirect)
  }
  return result.data as T
}

export async function mobileApi<T>(path: string, payload?: Payload): Promise<T> {
  if (!/^\/api\/mobile\/(?:admin|coaching|chat)$/.test(path)) throw new Error('Servicio no válido.')
  const configured = import.meta.env.VITE_ACCOUNT_API_URL || import.meta.env.VITE_WEB_APP_URL
  let origin: URL
  try { origin = new URL(configured) } catch { throw new Error('Esta versión no tiene configurado el servicio de Vekira.') }
  if (origin.protocol !== 'https:' && !(import.meta.env.DEV && origin.hostname === '127.0.0.1')) throw new Error('El servicio necesita una conexión segura.')
  if (origin.username || origin.password || origin.pathname !== '/' || origin.search || origin.hash) throw new Error('La dirección del servicio no es válida.')
  const store = await getAppStore()
  const version = store.sessionVersion()
  const owner = (await store.read())?.accountId
  if (!owner) throw new Error('Inicia sesión para continuar.')
  const client = await createConnectedClient(owner)
  const session = await client.auth.getSession()
  const token = session.data.session?.access_token
  if (session.error || !token || session.data.session?.user.id !== owner) throw new Error('Vuelve a iniciar sesión con esta cuenta.')
  const assertCurrent = async () => {
    if (store.sessionVersion() !== version || (await store.read())?.accountId !== owner) throw new Error('La cuenta activa cambió. Vuelve a abrir esta pantalla.')
    const current = await client.auth.getUser()
    if (current.error || current.data.user?.id !== owner || store.sessionVersion() !== version) throw new Error('Vuelve a conectar esta cuenta para continuar.')
  }
  return requestMobileApi<T>({ url: new URL(path, origin).href, token, payload, assertCurrent })
}
