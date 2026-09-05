import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

const { requireActiveTrainerContext } = vi.hoisted(() => ({ requireActiveTrainerContext: vi.fn() }))

vi.mock('@/lib/coaching/access', () => ({ requireActiveTrainerContext }))
vi.mock('@/components/navigation/PageTopBar', () => ({ PageTopBar: () => <header>top</header> }))
vi.mock('@/components/coaching/CoachRelationshipActions', () => ({
  CoachRelationshipActions: ({ relationshipId, status }: { relationshipId: string; status: string }) => <p>{relationshipId}:{status}</p>,
}))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))
vi.mock('@/components/i18n/I18nProvider', () => ({
  useI18n: () => ({ language: 'es', timeZone: 'America/Havana' }),
}))

function supabaseWithPausedRelationship() {
  const relationshipOrder = vi.fn(async () => ({ data: [{ id: 'paused-relationship', status: 'paused_by_platform' }], error: null }))
  const relationshipIn = vi.fn(() => ({ order: relationshipOrder }))
  const relationshipTrainerEq = vi.fn(() => ({ in: relationshipIn }))
  const relationshipSelect = vi.fn(() => ({ eq: relationshipTrainerEq }))
  const requestOrder = vi.fn(async () => ({ data: [], error: null }))
  const requestStatusEq = vi.fn(() => ({ order: requestOrder }))
  const requestTrainerEq = vi.fn(() => ({ eq: requestStatusEq }))
  const requestSelect = vi.fn(() => ({ eq: requestTrainerEq }))
  const from = vi.fn((table: string) => ({ select: table === 'coaching_relationships' ? relationshipSelect : requestSelect }))
  return { from, relationshipIn }
}

function supabaseWithPendingRequest(profile: {
  id: string
  full_name: string | null
  username: string | null
  avatar_url: string | null
} = {
  id: 'client-1',
  full_name: 'Ana Pérez',
  username: 'ana',
  avatar_url: 'https://cdn.example.test/ana.jpg',
}, profileError: unknown = null) {
  const requestOrder = vi.fn(async () => ({
    data: [{
      id: 'request-1',
      client_user_id: 'client-1',
      message: 'Quiero mejorar mi fuerza.',
      created_at: '2026-08-30T12:00:00.000Z',
      trainer_service_offerings: { name: 'Seguimiento de fuerza' },
    }],
    error: null,
  }))
  const requestStatusEq = vi.fn(() => ({ order: requestOrder }))
  const requestTrainerEq = vi.fn(() => ({ eq: requestStatusEq }))
  const requestSelect = vi.fn(() => ({ eq: requestTrainerEq }))
  const profileIn = vi.fn(async () => ({
    data: profileError ? null : [profile],
    error: profileError,
  }))
  const profileSelect = vi.fn(() => ({ in: profileIn }))
  const relationshipOrder = vi.fn(async () => ({ data: [], error: null }))
  const relationshipIn = vi.fn(() => ({ order: relationshipOrder }))
  const relationshipTrainerEq = vi.fn(() => ({ in: relationshipIn }))
  const relationshipSelect = vi.fn(() => ({ eq: relationshipTrainerEq }))
  const from = vi.fn((table: string) => ({
    select: table === 'coaching_requests'
      ? requestSelect
      : table === 'public_profiles'
        ? profileSelect
        : relationshipSelect,
  }))
  return { from }
}

describe('CoachRequestsPage', () => {
  it('queries and renders platform-paused relationships for trainer-only ending', async () => {
    const supabase = supabaseWithPausedRelationship()
    requireActiveTrainerContext.mockResolvedValue({ supabase, user: { id: 'trainer-1' } })
    const { default: CoachRequestsPage } = await import('../page')

    const html = renderToStaticMarkup(await CoachRequestsPage())

    expect(supabase.relationshipIn).toHaveBeenCalledWith('status', ['active', 'paused_by_platform'])
    expect(html).toContain('paused-relationship:paused_by_platform')
    expect(html).toMatch(/Acompa.+amientos activos o pausados/)
  })

  it('renders the requesting client identity beside the existing request details', async () => {
    const supabase = supabaseWithPendingRequest()
    requireActiveTrainerContext.mockResolvedValue({ supabase, user: { id: 'trainer-1' } })
    const { default: CoachRequestsPage } = await import('../page')

    const html = renderToStaticMarkup(await CoachRequestsPage())

    expect(html).toContain('Ana Pérez')
    expect(html).toContain('Seguimiento de fuerza')
    expect(html).toContain('Quiero mejorar mi fuerza.')
    expect(html).toContain('Aceptar')
    expect(html).toContain('Rechazar')
  })

  it('keeps the request usable with a generic identity when the client profile is incomplete', async () => {
    const supabase = supabaseWithPendingRequest({
      id: 'client-1',
      full_name: null,
      username: null,
      avatar_url: null,
    })
    requireActiveTrainerContext.mockResolvedValue({ supabase, user: { id: 'trainer-1' } })
    const { default: CoachRequestsPage } = await import('../page')

    const html = renderToStaticMarkup(await CoachRequestsPage())

    expect(html).toContain('>Usuario</h2>')
    expect(html).toContain('>U</span>')
    expect(html).toContain('Seguimiento de fuerza')
    expect(html).toContain('Aceptar')
  })

  it('does not render actionable requests when the client identity lookup fails', async () => {
    const supabase = supabaseWithPendingRequest(undefined, { message: 'profile read failed' })
    requireActiveTrainerContext.mockResolvedValue({ supabase, user: { id: 'trainer-1' } })
    const { default: CoachRequestsPage } = await import('../page')

    const html = renderToStaticMarkup(await CoachRequestsPage())

    expect(html).toContain('No se pudo cargar la identidad de las personas que enviaron estas solicitudes.')
    expect(html).not.toContain('>Aceptar</button>')
    expect(html).not.toContain('>Rechazar</button>')
    expect(html).not.toContain('>Usuario</h2>')
  })
})
