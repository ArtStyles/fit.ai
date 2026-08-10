export const TRAINING_PROFILE_CONSENT_VERSION = 'training-profile-v1'
export const TRAINING_PROFILE_CONSENT_TEXT = 'Acepto compartir los datos de mi perfil de entrenamiento con este profesional si acepta mi solicitud. Esto no incluye mis medidas corporales.'

type RequestFieldErrors = Record<string, string>
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export type CoachingRequestValue = {
  serviceId: string
  message: string
  consentVersion: typeof TRAINING_PROFILE_CONSENT_VERSION
  idempotencyKey: string
}

function formString(formData: FormData, name: string) {
  const value = formData.get(name)
  return typeof value === 'string' ? value.trim() : ''
}

export function validateCoachingRequest(formData: FormData):
  | { ok: true; value: CoachingRequestValue }
  | { ok: false; fieldErrors: RequestFieldErrors } {
  const serviceId = formString(formData, 'serviceId')
  const message = formString(formData, 'message')
  const consentAccepted = formString(formData, 'consentAccepted')
  const consentVersion = formString(formData, 'consentVersion')
  const idempotencyKey = formString(formData, 'idempotencyKey')
  const fieldErrors: RequestFieldErrors = {}

  if (!serviceId) fieldErrors.serviceId = 'Selecciona un servicio activo.'
  else if (!UUID_PATTERN.test(serviceId)) fieldErrors.serviceId = 'El servicio seleccionado no es válido.'
  if (message.length > 1000) fieldErrors.message = 'El mensaje puede tener hasta 1000 caracteres.'
  if (consentAccepted !== 'true') {
    fieldErrors.consentAccepted = 'Debes aceptar compartir los datos de tu perfil de entrenamiento.'
  }
  if (consentVersion !== TRAINING_PROFILE_CONSENT_VERSION) {
    fieldErrors.consentVersion = 'La versión del consentimiento no es válida.'
  }
  if (!UUID_PATTERN.test(idempotencyKey)) fieldErrors.idempotencyKey = 'No se pudo preparar la solicitud. Inténtalo de nuevo.'

  if (Object.keys(fieldErrors).length) return { ok: false, fieldErrors }
  return {
    ok: true,
    value: {
      serviceId,
      message,
      consentVersion: TRAINING_PROFILE_CONSENT_VERSION,
      idempotencyKey,
    },
  }
}
