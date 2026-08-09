import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { CoachClientList } from '../CoachClientList'

const clients = [{
  clientId: 'client-a',
  fullName: 'Ada Cliente',
  avatarUrl: null,
  timeZone: 'Asia/Tokyo',
  status: 'active' as const,
  lastProfessionalEvidenceAt: '2026-08-10T01:30:00.000Z',
  adherence: { prescribed: 3, completed: 2, missed: 1, pending: 0, adherencePercent: 67 },
  alerts: [{ code: 'low_adherence' as const, message: 'La adherencia reciente está por debajo del 50%.' }],
}]

describe('CoachClientList', () => {
  it('renders a non-clinical active-client card that navigates only by client id', () => {
    const html = renderToStaticMarkup(<CoachClientList clients={clients} />)

    expect(html).toContain('Ada Cliente')
    expect(html).toContain('2 de 3 sesiones prescritas')
    expect(html).toContain('Última evidencia profesional:')
    expect(html).not.toContain('Última sesión prescrita')
    expect(html).toContain('Atención operativa')
    expect(html).toContain('10 ago 2026')
    expect(html).toContain('aria-label="Filtrar alertas"')
    expect(html).toContain('Todos (1)')
    expect(html).toContain('Con atenci')
    expect(html).toContain('href="/coach/clients/client-a"')
    expect(html).not.toMatch(/diagnóstico|lesión|tratamiento|médic|email|teléfono|nota|medida/i)
  })

  it('renders the real empty state when no active consented client is available', () => {
    const html = renderToStaticMarkup(<CoachClientList clients={[]} />)

    expect(html).toContain('Todavía no tienes clientes activos')
    expect(html).not.toContain('/coach/clients/')
  })
})
