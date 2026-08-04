import { describe, expect, it } from 'vitest'
import { buildDashboardFallbackHistory } from '../historyEvidence'

describe('dashboard fallback history', () => {
  it('keeps an orphan session for recent history, week metrics, and completed state', () => {
    const orphan = {
      id: 'orphan-log',
      workout_id: null,
      completed_at: '2026-08-02T10:00:00Z',
      duration_minutes: 45,
      session_context_snapshot: null,
    }

    const history = buildDashboardFallbackHistory(
      [orphan],
      new Date('2026-08-01T00:00:00Z'),
    )

    expect(history.allRecentLogs).toEqual([orphan])
    expect(history.weekLogs).toEqual([orphan])
    expect(history.hasCompletedSessions).toBe(true)
  })
})
