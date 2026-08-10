import { describe, expect, it } from 'vitest'
import { validateTrainerService } from '../serviceValidation'

function validServiceForm(): FormData {
  const formData = new FormData()
  formData.set('name', 'Acompañamiento de fuerza')
  formData.set('description', 'Sesiones semanales enfocadas en progreso sostenible.')
  formData.set('modality', 'online')
  formData.set('durationMinutes', '60')
  formData.set('content', 'Evaluación inicial, rutina y seguimiento.')
  formData.set('capacity', '12')
  return formData
}

describe('validateTrainerService', () => {
  it('normalizes the six permitted service fields', () => {
    const formData = validServiceForm()
    formData.set('name', '  Acompañamiento de fuerza  ')

    expect(validateTrainerService(formData)).toEqual({
      ok: true,
      value: {
        name: 'Acompañamiento de fuerza',
        description: 'Sesiones semanales enfocadas en progreso sostenible.',
        modality: 'online',
        durationMinutes: 60,
        content: 'Evaluación inicial, rutina y seguimiento.',
        capacity: 12,
      },
    })
  })

  it('rejects text, duration, capacity, and modality outside the offering limits', () => {
    const formData = validServiceForm()
    formData.set('name', '')
    formData.set('description', 'd'.repeat(4001))
    formData.set('modality', 'remote')
    formData.set('durationMinutes', '14')
    formData.set('content', 'c'.repeat(4001))
    formData.set('capacity', '1001')

    const result = validateTrainerService(formData)

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.fieldErrors).toMatchObject({
        name: expect.any(String),
        description: expect.any(String),
        modality: expect.any(String),
        durationMinutes: expect.any(String),
        content: expect.any(String),
        capacity: expect.any(String),
      })
    }
  })

  it.each(['price', 'priceMinor', 'price_minor', 'currency', 'billingInterval', 'billing_interval', 'billingMode', 'billing_mode'])(
    'rejects injected commercial field %s instead of silently ignoring it',
    field => {
      const formData = validServiceForm()
      formData.set(field, '999')

      const result = validateTrainerService(formData)

      expect(result).toEqual({
        ok: false,
        fieldErrors: { commercial: 'Los servicios no admiten precios ni facturación.' },
      })
    },
  )
})
