import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@/app/actions/coachingRequests', () => ({
  createCoachingRequest: async () => ({ ok: true, requestId: 'request-1', created: true }),
  cancelCoachingRequest: async () => ({ ok: true, requestId: 'request-1' }),
}))
import { CoachingRequestForm, performCoachingRequestSubmit } from '../CoachingRequestForm'
import { ClientCoachingStatus, performCoachingRequestCancellation } from '../ClientCoachingStatus'

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

describe('coaching request interaction failures', () => {
  it('recovers pending controls and communicates safe errors when either server action rejects', async () => {
    const requestPending = vi.fn()
    const requestErrors = vi.fn()
    const requestAnnouncement = vi.fn()
    const cancelPending = vi.fn()
    const cancelAnnouncement = vi.fn()

    await performCoachingRequestSubmit(new FormData(), async () => { throw new Error('transport failed') }, {
      setPending: requestPending,
      setFieldErrors: requestErrors,
      setAnnouncement: requestAnnouncement,
      rotateIdempotencyKey: vi.fn(),
    })
    await performCoachingRequestCancellation('request-1', async () => { throw new Error('transport failed') }, {
      setCancellingId: cancelPending,
      setMessage: cancelAnnouncement,
    })

    expect(requestPending.mock.calls.map(([value]) => value)).toEqual([true, false])
    expect(requestErrors).toHaveBeenCalledWith({})
    expect(requestAnnouncement).toHaveBeenCalledWith('No se pudo enviar la solicitud.')
    expect(cancelPending.mock.calls.map(([value]) => value)).toEqual(['request-1', null])
    expect(cancelAnnouncement).toHaveBeenCalledWith('No se pudo cancelar la solicitud.')
  })
})
