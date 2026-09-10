import type { SupabaseClient } from '@supabase/supabase-js'
import { remote, resumeLocalAuthentication } from './bridge-client'
import { getAppStore } from './storage'
import { prepareSignedInAccount } from './sync'

const AUTH_FLOW_METHODS = new Set(['signInWithPassword', 'verifyOtp', 'signUp', 'resend', 'resetPasswordForEmail'])

/** The original browser client is used by LoginForm, RegisterForm and VerifyCodeStep only. */
export function createBrowserAuthClient({ remoteClient, online, prepare, resume = () => {}, sessionVersion }: {
  remoteClient: SupabaseClient | null
  online: () => boolean
  prepare: (expectedSessionVersion?: number) => Promise<void>
  resume?: () => void
  sessionVersion?: () => number | Promise<number>
}): SupabaseClient {
  const auth = new Proxy({}, { get(_target, method) {
    if (typeof method !== 'string') return undefined
    return async (...args: unknown[]) => {
      try {
        if (!online()) throw new Error('Conecta a internet para iniciar sesión e inténtalo de nuevo.')
        if (!remoteClient) throw new Error('Esta versión no tiene configurada la conexión de cuenta.')
        if (!AUTH_FLOW_METHODS.has(method)) throw new Error('Usa la conexión de datos de la cuenta activa para esta operación.')
        const createsSession = ['signInWithPassword', 'verifyOtp', 'signUp'].includes(method)
        const expectedSessionVersion = createsSession ? await sessionVersion?.() : undefined
        if (createsSession) resume()
        const operation = Reflect.get(remoteClient.auth, method)
        if (typeof operation !== 'function') throw new Error('La operación de acceso no está disponible.')
        const result = await operation.apply(remoteClient.auth, args)
        if (!result.error && result.data?.session && createsSession) await prepare(expectedSessionVersion)
        return result
      } catch (reason) {
        return { data: { user: null, session: null }, error: { name: 'AuthError', status: 400,
          message: reason instanceof Error ? reason.message : 'No se pudieron descargar los datos de la cuenta.' } }
      }
    }
  } })
  return new Proxy({ auth }, { get(target, property) {
    if (property === 'auth') return target.auth
    if (property === 'then') return undefined
    return () => { throw new Error('Los datos requieren la conexión protegida de la cuenta activa.') }
  } }) as unknown as SupabaseClient
}

export function createClient(): SupabaseClient {
  return createBrowserAuthClient({ remoteClient: remote, online: () => typeof navigator === 'undefined' || navigator.onLine, resume: resumeLocalAuthentication,
    sessionVersion: async () => (await getAppStore()).sessionVersion(),
    prepare: async expectedSessionVersion => { await prepareSignedInAccount(expectedSessionVersion); await remote?.auth.startAutoRefresh() } })
}
