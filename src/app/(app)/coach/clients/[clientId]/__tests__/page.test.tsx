import { describe, expect, it, vi } from 'vitest'

const { notFound, requireActiveTrainerContext, getCoachClientInsights } = vi.hoisted(() => ({
  notFound: vi.fn(() => { throw new Error('NOT_FOUND') }),
  requireActiveTrainerContext: vi.fn(),
  getCoachClientInsights: vi.fn(),
}))

vi.mock('next/navigation', () => ({ notFound }))
vi.mock('@/lib/coaching/access', () => ({ requireActiveTrainerContext }))
vi.mock('@/lib/coaching/insights', () => ({ getCoachClientInsights }))
vi.mock('@/components/navigation/PageTopBar', () => ({ PageTopBar: () => null }))
vi.mock('@/components/coaching/ClientInsightsDashboard', () => ({ ClientInsightsDashboard: () => null }))

describe('CoachClientDetailPage', () => {
  it('rejects a malformed client UUID before opening a trainer context or RPC', async () => {
    const { default: CoachClientDetailPage } = await import('../page')

    await expect(CoachClientDetailPage({ params: { clientId: 'not-a-uuid' }, searchParams: {} })).rejects.toThrow('NOT_FOUND')
    expect(requireActiveTrainerContext).not.toHaveBeenCalled()
    expect(getCoachClientInsights).not.toHaveBeenCalled()
  })

  it('converges a consent-bound RPC failure into notFound without revealing its cause', async () => {
    requireActiveTrainerContext.mockResolvedValue({ supabase: {} })
    getCoachClientInsights.mockRejectedValue(new Error('COACH_CLIENT_INSIGHTS_UNAVAILABLE'))
    const { default: CoachClientDetailPage } = await import('../page')

    await expect(CoachClientDetailPage({ params: { clientId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' }, searchParams: { weeks: 'invalid' } })).rejects.toThrow('NOT_FOUND')
    expect(getCoachClientInsights).toHaveBeenCalledWith({}, expect.objectContaining({ clientId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', weeks: 4 }))
  })

  it('converges a trainer-context authorization failure into the same notFound response', async () => {
    getCoachClientInsights.mockClear()
    requireActiveTrainerContext.mockRejectedValue(new Error('trainer context unavailable'))
    const { default: CoachClientDetailPage } = await import('../page')

    await expect(CoachClientDetailPage({ params: { clientId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' }, searchParams: {} })).rejects.toThrow('NOT_FOUND')
    expect(getCoachClientInsights).not.toHaveBeenCalled()
  })
})
