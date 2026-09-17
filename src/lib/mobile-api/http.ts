import 'server-only'
import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { withMobileApiContext, type MobileApiContext } from './context'

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type',
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
}
export class MobileApiError extends Error {
  constructor(public status: number, public code: string, message = code) { super(message) }
}
export const mobileApiOptions = () => new Response(null, { status: 204, headers })
const json = (body: unknown, status = 200) => Response.json(body, { status, headers })

async function limitedBody(request: Request, limit: number): Promise<Uint8Array<ArrayBuffer>> {
  if (Number(request.headers.get('content-length')) > limit) throw new MobileApiError(413, 'request_too_large', 'El archivo o mensaje es demasiado grande.')
  if (!request.body) return new Uint8Array()
  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []
  let length = 0
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      length += value.byteLength
      if (length > limit) { await reader.cancel(); throw new MobileApiError(413, 'request_too_large', 'El archivo o mensaje es demasiado grande.') }
      chunks.push(value)
    }
  } finally { reader.releaseLock() }
  const result = new Uint8Array(length)
  let offset = 0
  for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.byteLength }
  return result
}

export async function readMobileJson(request: Request): Promise<unknown> {
  const body = await limitedBody(request, 128 * 1024)
  try { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(body)) }
  catch { throw new MobileApiError(400, 'invalid_request', 'La solicitud no es válida.') }
}

export async function readMobileForm(request: Request): Promise<FormData> {
  const body = await limitedBody(request, 12 * 1024 * 1024)
  try { return await new Request(request.url, { method: 'POST', headers: request.headers, body }).formData() }
  catch { throw new MobileApiError(400, 'invalid_request', 'El formulario no es válido.') }
}

/** Only explicit endpoint handlers run inside this scope. No caller-selected code.
 * Cookie/header identities never authorize mobile requests; bearer is verified
 * with Supabase on every request. Service clients remain inside existing guards.
 */
export async function handleMobileApi(request: Request, handler: (context: MobileApiContext) => Promise<unknown>): Promise<Response> {
  if (request.method === 'OPTIONS') return mobileApiOptions()
  if (request.method !== 'POST') return json({ ok: false, error: { code: 'method_not_allowed' } }, 405)
  try {
    const token = /^Bearer ([^\s]+)$/i.exec(request.headers.get('authorization') ?? '')?.[1]
    if (!token || token.length > 16_384) throw new MobileApiError(401, 'auth_required', 'Inicia sesión para continuar.')
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    if (!url || !key) throw new MobileApiError(503, 'service_unavailable', 'El servicio no está disponible.')
    const raw = createClient<Database>(url, key, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    })
    const verified = await raw.auth.getUser(token)
    if (verified.error || !verified.data.user) throw new MobileApiError(401, 'auth_required', 'Vuelve a iniciar sesión.')
    // Existing actions call auth.getUser() without a token. They must see this
    // request's verified user, never a persisted session or another request.
    const auth = new Proxy(raw.auth, { get(target, property) {
      if (property === 'getUser') return () => Promise.resolve(verified)
      const value = Reflect.get(target, property)
      return typeof value === 'function' ? value.bind(target) : value
    } })
    const client = new Proxy(raw, { get(target, property) {
      if (property === 'auth') return auth
      const value = Reflect.get(target, property)
      return typeof value === 'function' ? value.bind(target) : value
    } })
    // @supabase/ssr 0.5 declares the older generic signature of the same client.
    const context: MobileApiContext = { user: verified.data.user, client: client as unknown as MobileApiContext['client'] }
    const data = await withMobileApiContext(context, () => handler(context))
    return json({ ok: true, data: data ?? null })
  } catch (error) {
    if (error instanceof MobileApiError) return json({ ok: false, error: { code: error.code, message: error.message } }, error.status)
    const digest = error && typeof error === 'object' && 'digest' in error ? String(error.digest) : ''
    if (digest.startsWith('NEXT_REDIRECT;')) {
      const destination = digest.split(';').slice(2, -2).join(';')
      if (/^\/login(?:[/?]|$)/.test(destination)) return json({ ok: false, error: { code: 'auth_required', message: 'Inicia sesión para continuar.' } }, 401)
      if (/^\/onboarding(?:[/?]|$)/.test(destination)) return json({ ok: false, error: { code: 'onboarding_required', message: 'Completa tu perfil en la aplicación y vuelve a intentarlo con conexión.' } }, 409)
      if (/^\/(?:dashboard|suspended)(?:[/?]|$)/.test(destination)) return json({ ok: false, error: { code: 'forbidden', message: 'No tienes acceso a esta función.' } }, 403)
      if (/^\/(?:coach|chat|admin)(?:[/?]|$)/.test(destination) && !destination.includes('\\')) return json({ ok: true, redirect: destination })
    }
    return json({ ok: false, error: { code: 'request_failed', message: 'No se pudo completar la operación. Intenta de nuevo.' } }, 500)
  }
}
