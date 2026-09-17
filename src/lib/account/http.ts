import 'server-only'
import type { deleteVerifiedAccount } from './delete'

const MAX_ACCOUNT_BODY_BYTES = 1024

async function readConfirmationBody(request: Request): Promise<string | null> {
  if (Number(request.headers.get('Content-Length')) > MAX_ACCOUNT_BODY_BYTES) return null
  if (!request.body) return ''
  const reader = request.body.getReader()
  const bytes = new Uint8Array(MAX_ACCOUNT_BODY_BYTES)
  let length = 0
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) return new TextDecoder().decode(bytes.subarray(0, length))
      if (length + value.byteLength > MAX_ACCOUNT_BODY_BYTES) {
        await reader.cancel()
        return null
      }
      bytes.set(value, length)
      length += value.byteLength
    }
  } finally { reader.releaseLock() }
}

// No ambient cookies: possession of a server-verified bearer token authorizes
// this endpoint. CORS permits the bundled Capacitor origin without credentials.
export const accountApiHeaders = {
  'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type', 'Cache-Control': 'no-store',
}
export async function handleAccountDeletion(request: Request,
  remove: (confirmation: string, token: string) => ReturnType<typeof deleteVerifiedAccount>,
): Promise<Response> {
  const json = (body: unknown, status: number) => Response.json(body, { status, headers: accountApiHeaders })
  const token = /^Bearer ([^\s]+)$/i.exec(request.headers.get('Authorization') ?? '')?.[1]
  if (!token || token.length > 16_384) return json({ ok: false, code: 'auth_required' }, 401)
  if (!request.headers.get('Content-Type')?.startsWith('application/json')) return json({ ok: false, code: 'delete_confirm' }, 400)
  try {
    const body = await readConfirmationBody(request)
    if (body === null || body.length > 256) return json({ ok: false, code: 'delete_confirm' }, 400)
    const parsed = JSON.parse(body)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed) || Object.keys(parsed).some(key => key !== 'confirmText') || typeof parsed.confirmText !== 'string') return json({ ok: false, code: 'delete_confirm' }, 400)
    const result = await remove(parsed.confirmText, token)
    const status = result.ok ? 200 : result.code === 'auth_required' ? 401 : result.code === 'admin_owner_protected' ? 403 : result.code === 'delete_confirm' ? 400 : 503
    return json(result, status)
  } catch { return json({ ok: false, code: 'delete_failed' }, 503) }
}
