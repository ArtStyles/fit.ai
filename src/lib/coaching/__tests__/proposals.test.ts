import { describe, expect, it } from 'vitest'

describe('latest proposed assignment selection', () => {
  it('uses the id tie-breaker when proposal timestamps are equal and rows arrive reversed', async () => {
    const { selectLatestProposedAssignment } = await import('../proposals')
    const selected = selectLatestProposedAssignment([
      { id: '11111111-1111-4111-8111-111111111111', status: 'proposed', created_at: '2026-08-09T12:00:00.000Z' },
      { id: 'ffffffff-ffff-4fff-8fff-ffffffffffff', status: 'proposed', created_at: '2026-08-09T12:00:00.000Z' },
    ])
    expect(selected?.id).toBe('ffffffff-ffff-4fff-8fff-ffffffffffff')
  })
})
