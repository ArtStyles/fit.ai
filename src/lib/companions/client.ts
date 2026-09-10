import type { CompanionCode, CompanionCodePreview, CompanionResult, CompanionRpcTransport, CompanionSnapshot } from './types'
import { isCompanionId, normalizeCompanionCode, parseCompanionCode, parseCompanionCodePreview, parseCompanionSnapshot, validateCompanionMessage } from './validation'

const unavailable = (): CompanionResult<never> => ({ ok: false, code: 'unavailable', error: 'No se pudo consultar a tu compañero. Inténtalo de nuevo.' })
const invalid = (error = 'No se pudo identificar esta solicitud.'): CompanionResult<never> => ({ ok: false, code: 'invalid', error })
function rpcError(message?: string): CompanionResult<never> {
  if (message?.includes('COMPANION_DAILY_LIMIT')) return { ok: false, code: 'daily_limit', error: 'Ya has enviado tu saludo de hoy. Actualiza la vista para ver cuándo puedes enviar otro.' }
  if (message && /COMPANION_.*(?:BUSY|CONFLICT|OCCUPIED)/.test(message)) return { ok: false, code: 'conflict', error: 'Una de las dos personas ya tiene un compañero o una invitación pendiente. Actualiza la vista.' }
  if (message && /COMPANION_.*(?:CODE|EXPIRED|SELF)/.test(message)) return invalid('Este código no está disponible. Compruébalo o pide uno nuevo.')
  if (message?.includes('COMPANION_IDEMPOTENCY_MISMATCH')) return { ok: false, code: 'conflict', error: 'Este envío ya se procesó con otro texto. Actualiza la vista antes de enviar otro saludo.' }
  if (message && /COMPANION_.*(?:NOT_ACTIVE|NOT_MEMBER|NOT_FOUND|FORBIDDEN|INVALID_STATE|NOT_ALLOWED|UNAVAILABLE)/.test(message)) return { ok: false, code: 'conflict', error: 'Este vínculo ha cambiado o ya no está disponible. Actualiza la vista.' }
  if (message && /COMPANION_.*(?:MESSAGE|TEXT|LENGTH)/.test(message)) return invalid('Tu mensaje puede tener hasta 120 caracteres.')
  if (message && /COMPANION_.*(?:AUTH|SESSION)/.test(message)) return { ok: false, code: 'unauthenticated', error: 'Inicia sesión para continuar.' }
  return unavailable()
}

export function createCompanionClient({ rpc, viewerId }: CompanionRpcTransport) {
  async function request<T>(name: string, args: Record<string, unknown>, parse: (data: unknown) => T | null): Promise<CompanionResult<T>> {
    if (!isCompanionId(viewerId)) return { ok: false, code: 'unauthenticated', error: 'Inicia sesión para continuar.' }
    try {
      const response = await rpc(name, args)
      if (response.error) return rpcError(response.error.message)
      const value = parse(response.data)
      return value === null ? unavailable() : { ok: true, value }
    } catch {
      return { ok: false, code: 'connection_required', error: 'Comprueba tu conexión e inténtalo de nuevo.' }
    }
  }
  const snapshotRequest = (name: string, args: Record<string, unknown> = {}) => request(name, args, data => parseCompanionSnapshot(data, viewerId))
  const codeArgs = (code: string) => normalizeCompanionCode(code)
  return {
    loadCompanion(): Promise<CompanionResult<CompanionSnapshot>> { return snapshotRequest('get_companion_state') },
    getCompanionCode(): Promise<CompanionResult<CompanionCode>> { return request('get_companion_invite_code', {}, parseCompanionCode) },
    async previewCompanionCode(code: string): Promise<CompanionResult<CompanionCodePreview>> {
      const normalized = codeArgs(code)
      if (!normalized) return invalid('Introduce un código de invitación válido.')
      return request('preview_companion_invite_code', { p_code: normalized }, data => parseCompanionCodePreview(data, viewerId, normalized))
    },
    async sendCompanionInvitation(code: string): Promise<CompanionResult<CompanionSnapshot>> {
      const normalized = codeArgs(code)
      return normalized ? snapshotRequest('request_companion', { p_code: normalized }) : invalid('Introduce un código de invitación válido.')
    },
    async respondCompanionInvitation(id: string, accept: boolean): Promise<CompanionResult<CompanionSnapshot>> {
      return isCompanionId(id) && typeof accept === 'boolean' ? snapshotRequest('respond_companion', { p_relationship_id: id, p_accept: accept }) : invalid()
    },
    async cancelCompanionInvitation(id: string): Promise<CompanionResult<CompanionSnapshot>> {
      return isCompanionId(id) ? snapshotRequest('cancel_companion_request', { p_relationship_id: id }) : invalid()
    },
    async leaveCompanion(id: string): Promise<CompanionResult<CompanionSnapshot>> {
      return isCompanionId(id) ? snapshotRequest('leave_companion', { p_relationship_id: id }) : invalid()
    },
    async sendCompanionGreeting(id: string, message: string, requestId: string): Promise<CompanionResult<CompanionSnapshot>> {
      if (!isCompanionId(id) || !isCompanionId(requestId)) return invalid()
      const text = validateCompanionMessage(message)
      if (!text.ok) return text
      return snapshotRequest('send_companion_greeting', { p_relationship_id: id, p_message: text.value, p_request_id: requestId })
    },
  }
}

export type CompanionClient = ReturnType<typeof createCompanionClient>
