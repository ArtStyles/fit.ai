import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

let formProps: Record<string, unknown> | null = null
const { requireActiveTrainerContext } = vi.hoisted(() => ({ requireActiveTrainerContext: vi.fn() }))

vi.mock('@/lib/coaching/access', () => ({ requireActiveTrainerContext }))
vi.mock('@/components/navigation/PageTopBar', () => ({ PageTopBar: () => null }))
vi.mock('@/components/coaching/NewProgramTemplateForm', () => ({ NewProgramTemplateForm: (props: Record<string, unknown>) => { formProps = props; return null } }))

function relationshipQuery(data: unknown) {
  const chain: any = { select: vi.fn(), eq: vi.fn(), maybeSingle: vi.fn(async () => ({ data, error: null })) }
  chain.select.mockReturnValue(chain); chain.eq.mockReturnValue(chain)
  return chain
}

describe('NewCoachProgramPage', () => {
  beforeEach(() => { vi.clearAllMocks(); formProps = null })

  it('revalidates an active trainer-owned client before passing it to creation', async () => {
    const query = relationshipQuery({ id: 'relationship-1' })
    const supabase = { from: vi.fn(() => query) }
    requireActiveTrainerContext.mockResolvedValue({ user: { id: 'trainer-1' }, supabase })
    const { default: NewCoachProgramPage } = await import('../page')

    renderToStaticMarkup(await NewCoachProgramPage({ searchParams: { clientId: '11111111-1111-4111-8111-111111111111' } }))

    expect(query.eq).toHaveBeenCalledWith('trainer_user_id', 'trainer-1')
    expect(query.eq).toHaveBeenCalledWith('status', 'active')
    expect(formProps).toEqual({ clientId: '11111111-1111-4111-8111-111111111111' })
  })

  it('drops an inactive or foreign client before the form can redirect with it', async () => {
    const query = relationshipQuery(null)
    const supabase = { from: vi.fn(() => query) }
    requireActiveTrainerContext.mockResolvedValue({ user: { id: 'trainer-1' }, supabase })
    const { default: NewCoachProgramPage } = await import('../page')

    renderToStaticMarkup(await NewCoachProgramPage({ searchParams: { clientId: '22222222-2222-4222-8222-222222222222' } }))

    expect(formProps).toEqual({ clientId: undefined })
  })
})
