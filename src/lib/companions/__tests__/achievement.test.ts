import { describe, expect, it } from 'vitest'
import { hasSharedWeeklyAchievement } from '../achievement'
import type { CompanionSnapshot } from '../types'

const now = Date.parse('2026-09-10T16:00:00Z')
const week = { completedSessions: 2, goal: 2, weekStart: '2026-09-07', weekEnd: '2026-09-13', timeZone: 'America/Havana', updatedAt: new Date(now).toISOString() }
const snapshot: CompanionSnapshot = {
  viewerId: 'a', status: 'active', relationship: { id: 'relationship', other: { userId: 'b', fullName: 'Marina', avatarUrl: null }, expiresAt: null },
  self: week, partner: { ...week, completedSessions: 4, goal: 4 }, greeting: null, nextGreetingAt: null, fetchedAt: week.updatedAt,
}

describe('shared weekly achievement from synchronized individual goals', () => {
  it('celebrates both people reaching their own unequal goals', () => {
    expect(hasSharedWeeklyAchievement(snapshot, now)).toBe(true)
    expect(hasSharedWeeklyAchievement({ ...snapshot, partner: { ...week, goal: 3, completedSessions: 5 } }, now)).toBe(true)
  })
  it.each([null, 0, -1, 2.5, Number.NaN])('does not invent a completed target from goal %s', goal => {
    expect(hasSharedWeeklyAchievement({ ...snapshot, self: { ...week, goal } }, now)).toBe(false)
  })
  it('requires both goals, both summaries and an accepted current relationship', () => {
    expect(hasSharedWeeklyAchievement({ ...snapshot, partner: { ...week, completedSessions: 1 } }, now)).toBe(false)
    expect(hasSharedWeeklyAchievement({ ...snapshot, partner: null }, now)).toBe(false)
    expect(hasSharedWeeklyAchievement({ ...snapshot, self: null }, now)).toBe(false)
    expect(hasSharedWeeklyAchievement({ ...snapshot, status: 'pending_incoming' }, now)).toBe(false)
    expect(hasSharedWeeklyAchievement({ ...snapshot, relationship: null }, now)).toBe(false)
    expect(hasSharedWeeklyAchievement(null, now)).toBe(false)
  })
  it('never combines different weeks or invalid weekly periods', () => {
    expect(hasSharedWeeklyAchievement({ ...snapshot, partner: { ...week, weekStart: '2026-08-31', weekEnd: '2026-09-06' } }, now)).toBe(false)
    expect(hasSharedWeeklyAchievement({ ...snapshot, self: { ...week, weekEnd: '2026-09-12' }, partner: { ...week, weekEnd: '2026-09-12' } }, now)).toBe(false)
    expect(hasSharedWeeklyAchievement({ ...snapshot, partner: { ...week, timeZone: 'Not/AZone' } }, now)).toBe(false)
  })
  it('keeps current cached evidence but stops celebrating it when the week changes', () => {
    expect(hasSharedWeeklyAchievement({ ...snapshot, offline: true }, now)).toBe(true)
    expect(hasSharedWeeklyAchievement({ ...snapshot, offline: true }, Date.parse('2026-09-14T04:00:00Z'))).toBe(false)
    expect(hasSharedWeeklyAchievement(snapshot, Date.parse('2026-09-06T16:00:00Z'))).toBe(false)
  })
  it('waits until both local calendar weeks match at a timezone boundary', () => {
    const crossZone = { ...snapshot, partner: { ...week, timeZone: 'Asia/Tokyo' } }
    expect(hasSharedWeeklyAchievement(crossZone, Date.parse('2026-09-13T14:59:59Z'))).toBe(true)
    expect(hasSharedWeeklyAchievement(crossZone, Date.parse('2026-09-13T15:00:00Z'))).toBe(false)
  })
})
