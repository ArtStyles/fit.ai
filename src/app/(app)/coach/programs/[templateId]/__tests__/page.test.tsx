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
  const calls: Array<{ table: string; select?: string }> = []
  return {
    calls,
    from: vi.fn((table: string) => {
      const data = table === 'trainer_program_templates'
        ? { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'Fuerza', goal: null, description: null, days_per_week: 3, status: 'active' }
        : table === 'coaching_relationships'
          ? [{ id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', client_user_id: '11111111-1111-4111-8111-111111111111', started_at: '2026-08-01T00:00:00.000Z', trainer_service_offerings: { name: 'Fuerza' } }]
          : table === 'trainer_plan_assignments'
            ? [{ id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', coaching_relationships: { client_user_id: '11111111-1111-4111-8111-111111111111', started_at: '2026-08-01T00:00:00.000Z', trainer_service_offerings: { name: 'Fuerza' } } }]
            : table === 'public_profiles'
              ? [{ id: '11111111-1111-4111-8111-111111111111', full_name: 'Ana Pérez', username: 'ana', avatar_url: 'https://cdn.example.test/ana.jpg' }]
              : []
      const current = query(data)
      const select = current.select as ReturnType<typeof vi.fn>
      select.mockImplementation((fields: string) => {
        calls.push({ table, select: fields })
        return current
      })
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

    expect(supabase.calls).toContainEqual({ table: 'public_profiles', select: 'id, username, full_name, avatar_url' })
    expect(editorProps).toEqual(expect.objectContaining({
      selectedRelationshipId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      relationships: [expect.objectContaining({ id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', clientName: 'Ana Pérez', serviceName: 'Fuerza' })],
      assignments: [expect.objectContaining({ id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', clientName: 'Ana Pérez', serviceName: 'Fuerza' })],
    }))
  })

  it('ignores an invalid or foreign preselection while retaining active owned choices', async () => {
    const supabase = supabaseForChoices()
    requireActiveTrainerContext.mockResolvedValue({ user: { id: 'trainer-1' }, profile: { timezone: 'America/Havana' }, supabase })
    const { default: CoachProgramDetailPage } = await import('../page')

    const view = await CoachProgramDetailPage({
      params: { templateId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' },
      searchParams: { clientId: '22222222-2222-4222-8222-222222222222' },
    } as never)
    renderToStaticMarkup(view)

    expect(editorProps).toEqual(expect.objectContaining({ selectedRelationshipId: undefined }))
    expect((editorProps?.relationships as Array<{ id: string }>).map(choice => choice.id)).toEqual(['bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'])
  })
})
