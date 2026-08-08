'use server'

import { revalidatePath } from 'next/cache'
import { requireAppUserContext } from '@/lib/auth/server'
import { validateCoachingRequest } from '@/lib/coaching/requestValidation'

type CoachingRequestFailure = { ok: false; error: string; fieldErrors?: Record<string, string> }
type CoachingRequestResult = { ok: true; requestId: string; created: boolean } | CoachingRequestFailure
type CancelCoachingRequestResult = { ok: true; requestId: string } | CoachingRequestFailure

const requestErrors: Record<string, string> = {
  COACHING_SERVICE_NOT_AVAILABLE: 'Este servicio ya no está disponible.',
  COACHING_TRAINER_NOT_ACTIVE: 'Este perfil profesional ya no está activo.',
  COACHING_PENDING_REQUEST_EXISTS: 'Ya tienes una solicitud pendiente para este servicio.',
  COACHING_ACTIVE_RELATIONSHIP_EXISTS: 'Ya tienes una relación profesional activa.',
  COACHING_SELF_REQUEST_FORBIDDEN: 'No puedes solicitar tu propio servicio.',
}

function rpcError(error: unknown, fallback: string) {
  const message = typeof (error as { message?: unknown } | null)?.message === 'string'
    ? (error as { message: string }).message
    : ''
  return requestErrors[message] ?? fallback
}

function revalidateCoachingPaths() {
  revalidatePath('/coaching')
  revalidatePath('/trainers')
}

export async function createCoachingRequest(formData: FormData): Promise<CoachingRequestResult> {
  const { supabase } = await requireAppUserContext()
  const validation = validateCoachingRequest(formData)
  if (!validation.ok) return { ok: false, error: 'Revisa los datos de la solicitud.', fieldErrors: validation.fieldErrors }

  const { data, error } = await (supabase as any).rpc('create_coaching_request', {
    service_id: validation.value.serviceId,
    message: validation.value.message,
    consent_version: validation.value.consentVersion,
    idempotency_key: validation.value.idempotencyKey,
  })
  const result = Array.isArray(data) ? data[0] : data
  if (error || !result?.request_id) return { ok: false, error: rpcError(error, 'No se pudo crear la solicitud.') }

  revalidateCoachingPaths()
  return { ok: true, requestId: result.request_id, created: result.created !== false }
}

export async function cancelCoachingRequest(formData: FormData): Promise<CancelCoachingRequestResult> {
  const { supabase } = await requireAppUserContext()
  const requestId = typeof formData.get('requestId') === 'string' ? String(formData.get('requestId')).trim() : ''
  if (!requestId) return { ok: false, error: 'No se encontró la solicitud.' }

  const { data, error } = await (supabase as any).rpc('cancel_coaching_request', { p_request_id: requestId })
  const result = Array.isArray(data) ? data[0] : data
  if (error || !result?.request_id) {
    const message = typeof (error as { message?: unknown } | null)?.message === 'string'
      ? (error as { message: string }).message
      : ''
    return { ok: false, error: message === 'COACHING_REQUEST_NOT_CANCELLABLE' ? 'La solicitud ya no se puede cancelar.' : 'No se pudo cancelar la solicitud.' }
  }

  revalidateCoachingPaths()
  return { ok: true, requestId: result.request_id }
}
