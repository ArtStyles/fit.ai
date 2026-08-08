import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@/app/actions/trainerServices', () => ({
  createTrainerService: vi.fn(),
  updateTrainerService: vi.fn(),
  setTrainerServiceActive: vi.fn(),
}))

import {
  TrainerServiceForm,
  persistTrainerServiceChanges,
  trainerServiceFieldAccessibility,
} from '../TrainerServiceForm'

const SERVICE = {
  id: 'service-1',
  name: 'Acompañamiento de fuerza',
  description: 'Sesiones semanales enfocadas en progreso sostenible.',
  modality: 'online' as const,
  durationMinutes: 60,
  content: 'Evaluación inicial, rutina y seguimiento.',
  capacity: 12,
  isActive: true,
}

describe('TrainerServiceForm', () => {
  it('renders only the six service details and no commercial control', () => {
    const html = renderToStaticMarkup(<TrainerServiceForm initialService={SERVICE} />)

    for (const label of ['Nombre del servicio', 'Descripción', 'Modalidad', 'Duración', 'Contenido incluido', 'Cupo']) {
      expect(html).toContain(label)
    }
    expect(html).toContain('Desactivar servicio')
    expect(html).not.toMatch(/precio|tarifa|moneda|factur/i)
    expect(html).not.toMatch(/name="(?:price|currency|billing)/i)
  })

  it('preserves the returned service identity after an edit', async () => {
    const result = await persistTrainerServiceChanges(new FormData(), async () => ({
      ok: true,
      serviceId: 'service-1',
    }))

    expect(result).toEqual({
      ok: true,
      serviceId: 'service-1',
      announcement: 'Servicio guardado.',
    })
  })

  it('keeps server field errors and announces a rejected form submission', async () => {
    const result = await persistTrainerServiceChanges(new FormData(), async () => ({
      ok: false as const,
      error: 'Revisa los campos del servicio.',
      fieldErrors: { capacity: 'El cupo debe estar entre 1 y 1000 personas.' },
    }))

    expect(result).toEqual({
      ok: false,
      error: 'Revisa los campos del servicio.',
      fieldErrors: { capacity: 'El cupo debe estar entre 1 y 1000 personas.' },
      announcement: 'Revisa los campos del servicio.',
    })
  })
})

describe('TrainerServiceForm accessibility', () => {
  it('assigns unique input and error associations to errors in multiple service forms', () => {
    const first = trainerServiceFieldAccessibility('service:one', 'name', true)
    const second = trainerServiceFieldAccessibility('service/two', 'name', true)

    expect(first).toEqual({
      inputId: 'service-service-one-name',
      errorId: 'service-service-one-name-error',
      describedBy: 'service-service-one-name-error',
    })
    expect(second).toEqual({
      inputId: 'service-service-two-name',
      errorId: 'service-service-two-name-error',
      describedBy: 'service-service-two-name-error',
    })
    expect(first.describedBy).not.toBe(second.describedBy)
  })

  it('keeps the service state status and toggle action in the rendered form', () => {
    const html = renderToStaticMarkup(<TrainerServiceForm initialService={SERVICE} />)

    expect(html).toContain('Activo')
    expect(html).toContain('Desactivar servicio')
  })
})
