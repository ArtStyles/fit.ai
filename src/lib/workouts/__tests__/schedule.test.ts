import { describe, expect, it } from 'vitest'
import {
  canStartWorkoutToday,
  getAppTimeZone,
  getIsoWeekday,
  getLocalDateString,
  getLocalDayBounds,
  getWeekMonday,
  WORKOUT_ACCESS_POLICY,
} from '../schedule'

const TZ = 'America/Havana'

describe('workout schedule helpers', () => {
  it('documents the strict current-day access policy', () => {
    expect(WORKOUT_ACCESS_POLICY).toEqual({
      missedWorkoutRecoveryDays: 0,
      advanceStartDays: 0,
    })
  })

  it('falls back to the configured app timezone', () => {
    expect(getAppTimeZone()).toBe(TZ)
  })

  it('uses ISO weekdays for workout scheduling', () => {
    expect(getIsoWeekday(new Date('2026-05-25T16:00:00.000Z'), TZ)).toBe(1)
    expect(getIsoWeekday(new Date('2026-05-27T16:00:00.000Z'), TZ)).toBe(3)
    expect(getIsoWeekday(new Date('2026-05-31T16:00:00.000Z'), TZ)).toBe(7)
  })

  it('formats app-timezone dates without UTC shifting', () => {
    const lateNightInHavana = new Date('2026-05-27T03:30:00.000Z')

    expect(getLocalDateString(lateNightInHavana, TZ)).toBe('2026-05-26')
    expect(getIsoWeekday(lateNightInHavana, TZ)).toBe(2)
    expect(getIsoWeekday(lateNightInHavana, 'UTC')).toBe(3)
  })

  it('finds the monday for the current app-timezone week', () => {
    const monday = getWeekMonday(new Date('2026-05-27T16:00:00.000Z'), TZ)

    expect(getLocalDateString(monday, TZ)).toBe('2026-05-25')
    expect(getIsoWeekday(monday, TZ)).toBe(1)
    expect(monday.toISOString()).toBe('2026-05-25T04:00:00.000Z')
  })

  it('builds app-timezone day bounds', () => {
    const { start, end } = getLocalDayBounds(new Date('2026-05-27T19:30:00.000Z'), TZ)

    expect(getLocalDateString(start, TZ)).toBe('2026-05-27')
    expect(getLocalDateString(end, TZ)).toBe('2026-05-28')
    expect(start.toISOString()).toBe('2026-05-27T04:00:00.000Z')
    expect(end.toISOString()).toBe('2026-05-28T04:00:00.000Z')
  })

  it('allows starting only the workout assigned to today', () => {
    const wednesday = new Date('2026-05-27T16:00:00.000Z')

    expect(canStartWorkoutToday(3, wednesday, TZ)).toBe(true)
    expect(canStartWorkoutToday(2, wednesday, TZ)).toBe(false)
    expect(canStartWorkoutToday(4, wednesday, TZ)).toBe(false)
    expect(canStartWorkoutToday(null, wednesday, TZ)).toBe(false)
  })
})
