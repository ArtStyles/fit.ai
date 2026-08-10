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

  it('keeps the coaching query ordered by created_at and then id', async () => {
    const source = await import('node:fs/promises').then(fs => fs.readFile(new URL('../../../app/(app)/coaching/page.tsx', import.meta.url), 'utf8'))
    expect(source).toContain(".order('created_at', { ascending: false })\n      .order('id', { ascending: false })")
  })
})
