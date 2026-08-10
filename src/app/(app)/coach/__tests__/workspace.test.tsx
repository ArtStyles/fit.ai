import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { requireActiveTrainerContext, summaryRpc } = vi.hoisted(() => {
  const summaryRpc = vi.fn().mockResolvedValue({
    data: {
      schemaVersion: 1,
      counts: { pendingRequests: 0, activeClients: 0, pausedRelationships: 0 },
      clients: [],
    },
    error: null,
  })
  return {
  requireActiveTrainerContext: vi.fn().mockResolvedValue({
    user: { id: 'trainer-user-1' },
    supabase: {
      rpc: summaryRpc,
      from: () => {
        const query: any = {
          select: () => query,
          eq: () => query,
          in: () => query,
          neq: () => query,
          order: () => query,
          then: (resolve: (value: unknown) => unknown) => resolve({ data: [], error: null }),
        }
        return query
      },
    },
    profile: { language: 'es' },
    trainerProfile: { id: 'trainer-profile-1', status: 'active' },
  }),
  summaryRpc,
  }
})

vi.mock('server-only', () => ({}))
vi.mock('@/lib/coaching/access', () => ({ requireActiveTrainerContext }))
vi.mock('@/app/actions/trainerProfile', () => ({ updateTrainerProfile: vi.fn() }))
vi.mock('next/navigation', () => ({
  usePathname: () => '/coach',
  useRouter: () => ({ refresh: vi.fn() }),
}))

describe('professional workspace routes', () => {
  beforeEach(() => vi.clearAllMocks())

  it.each([
    ['../page', 'Resumen profesional'],
    ['../clients/page', 'Todavía no tienes clientes'],
    ['../programs/page', 'Todavía no tienes rutinas'],
    ['../requests/page', 'No hay solicitudes nuevas'],
  ] as const)('guards %s and renders its real empty state', async (modulePath, expectedText) => {
    const Page = (await import(modulePath)).default

    const html = renderToStaticMarkup(await Page())

    expect(requireActiveTrainerContext).toHaveBeenCalledTimes(1)
    expect(html).toContain(expectedText)
    expect(html).not.toMatch(/cliente de ejemplo|solicitud de ejemplo|rutina de ejemplo/i)
  })

  it('guards the profile route before loading its owner-visible pending review', async () => {
    const order: string[] = []
    const pending = {
      id: 'review-1',
      status: 'submitted',
      application_kind: 'profile_update',
      professional_name: 'Ada Propuesta',
      specialties: ['Movilidad'],
      modalities: ['hybrid'],
      experience_summary: 'Experiencia propuesta pendiente de revisión.',
    }
    const from = vi.fn((table: string) => {
      order.push('query')
      const data = table === 'trainer_applications' ? pending : table === 'trainer_application_events_public' ? [] : null
      const chain: any = {
        select: vi.fn(() => chain),
        eq: vi.fn(() => chain),
        order: vi.fn(() => chain),
        limit: vi.fn(() => chain),
        maybeSingle: vi.fn(async () => ({ data, error: null })),
        then: (resolve: (value: unknown) => unknown) => resolve({ data, error: null }),
      }
      return chain
    })
    requireActiveTrainerContext.mockImplementationOnce(async () => {
      order.push('guard')
      return {
        user: { id: 'trainer-user-1' },
        profile: { language: 'es' },
        supabase: { from },
        trainerProfile: {
          id: 'trainer-profile-1',
          professional_name: 'Ada Aprobada',
          professional_photo_url: 'https://cdn.example.test/ada.jpg',
          bio: 'Entrenadora de fuerza con un enfoque progresivo, seguro y adaptado a cada persona.',
          specialties: ['Fuerza'],
          modalities: ['online'],
          experience_summary: 'Ocho anos de experiencia profesional aprobada.',
          general_location: 'La Habana',
          languages: ['Espanol'],
          status: 'active',
        },
      }
    })
    const Page = (await import('../profile/page')).default

    const html = renderToStaticMarkup(await Page())

    expect(order[0]).toBe('guard')
    expect(order.slice(1)).toEqual(['query', 'query', 'query'])
    expect(html).toContain('Ada Aprobada')
    expect(html).toContain('Ada Propuesta')
  })

  it('renders the latest profile-update public timeline and owner-safe interview without private review data', async () => {
    const review = {
      id: 'review-final-1',
      status: 'rejected',
      application_kind: 'profile_update',
      professional_name: 'Ada Propuesta',
      specialties: ['Movilidad'],
      modalities: ['online'],
      experience_summary: 'Experiencia propuesta pendiente de revisión.',
    }
    const tableRows: Record<string, unknown> = {
      trainer_applications: review,
      trainer_application_events_public: [
        {
          id: 'event-change',
          to_status: 'changes_requested',
          public_note: 'Amplía la experiencia visible.',
          created_at: '2026-08-07T14:00:00.000Z',
          internal_note: 'Nunca mostrar esta nota interna.',
        },
        {
          id: 'event-reject',
          to_status: 'rejected',
          public_note: 'La actualización no fue aprobada.',
          created_at: '2026-08-08T14:00:00.000Z',
        },
      ],
      trainer_interviews_applicant_public: {
        proposed_at: '2026-08-10T18:30:00.000Z',
        timezone: 'America/Havana',
        medium: 'video_call',
        external_url: 'https://meet.example.test/profile-review',
        status: 'scheduled',
        public_note: 'Ten disponible tu certificación.',
        internal_note: 'Nunca mostrar contexto privado.',
      },
    }
    const from = vi.fn((table: string) => {
      const chain: any = {
        select: vi.fn(() => chain),
        eq: vi.fn(() => chain),
        in: vi.fn(() => chain),
        order: vi.fn(() => chain),
        limit: vi.fn(() => chain),
        maybeSingle: vi.fn(async () => ({ data: tableRows[table] ?? null, error: null })),
        then: (resolve: (value: unknown) => unknown) => resolve({ data: tableRows[table] ?? [], error: null }),
      }
      return chain
    })
    requireActiveTrainerContext.mockResolvedValueOnce({
      user: { id: 'trainer-user-1' },
      profile: { language: 'es', timezone: 'America/Havana' },
      supabase: { from },
      trainerProfile: {
        id: 'trainer-profile-1',
        professional_name: 'Ada Aprobada',
        professional_photo_url: 'https://legacy.example.test/ada.jpg',
        bio: 'Entrenadora de fuerza con un enfoque progresivo, seguro y adaptado a cada persona.',
        specialties: ['Fuerza'],
        modalities: ['online'],
        experience_summary: 'Ocho anos de experiencia profesional aprobada.',
        general_location: 'La Habana',
        languages: ['Espanol'],
        status: 'active',
      },
    })
    const Page = (await import('../profile/page')).default

    const html = renderToStaticMarkup(await Page())

    expect(from).toHaveBeenCalledWith('trainer_application_events_public')
    expect(from).toHaveBeenCalledWith('trainer_interviews_applicant_public')
    expect(from).not.toHaveBeenCalledWith('trainer_application_events')
    expect(from).not.toHaveBeenCalledWith('trainer_interviews')
    expect(html).toContain('Amplía la experiencia visible.')
    expect(html).toContain('La actualización no fue aprobada.')
    expect(html).toContain('Ten disponible tu certificación.')
    expect(html).not.toContain('Nunca mostrar esta nota interna.')
    expect(html).not.toContain('Nunca mostrar contexto privado.')
    expect(html).not.toContain('profile-update@example.test')
  })

  it('keeps the professional summary within the coach workspace', async () => {
    const Page = (await import('../page')).default

    const html = renderToStaticMarkup(await Page())

    expect(html).not.toContain('href="/dashboard"')
  })

  it.each(['../page', '../clients/page'] as const)('loads %s from exactly one summary RPC', async modulePath => {
    const Page = (await import(modulePath)).default

    await Page()

    expect(summaryRpc).toHaveBeenCalledTimes(1)
    expect(summaryRpc).toHaveBeenCalledWith('get_coach_clients_summary')
  })
})
