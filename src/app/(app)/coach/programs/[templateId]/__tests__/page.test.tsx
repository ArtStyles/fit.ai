import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

let editorProps: Record<string, unknown> | null = null

const { notFound, requireActiveTrainerContext } = vi.hoisted(() => ({
  notFound: vi.fn(() => { throw new Error('NOT_FOUND') }),
  requireActiveTrainerContext: vi.fn(),
}))

vi.mock('next/navigation', () => ({ notFound }))
vi.mock('@/lib/coaching/access', () => ({ requireActiveTrainerContext }))
vi.mock('@/components/navigation/PageTopBar', () => ({ PageTopBar: () => null }))
vi.mock('@/components/coaching/ProgramTemplateEditor', () => ({
  ProgramTemplateEditor: (props: Record<string, unknown>) => {
    editorProps = props
    return null
  },
}))

function query(data: unknown, error: unknown = null) {
  const result = { data, error }
  const chain: Record<string, unknown> = {}
  for (const method of ['select', 'eq', 'neq', 'order', 'limit', 'in']) chain[method] = vi.fn(() => chain)
  chain.maybeSingle = vi.fn(async () => result)
  chain.then = (resolve: (value: unknown) => unknown) => Promise.resolve(result).then(resolve)
  return chain
}

function supabaseForChoices() {
  const calls: Array<{ table: string; method: string; args: unknown[] }> = []
  const relationshipIds = {
    ready: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    proposed: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    activeOther: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
    activeCurrent: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
  }
  const clientIds = {
    ready: '11111111-1111-4111-8111-111111111111',
    proposed: '22222222-2222-4222-8222-222222222222',
    activeOther: '33333333-3333-4333-8333-333333333333',
    activeCurrent: '44444444-4444-4444-8444-444444444444',
  }
  return {
    calls,
    relationshipIds,
    clientIds,
    from: vi.fn((table: string) => {
      const data = table === 'trainer_program_templates'
        ? { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'Fuerza', goal: null, description: null, days_per_week: 3, status: 'active' }
        : table === 'coaching_relationships'
          ? [
              { id: relationshipIds.ready, client_user_id: clientIds.ready, started_at: '2026-08-01T00:00:00.000Z', trainer_service_offerings: { name: 'Fuerza' } },
              { id: relationshipIds.proposed, client_user_id: clientIds.proposed, started_at: '2026-08-02T00:00:00.000Z', trainer_service_offerings: { name: 'Movilidad' } },
              { id: relationshipIds.activeOther, client_user_id: clientIds.activeOther, started_at: '2026-08-03T00:00:00.000Z', trainer_service_offerings: { name: 'Resistencia' } },
              { id: relationshipIds.activeCurrent, client_user_id: clientIds.activeCurrent, started_at: '2026-08-04T00:00:00.000Z', trainer_service_offerings: { name: 'Hipertrofia' } },
            ]
          : table === 'trainer_plan_assignments'
            ? [
                { id: '55555555-5555-4555-8555-555555555555', relationship_id: relationshipIds.proposed, client_user_id: clientIds.proposed, source_template_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', status: 'proposed', created_at: '2026-09-01T00:00:00.000Z' },
                { id: '66666666-6666-4666-8666-666666666666', relationship_id: relationshipIds.activeOther, client_user_id: clientIds.activeOther, source_template_id: '99999999-9999-4999-8999-999999999999', status: 'active', created_at: '2026-09-02T00:00:00.000Z' },
                { id: '77777777-7777-4777-8777-777777777777', relationship_id: relationshipIds.activeCurrent, client_user_id: clientIds.activeCurrent, source_template_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', status: 'active', created_at: '2026-09-03T00:00:00.000Z' },
              ]
            : table === 'public_profiles'
              ? [
                  { id: clientIds.ready, full_name: 'Ana Pérez', username: 'ana', avatar_url: 'https://cdn.example.test/ana.jpg' },
                  { id: clientIds.proposed, full_name: 'Luis Rojas', username: 'luis', avatar_url: null },
                  { id: clientIds.activeOther, full_name: 'Eva Díaz', username: 'eva', avatar_url: null },
                  { id: clientIds.activeCurrent, full_name: 'Leo Ruiz', username: 'leo', avatar_url: null },
                ]
              : []
      const current = query(data)
      for (const method of ['select', 'eq', 'neq', 'order', 'limit', 'in']) {
        const queryMethod = current[method] as ReturnType<typeof vi.fn>
        queryMethod.mockImplementation((...args: unknown[]) => {
          calls.push({ table, method, args })
          return current
        })
      }
      return current
    }),
  }
}

describe('CoachProgramDetailPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    editorProps = null
  })

  it('projects named active client choices and preselects only the requested owned client', async () => {
    const supabase = supabaseForChoices()
    requireActiveTrainerContext.mockResolvedValue({ user: { id: 'trainer-1' }, profile: { timezone: 'America/Havana' }, supabase })
    const { default: CoachProgramDetailPage } = await import('../page')

    const view = await CoachProgramDetailPage({
      params: { templateId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' },
      searchParams: { clientId: '11111111-1111-4111-8111-111111111111' },
    } as never)
    renderToStaticMarkup(view)

    expect(supabase.calls).toContainEqual({ table: 'public_profiles', method: 'select', args: ['id, username, full_name, avatar_url'] })
    expect(supabase.calls).toContainEqual({
      table: 'trainer_plan_assignments',
      method: 'select',
      args: ['id, relationship_id, client_user_id, source_template_id, status, created_at'],
    })
    expect(supabase.calls).toContainEqual({
      table: 'trainer_plan_assignments',
      method: 'in',
      args: ['relationship_id', Object.values(supabase.relationshipIds)],
    })
    expect(supabase.calls).toContainEqual({
      table: 'trainer_plan_assignments',
      method: 'in',
      args: ['status', ['proposed', 'active']],
    })
    expect(supabase.calls).not.toContainEqual({
      table: 'trainer_plan_assignments',
      method: 'eq',
      args: ['source_template_id', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'],
    })
    expect(editorProps).toEqual(expect.objectContaining({
      selectedRelationshipId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      relationships: [
        expect.objectContaining({ id: supabase.relationshipIds.ready, clientUserId: supabase.clientIds.ready, clientName: 'Ana Pérez', serviceName: 'Fuerza', canReceiveProposal: true, state: 'Listo para recibir rutina' }),
        expect.objectContaining({ id: supabase.relationshipIds.proposed, clientUserId: supabase.clientIds.proposed, clientName: 'Luis Rojas', canReceiveProposal: false, state: 'Propuesta pendiente', blockingReason: 'El cliente ya tiene una propuesta pendiente de revisión.' }),
        expect.objectContaining({ id: supabase.relationshipIds.activeOther, clientUserId: supabase.clientIds.activeOther, clientName: 'Eva Díaz', canReceiveProposal: false, state: 'Rutina activa', blockingReason: 'El cliente ya tiene una rutina profesional activa.' }),
        expect.objectContaining({ id: supabase.relationshipIds.activeCurrent, clientUserId: supabase.clientIds.activeCurrent, clientName: 'Leo Ruiz', canReceiveProposal: false, state: 'Rutina activa', blockingReason: 'El cliente ya tiene una rutina profesional activa.' }),
      ],
      assignments: [expect.objectContaining({ id: '77777777-7777-4777-8777-777777777777', clientName: 'Leo Ruiz', serviceName: 'Hipertrofia' })],
    }))
  })

  it('ignores an invalid or foreign preselection while retaining active owned choices', async () => {
    const supabase = supabaseForChoices()
    requireActiveTrainerContext.mockResolvedValue({ user: { id: 'trainer-1' }, profile: { timezone: 'America/Havana' }, supabase })
    const { default: CoachProgramDetailPage } = await import('../page')

    const view = await CoachProgramDetailPage({
      params: { templateId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' },
      searchParams: { clientId: '88888888-8888-4888-8888-888888888888' },
    } as never)
    renderToStaticMarkup(view)

    expect(editorProps).toEqual(expect.objectContaining({ selectedRelationshipId: undefined }))
    expect((editorProps?.relationships as Array<{ id: string }>).map(choice => choice.id)).toEqual(Object.values(supabase.relationshipIds))
  })
})
