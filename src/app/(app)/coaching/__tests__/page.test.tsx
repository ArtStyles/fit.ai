import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

const { requireAppUserContext } = vi.hoisted(() => ({
  requireAppUserContext: vi.fn(),
}))

vi.mock('@/lib/auth/server', () => ({ requireAppUserContext }))
vi.mock('@/components/coaching/ClientCoachingStatus', () => ({
  ClientCoachingStatus: ({ requests, relationship }: { requests: Array<{ trainerName: string; serviceName: string }>; relationship?: { id: string; status: string; trainerName: string; serviceName: string } }) => <>{relationship ? <p>{`relationship:${relationship.status}:${relationship.trainerName}:${relationship.serviceName}`}</p> : null}<p>{requests.length ? requests.map(request => `${request.trainerName}:${request.serviceName}`).join(',') : !relationship ? 'No tienes solicitudes de acompañamiento.' : ''}</p></>,
}))
vi.mock('@/components/coaching/ConsentManager', () => ({
  ConsentManager: ({ relationshipId, consents }: { relationshipId: string; consents: unknown[] }) => <><p>consents:{relationshipId}</p><p>consent-count:{consents.length}</p></>,
}))
vi.mock('@/components/coaching/ProposedProgramReview', () => ({
  ProposedProgramReview: ({ proposal }: { proposal: { trainerName: string; snapshot: { name: string }; canAccept: boolean; exerciseDetailsAvailable: boolean } }) => <section><h2>{proposal.snapshot.name}</h2><p>{`proposal-trainer:${proposal.trainerName}`}</p><p>{`proposal-can-accept:${proposal.canAccept}`}</p><p>{`proposal-exercise-details:${proposal.exerciseDetailsAvailable}`}</p>{proposal.canAccept ? <button type="button">Aceptar rutina</button> : null}<button type="button">No aceptar rutina</button></section>,
}))

function requestQuery(
  result: { data: unknown; error: unknown },
  relationships = [] as Array<{ id: string; status: 'active' | 'paused_by_platform'; trainer_user_id: string; service_id: string; started_at: string; source_request_id: string | null }>,
  profiles = [] as Array<{ id: string; username: string | null; full_name: string | null; avatar_url: string | null }>,
  directory = [] as Array<{ user_id: string; slug: string }>,
  options: {
    errors?: { relationship?: unknown; profiles?: unknown; directory?: unknown }
    services?: Record<string, { data: unknown; error: unknown }>
    proposals?: { data: unknown; error: unknown }
    exercises?: { data: unknown; error: unknown }
    exerciseException?: unknown
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
  const proposalResult = Promise.resolve(options.proposals ?? { data: [], error: null })
  const proposalQuery: any = {}
  const proposalEq = vi.fn(() => proposalQuery)
  const proposalOrder = vi.fn(() => proposalQuery)
  proposalQuery.eq = proposalEq
  proposalQuery.order = proposalOrder
  proposalQuery.then = (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) => proposalResult.then(resolve, reject)
  const proposalSelect = vi.fn(() => proposalQuery)
  const exercisePublicEq = vi.fn(async () => {
    if (options.exerciseException) throw options.exerciseException
    return options.exercises ?? { data: [], error: null }
  })
  const exerciseIn = vi.fn(() => ({ eq: exercisePublicEq }))
  const exerciseSelect = vi.fn(() => ({ in: exerciseIn }))
  const emptyQuery: any = {
    select: vi.fn(() => emptyQuery),
    eq: vi.fn(() => emptyQuery),
    in: vi.fn(() => emptyQuery),
    order: vi.fn(() => emptyQuery),
    maybeSingle: vi.fn(async () => ({ data: null, error: null })),
    then: (resolve: (value: unknown) => unknown) => resolve({ data: [], error: null }),
  }
  const from = vi.fn((table: string) => ({ select: table === 'coaching_relationships' ? relationshipSelect : table === 'coaching_requests' ? requestSelect : table === 'public_profiles' ? profileSelect : table === 'active_trainer_directory' ? directorySelect : table === 'trainer_plan_assignments' ? proposalSelect : table === 'exercises' ? exerciseSelect : emptyQuery.select }))
  const rpc = vi.fn(async (_name: string, args: { trainer_slug: string }) => options.services?.[args.trainer_slug] ?? { data: [], error: null })
  return { from, rpc, order, requestLimit, requestSelect, relationshipSelect, profileIn, directoryIn, proposalEq, proposalOrder }
}

function proposedAssignmentFixture(relationshipId: string) {
  return [{
    id: '77777777-7777-4777-8777-777777777777',
    relationship_id: relationshipId,
    trainer_user_id: 'trainer-active',
    status: 'proposed',
    created_at: '2026-09-04T12:00:00.000Z',
    trainer_assignment_versions: [{
      id: '88888888-8888-4888-8888-888888888888',
      version_number: 1,
      status: 'proposed',
      change_summary: 'Revisa esta propuesta.',
      snapshot: {
        schemaVersion: 1,
        name: 'Rutina con detalle pendiente',
        goal: 'Fuerza',
        description: null,
        daysPerWeek: 1,
        workouts: [{
          sourceTemplateWorkoutId: '99999999-9999-4999-8999-999999999999',
          name: 'Día uno',
          dayOfWeek: 1,
          orderInPlan: 1,
          exercises: [{
            sourceTemplateExerciseId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
            exerciseId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
            orderIndex: 1,
            sets: 3,
            reps: 8,
            weightKg: null,
            targetRpe: 7,
            restSeconds: 60,
            notes: null,
          }],
        }],
      },
    }],
  }]
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

  it('keeps the recovery manager visible for an active relationship with no training grant', async () => {
    const supabase = requestQuery(
      { data: [], error: null },
      [{ id: 'relationship-missing-consent', status: 'active', trainer_user_id: 'trainer-1', service_id: 'service-1', started_at: '2026-09-06T12:00:00.000Z', source_request_id: null }],
    )
    requireAppUserContext.mockResolvedValue({ user: { id: 'client-1' }, supabase })
    const { default: CoachingPage } = await import('../page')

    const html = renderToStaticMarkup(await CoachingPage())

    expect(html).toContain('consents:relationship-missing-consent')
    expect(html).toContain('consent-count:0')
  })

  it('uses grouped public projections to pass named trainer and service entries to the client hub', async () => {
    const trainerName = 'Marina P\u00e9rez'
    const supabase = requestQuery(
      { data: [
        { id: 'old-accepted', status: 'accepted', created_at: '2026-08-01T12:00:00.000Z', trainer_user_id: 'trainer-old', service_id: 'service-old' },
        { id: 'current-request', status: 'accepted', created_at: '2026-08-02T12:00:00.000Z', trainer_user_id: 'trainer-current', service_id: 'service-current' },
      ], error: null },
      [{ id: 'relationship-current', status: 'active', trainer_user_id: 'trainer-current', service_id: 'service-current', started_at: '2026-08-02T12:00:00.000Z', source_request_id: 'current-request' }],
      [
        { id: 'trainer-old', username: 'luis', full_name: 'Luis Sosa', avatar_url: null },
        { id: 'trainer-current', username: 'marina', full_name: trainerName, avatar_url: 'https://example.test/marina.jpg' },
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
    expect(html).toContain(`relationship:active:${trainerName}:Fuerza guiada`)
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

  it('renders an ended relationship proposal from the authenticated client scope without exposing relationship controls', async () => {
    const supabase = requestQuery(
      { data: [], error: null },
      [],
      [{ id: 'trainer-ended', username: 'ines', full_name: 'Inés Torres', avatar_url: null }],
      [],
      {
        proposals: {
          data: [{
            id: '11111111-1111-4111-8111-111111111111',
            relationship_id: 'ended-relationship',
            trainer_user_id: 'trainer-ended',
            status: 'proposed',
            created_at: '2026-09-04T12:00:00.000Z',
            trainer_assignment_versions: [{
              id: '22222222-2222-4222-8222-222222222222',
              version_number: 1,
              status: 'proposed',
              change_summary: 'Propuesta pendiente al cerrar la relación',
              snapshot: {
                schemaVersion: 1,
                name: 'Rutina pendiente',
                goal: 'Fuerza',
                description: 'Revisión segura',
                daysPerWeek: 1,
                workouts: [{
                  sourceTemplateWorkoutId: '33333333-3333-4333-8333-333333333333',
                  name: 'Día uno',
                  dayOfWeek: 1,
                  orderInPlan: 1,
                  exercises: [{
                    sourceTemplateExerciseId: '44444444-4444-4444-8444-444444444444',
                    exerciseId: '55555555-5555-4555-8555-555555555555',
                    orderIndex: 1,
                    sets: 3,
                    reps: 8,
                    weightKg: null,
                    targetRpe: 7,
                    restSeconds: 60,
                    notes: null,
                  }],
                }],
              },
            }],
          }],
          error: null,
        },
        exercises: { data: [{ id: '55555555-5555-4555-8555-555555555555', name: 'Sentadilla' }], error: null },
      },
    )
    requireAppUserContext.mockResolvedValue({ user: { id: 'client-1' }, supabase })
    const { default: CoachingPage } = await import('../page')

    const html = renderToStaticMarkup(await CoachingPage())

    expect(supabase.proposalEq).toHaveBeenCalledWith('client_user_id', 'client-1')
    expect(supabase.proposalEq).toHaveBeenCalledWith('status', 'proposed')
    expect(supabase.proposalOrder.mock.calls).toEqual([
      ['created_at', { ascending: false }],
      ['id', { ascending: false }],
    ])
    expect(supabase.profileIn).toHaveBeenCalledWith('id', ['trainer-ended'])
    expect(html).toContain('Rutina pendiente')
    expect(html).toContain('proposal-trainer:Inés Torres')
    expect(html).toContain('proposal-can-accept:false')
    expect(html).not.toContain('>Aceptar rutina<')
    expect(html).toContain('No aceptar rutina')
    expect(html).not.toContain('relationship:')
    expect(html).not.toContain('consents:')
  })

  it('allows accepting only when the proposal belongs to the active relationship', async () => {
    const relationshipId = '66666666-6666-4666-8666-666666666666'
    const supabase = requestQuery(
      { data: [], error: null },
      [{ id: relationshipId, status: 'active', trainer_user_id: 'trainer-active', service_id: 'service-active', started_at: '2026-09-04T12:00:00.000Z', source_request_id: null }],
      [{ id: 'trainer-active', username: 'ines', full_name: 'Inés Torres', avatar_url: null }],
      [],
      {
        proposals: {
          data: [{
            id: '77777777-7777-4777-8777-777777777777',
            relationship_id: relationshipId,
            trainer_user_id: 'trainer-active',
            status: 'proposed',
            created_at: '2026-09-04T12:00:00.000Z',
            trainer_assignment_versions: [{
              id: '88888888-8888-4888-8888-888888888888',
              version_number: 1,
              status: 'proposed',
              change_summary: null,
              snapshot: {
                schemaVersion: 1,
                name: 'Rutina activa pendiente',
                goal: 'Fuerza',
                description: null,
                daysPerWeek: 1,
                workouts: [{
                  sourceTemplateWorkoutId: '99999999-9999-4999-8999-999999999999',
                  name: 'Día uno',
                  dayOfWeek: 1,
                  orderInPlan: 1,
                  exercises: [{
                    sourceTemplateExerciseId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
                    exerciseId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
                    orderIndex: 1,
                    sets: 3,
                    reps: 8,
                    weightKg: null,
                    targetRpe: 7,
                    restSeconds: 60,
                    notes: null,
                  }],
                }],
              },
            }],
          }],
          error: null,
        },
        exercises: { data: [{ id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', name: 'Sentadilla' }], error: null },
      },
    )
    requireAppUserContext.mockResolvedValue({ user: { id: 'client-1' }, supabase })
    const { default: CoachingPage } = await import('../page')

    const html = renderToStaticMarkup(await CoachingPage())

    expect(html).toContain('proposal-can-accept:true')
    expect(html).toContain('>Aceptar rutina<')
    expect(html).toContain('>No aceptar rutina<')
  })

  it.each([
    ['returns an error', { exercises: { data: null, error: { message: 'exercise read failed' } } }],
    ['throws', { exerciseException: new Error('exercise read failed') }],
  ])('keeps the proposal rejectable but not acceptable when the exercise lookup %s', async (_case, exerciseOptions) => {
    const relationshipId = '66666666-6666-4666-8666-666666666666'
    const supabase = requestQuery(
      { data: [], error: null },
      [{ id: relationshipId, status: 'active', trainer_user_id: 'trainer-active', service_id: 'service-active', started_at: '2026-09-04T12:00:00.000Z', source_request_id: null }],
      [{ id: 'trainer-active', username: 'ines', full_name: 'Inés Torres', avatar_url: null }],
      [],
      {
        proposals: { data: proposedAssignmentFixture(relationshipId), error: null },
        ...exerciseOptions,
      },
    )
    requireAppUserContext.mockResolvedValue({ user: { id: 'client-1' }, supabase })
    const { default: CoachingPage } = await import('../page')

    const html = renderToStaticMarkup(await CoachingPage())

    expect(html).toContain('Rutina con detalle pendiente')
    expect(html).toContain('proposal-exercise-details:false')
    expect(html).toContain('proposal-can-accept:false')
    expect(html).not.toContain('>Aceptar rutina<')
    expect(html).toContain('>No aceptar rutina<')
  })
})
