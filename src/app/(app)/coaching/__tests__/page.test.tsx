import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

const { requireAppUserContext } = vi.hoisted(() => ({ requireAppUserContext: vi.fn() }))

vi.mock('@/lib/auth/server', () => ({ requireAppUserContext }))
vi.mock('@/components/coaching/ClientCoachingStatus', () => ({
  ClientCoachingStatus: ({ requests, relationship }: { requests: unknown[]; relationship?: { id: string; status: string } }) => <p>{requests.length ? 'requests' : relationship ? `relationship:${relationship.status}` : 'No tienes solicitudes de acompañamiento.'}</p>,
}))
vi.mock('@/components/coaching/ConsentManager', () => ({ ConsentManager: ({ relationshipId }: { relationshipId: string }) => <p>consents:{relationshipId}</p> }))

function requestQuery(result: { data: unknown; error: unknown }, relationships = [] as Array<{ id: string; status: 'active' | 'paused_by_platform' }>) {
  const order = vi.fn(async () => result)
  const requestEq = vi.fn(() => ({ order }))
  const requestSelect = vi.fn(() => ({ eq: requestEq }))
  const relationshipLimit = vi.fn(async () => ({ data: relationships, error: null }))
  const relationshipResult = Object.assign(Promise.resolve({ data: relationships, error: null }), { limit: relationshipLimit })
  const relationshipStatusIn = vi.fn(() => relationshipResult)
  const relationshipClientEq = vi.fn(() => ({ in: relationshipStatusIn }))
  const relationshipSelect = vi.fn(() => ({ eq: relationshipClientEq }))
  const from = vi.fn((table: string) => ({ select: table === 'coaching_relationships' ? relationshipSelect : requestSelect }))
  return { from, order }
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

  it('prioritizes an active relationship over a paused history row regardless of returned row order', async () => {
    const supabase = requestQuery(
      { data: [], error: null },
      [
        { id: 'paused-first', status: 'paused_by_platform' },
        { id: 'active-second', status: 'active' },
      ],
    )
    requireAppUserContext.mockResolvedValue({ user: { id: 'client-1' }, supabase })
    const { default: CoachingPage } = await import('../page')

    const html = renderToStaticMarkup(await CoachingPage())

    expect(html).toContain('relationship:active')
    expect(html).toContain('consents:active-second')
  })
})
