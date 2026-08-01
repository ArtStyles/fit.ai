import { describe, expect, it } from 'vitest'
import {
  findPreviousComparableSession,
  groupEvidenceSessions,
  sessionsInMonth,
  type EvidenceSession,
} from '../timeline'

const sessions: EvidenceSession[] = [
  { id: 'new', workoutId: 'w1', date: '2026-08-10', completedAt: '2026-08-10T10:00:00Z', volumeKg: 1200 },
  { id: 'other', workoutId: 'w2', date: '2026-08-09', completedAt: '2026-08-09T10:00:00Z', volumeKg: 900 },
  { id: 'old', workoutId: 'w1', date: '2026-08-03', completedAt: '2026-08-03T10:00:00Z', volumeKg: 1000 },
]

describe('training evidence timeline', () => {
  it('compares only the previous completed session of the same workout', () => {
    expect(findPreviousComparableSession(sessions, sessions[0])?.id).toBe('old')
  })

  it('filters a visible calendar month', () => {
    expect(sessionsInMonth(sessions, 2026, 8)).toHaveLength(3)
    expect(sessionsInMonth(sessions, 2026, 7)).toEqual([])
  })

  it('groups the current week before older months', () => {
    expect(groupEvidenceSessions(sessions, '2026-08-10')[0].key).toBe('current-week')
  })
})
