import { beforeEach, describe, expect, it, vi } from 'vitest'

const { notFound, requireActiveTrainerContext, getCoachClientInsights, getCoachClientMeasurements } = vi.hoisted(() => ({
  notFound: vi.fn(() => { throw new Error('NOT_FOUND') }),
  requireActiveTrainerContext: vi.fn(),
  getCoachClientInsights: vi.fn(),
  getCoachClientMeasurements: vi.fn(),
}))

vi.mock('next/navigation', () => ({ notFound }))
vi.mock('@/lib/coaching/access', () => ({ requireActiveTrainerContext }))
vi.mock('@/lib/coaching/insights', () => ({ getCoachClientInsights, getCoachClientMeasurements }))
vi.mock('@/components/navigation/PageTopBar', () => ({ PageTopBar: () => null }))
vi.mock('@/components/coaching/ClientInsightsDashboard', () => ({ ClientInsightsDashboard: () => null }))
vi.mock('@/components/coaching/ClientMeasurementsPanel', () => ({ ClientMeasurementsPanel: () => null }))

describe('CoachClientDetailPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    requireActiveTrainerContext.mockResolvedValue({ supabase: {} })
    getCoachClientInsights.mockResolvedValue({ activeScopes: [] })
    getCoachClientMeasurements.mockResolvedValue([])
  })

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
    requireActiveTrainerContext.mockRejectedValue(new Error('trainer context unavailable'))
    const { default: CoachClientDetailPage } = await import('../page')

    await expect(CoachClientDetailPage({ params: { clientId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' }, searchParams: {} })).rejects.toThrow('NOT_FOUND')
    expect(getCoachClientInsights).not.toHaveBeenCalled()
  })

  it('does not call the measurements RPC when body-measurements consent is absent', async () => {
    const { default: CoachClientDetailPage } = await import('../page')

    await CoachClientDetailPage({ params: { clientId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' }, searchParams: {} })

    expect(getCoachClientMeasurements).not.toHaveBeenCalled()
  })

  it('calls the measurements RPC once when the basic payload has current body-measurements consent', async () => {
    getCoachClientInsights.mockResolvedValue({ activeScopes: ['training_profile', 'body_measurements'], rangeStart: '2025-12-04', rangeEnd: '2025-12-31' })
    const { default: CoachClientDetailPage } = await import('../page')

    await CoachClientDetailPage({ params: { clientId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' }, searchParams: {} })

    expect(getCoachClientMeasurements).toHaveBeenCalledTimes(1)
    expect(getCoachClientMeasurements).toHaveBeenCalledWith({}, { clientId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', fromDate: '2025-12-04', toDate: '2025-12-31' })
  })

  it('keeps the already-authorized detail visible when the later measurements request fails', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    getCoachClientInsights.mockResolvedValue({ activeScopes: ['body_measurements'] })
    getCoachClientMeasurements.mockRejectedValue(new Error('COACH_CLIENT_INSIGHTS_UNAVAILABLE'))
    const { default: CoachClientDetailPage } = await import('../page')

    await expect(CoachClientDetailPage({ params: { clientId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' }, searchParams: {} })).resolves.toBeDefined()
    expect(getCoachClientInsights).toHaveBeenCalledTimes(1)
    expect(getCoachClientMeasurements).toHaveBeenCalledTimes(1)
    log.mockRestore()
  })

  it('records a sanitized internal event for an optional measurements failure without PII', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    getCoachClientInsights.mockResolvedValue({ activeScopes: ['body_measurements'], rangeStart: '2026-08-01', rangeEnd: '2026-08-28' })
    getCoachClientMeasurements.mockRejectedValue(new Error('private client measurement payload'))
    const { default: CoachClientDetailPage } = await import('../page')

    await CoachClientDetailPage({ params: { clientId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' }, searchParams: {} })

    expect(log).toHaveBeenCalledWith('[coach-client-measurements] unavailable')
    expect(log.mock.calls.flat().join(' ')).not.toContain('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')
    expect(log.mock.calls.flat().join(' ')).not.toContain('private client measurement payload')
    log.mockRestore()
  })
})
