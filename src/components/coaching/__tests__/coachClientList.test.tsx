import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { CoachClientList } from '../CoachClientList'

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))
const relationships = [{relationshipId:'rel-a',clientId:'client-a',clientName:'Ada Cliente',username:null,avatarUrl:null,serviceName:'Fuerza guiada',status:'active' as const,startedAt:'2026-08-01T00:00:00Z',trainingConsentActive:true,trainingAccessAvailable:true}]
const clients = [{
  relationshipId: 'rel-a',
  clientId: 'client-a',
  fullName: 'Ada Cliente',
  avatarUrl: null,
  timeZone: 'Asia/Tokyo',
  status: 'active' as const,
  lastProfessionalEvidenceAt: '2026-08-10T02:30:00.000Z',
  adherence: { prescribed: 3, completed: 2, missed: 1, pending: 0, adherencePercent: 67 },
  alerts: [{ code: 'low_adherence' as const, message: 'La adherencia reciente está por debajo del 50%.' }],
}]

describe('CoachClientList', () => {
  it.each([
    { clientName: 'Ada Cliente', username: null, initials: 'AC' },
    { clientName: '  María   Alejandra de los Ángeles  ', username: 'maria', initials: 'MA' },
    { clientName: null, username: 'ada.fuerza', initials: 'A' },
  ])('uses decorative initials for available identity $clientName / $username without a photo', ({ clientName, username, initials }) => {
    const html = renderToStaticMarkup(<CoachClientList relationships={[{ ...relationships[0], clientName, username }]} clients={[]} viewerTimeZone="America/Havana" />)
    expect(html).toMatch(new RegExp(`<span[^>]*aria-hidden="true"[^>]*>${initials}</span>`))
    expect(html).not.toContain('lucide-users-round')
    if (clientName) expect(html).toContain(clientName)
    if (username) expect(html).toContain(`@${username}`)
  })

  it('retains a decorative generic avatar and disabled finalization when identity is missing', () => {
    const html = renderToStaticMarkup(<CoachClientList relationships={[{ ...relationships[0], clientName: null, username: null }]} clients={[]} viewerTimeZone="America/Havana" />)
    expect(html).toMatch(/<svg[^>]*lucide-users-round[^>]*aria-hidden="true"/)
    expect(html).toContain('Identidad no disponible')
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Finalizar acompañamiento<\/button>/)
  })

  it('keeps an available photo decorative instead of substituting initials', () => {
    const html = renderToStaticMarkup(<CoachClientList relationships={[{ ...relationships[0], avatarUrl: '/ada.jpg' }]} clients={[]} viewerTimeZone="America/Havana" />)
    expect(html).toContain('<img src="/ada.jpg" alt=""')
    expect(html).not.toContain('>AC</span>')
  })

  it('renders a non-clinical active-client card that navigates only by client id', () => {
    const html = renderToStaticMarkup(<CoachClientList relationships={relationships} clients={clients} viewerTimeZone="America/Havana" />)

    expect(html).toContain('Ada Cliente')
    expect(html).toContain('2 de 3 sesiones prescritas')
    expect(html).toContain('Última evidencia profesional:')
    expect(html).not.toContain('Última sesión prescrita')
    expect(html).toContain('Atención operativa')
    expect(html).toContain('9 ago 2026')
    expect(html).toContain('aria-label="Filtrar alertas"')
    expect(html).toContain('Todos (1)')
    expect(html).toContain('Con atenci')
    expect(html).toContain('href="/coach/clients/client-a"')
    expect(html).not.toMatch(/diagnóstico|lesión|tratamiento|médic|email|teléfono|nota|medida/i)
  })

  it('renders the real empty state when no current relationship is available', () => {
    const html = renderToStaticMarkup(<CoachClientList relationships={[]} clients={[]} viewerTimeZone="America/Havana" />)

    expect(html).toContain('Todavía no tienes clientes')
    expect(html).not.toContain('/coach/clients/')
  })
})

it('keeps management without evidence and rejects another lifecycle of the same client', () => {
  const html=renderToStaticMarkup(<CoachClientList relationships={relationships} clients={[{...clients[0], relationshipId:'older-rel'}]} viewerTimeZone="America/Havana" />)
  expect(html).toContain('Ada Cliente')
  expect(html).toContain('No se pudo cargar el seguimiento')
  expect(html).not.toContain('sesiones prescritas')
})
it('never exposes protected links/evidence for revoked or paused rows', () => {
  const html=renderToStaticMarkup(<CoachClientList relationships={[{...relationships[0],trainingAccessAvailable:false,trainingConsentActive:false}]} clients={clients} viewerTimeZone="America/Havana" />)
  expect(html).toContain('Sin autorización para ver el progreso')
  expect(html).not.toContain('href="/coach/clients/client-a"')
  expect(html).not.toContain('href="/coach/programs?clientId=client-a"')
  expect(html).not.toContain('sesiones prescritas')
})
