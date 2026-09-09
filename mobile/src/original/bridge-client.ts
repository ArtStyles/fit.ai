import { createClient as createSupabaseClient, type SupabaseClient } from '@supabase/supabase-js'
import { createAppClient } from './query'
import { getAppStore } from './storage'
import type { AppStore } from './types'

export const AUTH_STORAGE_KEY = 'vekira-original-auth'
const AUTH_KEYS = [AUTH_STORAGE_KEY, `${AUTH_STORAGE_KEY}-code-verifier`, `${AUTH_STORAGE_KEY}-user`]
type AuthBacking = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>
export function createAuthStorage(backing?: AuthBacking) {
  const memory = new Map<string, string>()
  let paused = false
  const fallback: AuthBacking = { getItem: key => memory.get(key) ?? null, setItem: (key, value) => { memory.set(key, value) }, removeItem: key => { memory.delete(key) } }
  function current(): AuthBacking {
    if (backing) return backing
    try { if (typeof globalThis.localStorage !== 'undefined') return globalThis.localStorage } catch { /* Ephemeral auth where browser storage is unavailable. */ }
    return fallback
  }
  return {
    getItem(key: string) { return paused && AUTH_KEYS.includes(key) ? null : current().getItem(key) },
    setItem(key: string, value: string) { if (!paused || !AUTH_KEYS.includes(key)) current().setItem(key, value) },
    removeItem(key: string) { current().removeItem(key); memory.delete(key) },
    pause() { paused = true },
    resume() { paused = false },
  }
}
const authStorage = createAuthStorage()
const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_ANON_KEY
export const remote = url && key ? createSupabaseClient(url, key, { auth: { persistSession: true, storage: authStorage, storageKey: AUTH_STORAGE_KEY, autoRefreshToken: true, detectSessionInUrl: false } }) : null

export function resumeLocalAuthentication(): void { authStorage.resume() }
export async function signOutLocally(client: SupabaseClient | null = remote, storage = authStorage): Promise<void> {
  // SDK 2.106.1 reads its configured storage in signOut; clearing these exact
  // keys first makes it emit SIGNED_OUT without attempting a remote logout.
  // Pausing writes also rejects a refresh that was already in flight.
  storage.pause()
  if (client) await client.auth.stopAutoRefresh()
  for (const storageKey of AUTH_KEYS) storage.removeItem(storageKey)
  if (client) {
    const result = await client.auth.signOut({ scope: 'local' })
    if (result.error) throw result.error
  }
}
export function isConnectedRoute(pathname = typeof location === 'undefined' ? '/' : location.pathname) {
  return /^\/(coach(?:\/|$)|coaching(?:\/|$)|trainers(?:\/|$)|solicitudes(?:\/|$)|feed(?:\/|$)|notifications(?:\/|$)|chat(?:\/|$)|post(?:\/|$)|u(?:\/|$)|buscar(?:\/|$))/.test(pathname)
}
const changedAccount = () => new Error('La cuenta activa cambió o no corresponde a la sesión conectada. Vuelve a conectar esta cuenta para continuar.')
const offline = () => new Error('Conecta a internet para usar esta función. Tu entrenamiento personal sigue disponible sin conexión.')
const authFailure = (reason: unknown) => ({ name: 'AuthError', message: reason instanceof Error ? reason.message : 'No se pudo comprobar esta cuenta.', status: 401 })

export async function createBoundClient({
  store, remoteClient, pathname, online, url: endpoint, key: publicKey, fetcher = globalThis.fetch,
  expectedAccountId,
}: {
  store: AppStore
  remoteClient: SupabaseClient | null
  pathname: string
  online: () => boolean
  url?: string
  key?: string
  fetcher?: typeof fetch
  expectedAccountId?: string | null
}): Promise<SupabaseClient> {
  const initial = await store.read()
  const owner = initial?.accountId ?? null
  if (expectedAccountId !== undefined && expectedAccountId !== owner) throw changedAccount()
  const readSameAccount = async () => {
    const state = await store.read()
    return state?.accountId === owner ? state : null
  }

  if (!isConnectedRoute(pathname)) {
    // The original query adapter captures ownership too. A scoped read additionally
    // closes the gap between this async context load and that initial capture.
    const scopedStore = new Proxy(store, { get(target, property) {
      if (property === 'read') return readSameAccount
      const value = Reflect.get(target, property)
      return typeof value === 'function' ? value.bind(target) : value
    } })
    const client = createAppClient(scopedStore)
    const auth = {
      async getUser() {
        const state = await readSameAccount()
        return { data: { user: state ? { id: state.accountId, email: state.email } : null }, error: state || !owner ? null : authFailure(changedAccount()) }
      },
      async getSession() { return { data: { session: null }, error: null } },
    }
    return { ...client, auth } as unknown as SupabaseClient
  }

  if (!online()) throw offline()
  if (!remoteClient || !endpoint || !publicKey) throw new Error('Esta versión no tiene configurada la conexión de cuenta.')
  if (!initial?.remoteUserId || initial.remoteUserId !== owner) throw new Error('Inicia sesión con esta cuenta para usar entrenadores y funciones con conexión. Tu perfil local sigue disponible sin internet.')
  const sessionResult = await remoteClient.auth.getSession()
  const session = sessionResult.data.session
  if (sessionResult.error || !session?.access_token || session.user.id !== owner) throw changedAccount()
  const verified = await remoteClient.auth.getUser(session.access_token)
  if (verified.error || verified.data.user?.id !== owner) throw changedAccount()

  async function guard() {
    if (!online()) throw offline()
    const state = await readSameAccount()
    const current = await remoteClient!.auth.getSession()
    if (!state || state.remoteUserId !== owner || current.error || current.data.session?.user.id !== owner) throw changedAccount()
  }
  await guard()
  // A fixed verified access token prevents a request constructed for account A
  // from silently picking up account B's token after an authentication switch.
  const scoped = createSupabaseClient(endpoint, publicKey, {
    accessToken: async () => session.access_token,
    global: { fetch: async (input, init) => {
      const denied = (reason: unknown) => new Response(JSON.stringify({ code: '28000', message: authFailure(reason).message, details: null, hint: null }), {
        status: 401, headers: { 'Content-Type': 'application/json' },
      })
      // Return a normal denied response instead of a network exception so the
      // transport does not automatically retry a request for the wrong account.
      try { await guard() } catch (reason) { return denied(reason) }
      const response = await fetcher(input, init)
      try { await guard() } catch (reason) { return denied(reason) }
      return response
    } },
  })
  const auth = {
    async getUser() {
      try { await guard(); return { data: { user: verified.data.user }, error: null } }
      catch (reason) { return { data: { user: null }, error: authFailure(reason) } }
    },
    async getSession() {
      try { await guard(); return { data: { session }, error: null } }
      catch (reason) { return { data: { session: null }, error: authFailure(reason) } }
    },
  }
  return new Proxy(scoped, { get(target, property) {
    if (property === 'auth') return auth
    if (property === 'channel') return () => { throw new Error('La conexión en tiempo real necesita volver a abrirse desde la cuenta activa.') }
    const value = Reflect.get(target, property)
    return typeof value === 'function' ? value.bind(target) : value
  } })
}

export async function createClient(options?: { expectedAccountId?: string | null }): Promise<SupabaseClient> {
  return createBoundClient({ store: await getAppStore(), remoteClient: remote, url, key,
    pathname: typeof location === 'undefined' ? '/' : location.pathname,
    online: () => typeof navigator === 'undefined' || navigator.onLine,
    expectedAccountId: options?.expectedAccountId })
}

/** Online-only actions in personal settings must use the same ownership guard. */
export async function createConnectedClient(expectedAccountId?: string): Promise<SupabaseClient> {
  return createBoundClient({ store: await getAppStore(), remoteClient: remote, url, key,
    pathname: '/trainers', online: () => typeof navigator === 'undefined' || navigator.onLine,
    expectedAccountId })
}
