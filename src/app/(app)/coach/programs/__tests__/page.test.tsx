import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

const { requireActiveTrainerContext } = vi.hoisted(() => ({ requireActiveTrainerContext: vi.fn() }))

vi.mock('@/lib/coaching/access', () => ({ requireActiveTrainerContext }))
vi.mock('@/components/navigation/PageTopBar', () => ({ PageTopBar: () => null }))

function query(data: unknown, error: unknown = null) {
  const result = { data, error }
  const chain: any = {
    select: vi.fn(),
    eq: vi.fn(),
    neq: vi.fn(),
    order: vi.fn(),
    maybeSingle: vi.fn(async () => result),
    then: (resolve: (value: unknown) => unknown) => Promise.resolve(result).then(resolve),
  }
  chain.select.mockReturnValue(chain)
  chain.eq.mockReturnValue(chain)
  chain.neq.mockReturnValue(chain)
  chain.order.mockReturnValue(chain)
  return chain
}

function supabaseForRelationship(relationshipData: unknown, relationshipError: unknown = null) {
  const templates = query([], null)
  const relationship = query(relationshipData, relationshipError)
  return {
    from: vi.fn((table: string) => table === 'trainer_program_templates' ? templates : relationship),
  }
}

describe('CoachProgramsPage', () => {
  beforeEach(() => vi.clearAllMocks())

  it('drops an ineligible client without exposing its id in routine links', async () => {
    const supabase = supabaseForRelationship(null)
    requireActiveTrainerContext.mockResolvedValue({ user: { id: 'trainer-1' }, supabase })
    const { default: CoachProgramsPage } = await import('../page')

    const html = renderToStaticMarkup(await CoachProgramsPage({
      searchParams: { clientId: '22222222-2222-4222-8222-222222222222' },
    }))

    expect(html).toContain('href="/coach/programs/new"')
    expect(html).not.toContain('clientId=')
  })

  it('reports a generic load failure when the client relationship lookup fails', async () => {
    const supabase = supabaseForRelationship(null, { message: 'private database detail' })
    requireActiveTrainerContext.mockResolvedValue({ user: { id: 'trainer-1' }, supabase })
    const { default: CoachProgramsPage } = await import('../page')

    await expect(CoachProgramsPage({
      searchParams: { clientId: '22222222-2222-4222-8222-222222222222' },
    })).rejects.toThrow('No se pudieron cargar las rutinas profesionales.')
  })
})
