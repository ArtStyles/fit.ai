import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

const { requireActiveTrainerContext } = vi.hoisted(() => ({ requireActiveTrainerContext: vi.fn() }))

vi.mock('@/lib/coaching/access', () => ({ requireActiveTrainerContext }))
vi.mock('@/components/navigation/PageTopBar', () => ({ PageTopBar: () => <header>top</header> }))
vi.mock('@/components/coaching/CoachRequestQueue', () => ({ CoachRequestQueue: () => <p>queue</p> }))
vi.mock('@/components/coaching/CoachRelationshipActions', () => ({
  CoachRelationshipActions: ({ relationshipId, status }: { relationshipId: string; status: string }) => <p>{relationshipId}:{status}</p>,
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
})
