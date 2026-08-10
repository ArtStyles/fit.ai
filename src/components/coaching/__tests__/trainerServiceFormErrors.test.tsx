import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

vi.mock('react', async importOriginal => {
  const actual = await importOriginal<typeof import('react')>()
  return {
    ...actual,
    useState: <T,>(initial: T) => [
      typeof initial === 'object' && initial !== null && !Array.isArray(initial)
        ? {
            name: 'Nombre no válido.',
            description: 'Descripción no válida.',
            modality: 'Modalidad no válida.',
            durationMinutes: 'Duración no válida.',
            capacity: 'Cupo no válido.',
            content: 'Contenido no válido.',
          } as T
        : initial,
      vi.fn(),
    ] as const,
  }
})

vi.mock('@/app/actions/trainerServices', () => ({
  createTrainerService: vi.fn(),
  updateTrainerService: vi.fn(),
  setTrainerServiceActive: vi.fn(),
}))

import { TrainerServiceForm, type TrainerServiceFormValue } from '../TrainerServiceForm'

const SERVICE = {
  name: 'Acompañamiento',
  description: 'Sesiones semanales.',
  modality: 'online' as const,
  durationMinutes: 60,
  content: 'Rutina y seguimiento.',
  capacity: 12,
  isActive: true,
} satisfies Omit<TrainerServiceFormValue, 'id'>

function attribute(tag: string, name: string): string | null {
  return new RegExp(`\\b${name}="([^"]*)"`).exec(tag)?.[1] ?? null
}

describe('TrainerServiceForm error accessibility', () => {
  it('uses unique instance ids and exact error references for new and colliding service forms', () => {
    const tree = (
      <>
        <TrainerServiceForm />
        <TrainerServiceForm />
        <TrainerServiceForm initialService={{ ...SERVICE, id: 'service:one' }} />
        <TrainerServiceForm initialService={{ ...SERVICE, id: 'service/one' }} />
      </>
    )
    const html = renderToStaticMarkup(tree)
    const secondHtml = renderToStaticMarkup(tree)
    const controls = Array.from(html.matchAll(/<(?:input|textarea|select)\b[^>]*>/g))
      .map(match => match[0])
      .filter(tag => (attribute(tag, 'id') ?? '').startsWith('service-'))
    const errorIds = Array.from(html.matchAll(/<p\b[^>]*role="alert"[^>]*>/g))
      .map(match => attribute(match[0], 'id'))
      .filter((id): id is string => Boolean(id))

    expect(html).toBe(secondHtml)
    expect(controls).toHaveLength(24)
    expect(new Set(controls.map(tag => attribute(tag, 'id'))).size).toBe(24)
    expect(errorIds).toHaveLength(24)
    expect(new Set(errorIds).size).toBe(24)
    const describedByValues = controls.map(tag => attribute(tag, 'aria-describedby'))
    expect(new Set(describedByValues).size).toBe(24)
    for (const control of controls) {
      const controlId = attribute(control, 'id')
      const describedBy = attribute(control, 'aria-describedby')
      expect(describedBy).toBe(`${controlId}-error`)
      expect(errorIds.filter(errorId => errorId === describedBy)).toHaveLength(1)
    }
  })
})
