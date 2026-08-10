import { describe, expect, it } from 'vitest'
import {
  TRAINING_PROFILE_CONSENT_TEXT,
  TRAINING_PROFILE_CONSENT_VERSION,
  validateCoachingRequest,
} from '../requestValidation'

function validRequestForm(): FormData {
  const formData = new FormData()
  formData.set('serviceId', '11111111-1111-4111-8111-111111111111')
  formData.set('message', 'Me interesa recibir acompañamiento de entrenamiento.')
  formData.set('consentAccepted', 'true')
  formData.set('consentVersion', TRAINING_PROFILE_CONSENT_VERSION)
  formData.set('idempotencyKey', '22222222-2222-4222-8222-222222222222')
  return formData
}

describe('validateCoachingRequest', () => {
  it('normalizes a request with the stable training profile consent version', () => {
    const formData = validRequestForm()
    formData.set('message', '  Quiero recibir acompañamiento.  ')

    expect(validateCoachingRequest(formData)).toEqual({
      ok: true,
      value: {
        serviceId: '11111111-1111-4111-8111-111111111111',
        message: 'Quiero recibir acompañamiento.',
        consentVersion: TRAINING_PROFILE_CONSENT_VERSION,
        idempotencyKey: '22222222-2222-4222-8222-222222222222',
      },
    })
  })

  it.each([['', true], ['m'.repeat(1000), true], ['m'.repeat(1001), false]])(
    'allows a message length of 0 through 1000 characters (%s)',
    (message, isValid) => {
      const formData = validRequestForm()
      formData.set('message', message)

      const result = validateCoachingRequest(formData)

      expect(result.ok).toBe(isValid)
    },
  )

  it('requires the training profile consent checkbox', () => {
    const formData = validRequestForm()
    formData.delete('consentAccepted')

    expect(validateCoachingRequest(formData)).toEqual({
      ok: false,
      fieldErrors: { consentAccepted: 'Debes aceptar compartir los datos de tu perfil de entrenamiento.' },
    })
  })

  it('rejects a stale or client-injected consent version', () => {
    const formData = validRequestForm()
    formData.set('consentVersion', 'training-profile-v0')

    expect(validateCoachingRequest(formData)).toEqual({
      ok: false,
      fieldErrors: { consentVersion: 'La versión del consentimiento no es válida.' },
    })
  })

  it('rejects malformed identifiers before a request reaches the RPC', () => {
    const formData = validRequestForm()
    formData.set('serviceId', 'service-from-an-attacker')
    formData.set('idempotencyKey', 'retry')

    expect(validateCoachingRequest(formData)).toEqual({
      ok: false,
      fieldErrors: {
        serviceId: 'El servicio seleccionado no es válido.',
        idempotencyKey: 'No se pudo preparar la solicitud. Inténtalo de nuevo.',
      },
    })
  })

  it('exports exact versioned consent text for the accessible form copy', () => {
    expect(TRAINING_PROFILE_CONSENT_TEXT).toContain('perfil de entrenamiento')
    expect(TRAINING_PROFILE_CONSENT_TEXT).toContain('no incluye mis medidas corporales')
  })
})
