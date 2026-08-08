import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@/app/actions/coachingRequests', () => ({
  createCoachingRequest: async () => ({ ok: true, requestId: 'request-1', created: true }),
  cancelCoachingRequest: async () => ({ ok: true, requestId: 'request-1' }),
}))
import { CoachingRequestForm } from '../CoachingRequestForm'
import { ClientCoachingStatus } from '../ClientCoachingStatus'

describe('coaching request UI', () => {
  it('renders an accessible versioned consent request form without contact or chat fields', () => {
    const html = renderToStaticMarkup(
      <CoachingRequestForm service={{ id: 'service-1', name: 'Acompañamiento de fuerza' }} />,
    )

    expect(html).toContain('Solicitar acompañamiento')
    expect(html).toContain('perfil de entrenamiento')
    expect(html).toContain('consentVersion')
    expect(html).toContain('aria-describedby="training-profile-consent-description"')
    expect(html).not.toMatch(/teléfono|correo|chat|whatsapp/i)
  })

  it('shows real request states and exposes cancellation only for pending requests', () => {
    const html = renderToStaticMarkup(
      <ClientCoachingStatus requests={[
        { id: 'request-1', status: 'pending', createdAt: '2026-08-08T12:00:00.000Z' },
        { id: 'request-2', status: 'declined', createdAt: '2026-08-07T12:00:00.000Z' },
      ]} />,
    )

    expect(html).toContain('Pendiente')
    expect(html).toContain('No aceptada')
    expect(html.match(/Cancelar solicitud/g)).toHaveLength(1)
  })
})
