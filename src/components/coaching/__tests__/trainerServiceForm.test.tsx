import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { vi } from 'vitest'

vi.mock('@/app/actions/trainerServices', () => ({
  createTrainerService: vi.fn(),
  updateTrainerService: vi.fn(),
  setTrainerServiceActive: vi.fn(),
}))

import { TrainerServiceForm, persistTrainerServiceChanges } from '../TrainerServiceForm'

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
})
