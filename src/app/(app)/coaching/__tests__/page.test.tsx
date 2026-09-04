import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

const { requireAppUserContext } = vi.hoisted(() => ({
  requireAppUserContext: vi.fn(),
}))

vi.mock('@/lib/auth/server', () => ({ requireAppUserContext }))
vi.mock('@/components/coaching/ClientCoachingStatus', () => ({
  ClientCoachingStatus: ({ requests, relationship }: { requests: Array<{ trainerName: string; serviceName: string }>; relationship?: { id: string; status: string; trainerName: string; serviceName: string } }) => <>{relationship ? <p>{`relationship:${relationship.status}:${relationship.trainerName}:${relationship.serviceName}`}</p> : null}<p>{requests.length ? requests.map(request => `${request.trainerName}:${request.serviceName}`).join(',') : !relationship ? 'No tienes solicitudes de acompañamiento.' : ''}</p></>,
}))
vi.mock('@/components/coaching/ConsentManager', () => ({ ConsentManager: ({ relationshipId }: { relationshipId: string }) => <p>consents:{relationshipId}</p> }))

function requestQuery(
  result: { data: unknown; error: unknown },
  relationships = [] as Array<{ id: string; status: 'active' | 'paused_by_platform'; trainer_user_id: string; service_id: string; started_at: string; source_request_id: string | null }>,
  profiles = [] as Array<{ id: string; username: string | null; full_name: string | null; avatar_url: string | null }>,
  directory = [] as Array<{ user_id: string; slug: string }>,
  options: {
    errors?: { relationship?: unknown; profiles?: unknown; directory?: unknown }
    services?: Record<string, { data: unknown; error: unknown }>
  } = {},
) {
  const requestLimit = vi.fn(async () => result)
  const requestOrder = {
    limit: requestLimit,
    then: (resolve: (value: unknown) => unknown) => resolve(result),
  }
  const order = vi.fn(() => requestOrder)
  const requestEq = vi.fn(() => ({ order }))
  const requestSelect = vi.fn(() => ({ eq: requestEq }))
  const relationshipResult = Promise.resolve({ data: relationships, error: options.errors?.relationship ?? null })
  const relationshipOrder = vi.fn(() => relationshipResult)
  const relationshipStatusIn = vi.fn(() => ({ order: relationshipOrder }))
  const relationshipClientEq = vi.fn(() => ({ in: relationshipStatusIn }))
  const relationshipSelect = vi.fn(() => ({ eq: relationshipClientEq }))
  const profileIn = vi.fn(async () => ({ data: profiles, error: options.errors?.profiles ?? null }))
  const profileSelect = vi.fn(() => ({ in: profileIn }))
  const directoryIn = vi.fn(async () => ({ data: directory, error: options.errors?.directory ?? null }))
  const directorySelect = vi.fn(() => ({ in: directoryIn }))
  const emptyQuery: any = {
    select: vi.fn(() => emptyQuery),
    eq: vi.fn(() => emptyQuery),
    in: vi.fn(() => emptyQuery),
    order: vi.fn(() => emptyQuery),
    maybeSingle: vi.fn(async () => ({ data: null, error: null })),
    then: (resolve: (value: unknown) => unknown) => resolve({ data: [], error: null }),
  }
  const from = vi.fn((table: string) => ({ select: table === 'coaching_relationships' ? relationshipSelect : table === 'coaching_requests' ? requestSelect : table === 'public_profiles' ? profileSelect : table === 'active_trainer_directory' ? directorySelect : emptyQuery.select }))
  const rpc = vi.fn(async (_name: string, args: { trainer_slug: string }) => options.services?.[args.trainer_slug] ?? { data: [], error: null })
  return { from, rpc, order, requestLimit, requestSelect, relationshipSelect, profileIn, directoryIn }
}

describe('CoachingPage', () => {
  it('renders an accessible unavailable state when the real request query fails', async () => {
    const supabase = requestQuery({ data: null, error: { message: 'read failed' } })
    requireAppUserContext.mockResolvedValue({ user: { id: 'client-1' }, supabase })
    const { default: CoachingPage } = await import('../page')

    const html = renderToStaticMarkup(await CoachingPage())

    expect(html).toContain('No se pudo cargar el estado de tus solicitudes.')
    expect(html).not.toContain('No tienes solicitudes de acompañamiento.')
  })

  it('renders the true empty state only after a successful empty query', async () => {
    const supabase = requestQuery({ data: [], error: null })
    requireAppUserContext.mockResolvedValue({ user: { id: 'client-1' }, supabase })
    const { default: CoachingPage } = await import('../page')

    expect(renderToStaticMarkup(await CoachingPage())).toContain('No tienes solicitudes de acompañamiento.')
  })

  it('renders a relationship-specific unavailable state instead of treating a relationship query failure as no trainer', async () => {
    const supabase = requestQuery({ data: [], error: null }, [], [], [], { errors: { relationship: { message: 'read failed' } } })
    requireAppUserContext.mockResolvedValue({ user: { id: 'client-1' }, supabase })
    const { default: CoachingPage } = await import('../page')

    const html = renderToStaticMarkup(await CoachingPage())

    expect(html).toContain('No se pudo cargar tu acompañamiento.')
    expect(html).not.toContain('No tienes solicitudes de acompañamiento.')
    expect(html).not.toContain('No se pudieron cargar tus consentimientos.')
  })

  it('renders a public projection warning instead of disguising an identity lookup failure as unavailable data', async () => {
    const supabase = requestQuery(
      { data: [{ id: 'request-1', status: 'pending', created_at: '2026-08-01T12:00:00.000Z', trainer_user_id: 'trainer-1', service_id: 'service-1' }], error: null },
      [],
      [],
      [],
      { errors: { profiles: { message: 'read failed' } } },
    )
    requireAppUserContext.mockResolvedValue({ user: { id: 'client-1' }, supabase })
    const { default: CoachingPage } = await import('../page')

    const html = renderToStaticMarkup(await CoachingPage())

    expect(html).toContain('No se pudieron cargar los datos públicos de tu entrenador.')
    expect(html).not.toContain('Entrenador no disponible')
  })

  it('prioritizes an active relationship over a paused history row regardless of returned row order', async () => {
    const supabase = requestQuery(
      { data: [], error: null },
      [
        { id: 'paused-first', status: 'paused_by_platform', trainer_user_id: 'trainer-1', service_id: 'service-1', started_at: '2026-08-01T12:00:00.000Z', source_request_id: null },
        { id: 'active-second', status: 'active', trainer_user_id: 'trainer-2', service_id: 'service-2', started_at: '2026-08-02T12:00:00.000Z', source_request_id: null },
      ],
    )
    requireAppUserContext.mockResolvedValue({ user: { id: 'client-1' }, supabase })
    const { default: CoachingPage } = await import('../page')

    const html = renderToStaticMarkup(await CoachingPage())

    expect(html).toContain('relationship:active')
    expect(html).toContain('consents:active-second')
  })

  it('uses grouped public projections to pass named trainer and service entries to the client hub', async () => {
    const supabase = requestQuery(
      { data: [
        { id: 'old-accepted', status: 'accepted', created_at: '2026-08-01T12:00:00.000Z', trainer_user_id: 'trainer-old', service_id: 'service-old' },
        { id: 'current-request', status: 'accepted', created_at: '2026-08-02T12:00:00.000Z', trainer_user_id: 'trainer-current', service_id: 'service-current' },
      ], error: null },
      [{ id: 'relationship-current', status: 'active', trainer_user_id: 'trainer-current', service_id: 'service-current', started_at: '2026-08-02T12:00:00.000Z', source_request_id: 'current-request' }],
      [
        { id: 'trainer-old', username: 'luis', full_name: 'Luis Sosa', avatar_url: null },
        { id: 'trainer-current', username: 'marina', full_name: 'Marina PÃ©rez', avatar_url: 'https://example.test/marina.jpg' },
      ],
      [{ user_id: 'trainer-current', slug: 'marina-perez' }],
      {
        services: {
          'marina-perez': { data: [{ service_id: 'service-current', name: 'Fuerza guiada' }], error: null },
        },
      },
    )
    requireAppUserContext.mockResolvedValue({ user: { id: 'client-1' }, supabase })
    const { default: CoachingPage } = await import('../page')

    const html = renderToStaticMarkup(await CoachingPage())

    expect(supabase.requestSelect).toHaveBeenCalledWith('id, status, created_at, trainer_user_id, service_id')
    expect(supabase.requestLimit).toHaveBeenCalledWith(20)
    expect(supabase.relationshipSelect).toHaveBeenCalledWith('id, status, trainer_user_id, service_id, started_at, source_request_id')
    expect(supabase.profileIn).toHaveBeenCalledWith('id', ['trainer-old', 'trainer-current'])
    expect(supabase.directoryIn).toHaveBeenCalledWith('user_id', ['trainer-old', 'trainer-current'])
    expect(supabase.rpc).toHaveBeenCalledWith('get_requestable_trainer_services', { trainer_slug: 'marina-perez' })
    expect(html).toContain('relationship:active:Marina PÃ©rez:Fuerza guiada')
    expect(html).toContain('Luis Sosa:Servicio de acompañamiento no disponible')
  })

  it('keeps other hub data visible when one bounded trainer-service lookup fails', async () => {
    const supabase = requestQuery(
      { data: [{ id: 'request-1', status: 'pending', created_at: '2026-08-01T12:00:00.000Z', trainer_user_id: 'trainer-1', service_id: 'service-1' }], error: null },
      [],
      [{ id: 'trainer-1', username: 'marina', full_name: 'Marina Pérez', avatar_url: null }],
      [{ user_id: 'trainer-1', slug: 'marina-perez' }],
      { services: { 'marina-perez': { data: null, error: { message: 'read failed' } } } },
    )
    requireAppUserContext.mockResolvedValue({ user: { id: 'client-1' }, supabase })
    const { default: CoachingPage } = await import('../page')

    const html = renderToStaticMarkup(await CoachingPage())

    expect(html).toContain('Marina Pérez:No se pudo cargar el servicio.')
    expect(html).toContain('Algunos servicios de acompañamiento no se pudieron cargar.')
    expect(html).not.toContain('Servicio de acompañamiento no disponible')
    expect(supabase.rpc).toHaveBeenCalledWith('get_requestable_trainer_services', { trainer_slug: 'marina-perez' })
  })
})
