import { describe, expect, it } from 'vitest'
import {
  canStartWorkoutToday,
  getAppTimeZone,
  getIsoWeekday,
  getLocalDateString,
  getLocalDayBounds,
  getZonedHour,
  getWeekMonday,
  getWorkoutStartWindow,
  resolveUserTimeZone,
  WORKOUT_ACCESS_POLICY,
} from '../schedule'

const TZ = 'America/Havana'

describe('workout schedule helpers', () => {
  it('documents the access policy with missed-workout recovery', () => {
    expect(WORKOUT_ACCESS_POLICY).toEqual({
      missedWorkoutRecoveryDays: 2,
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

  it('resolves the local hour at a UTC day boundary', () => {
    const instant = new Date('2026-08-20T03:30:00.000Z')

    expect(getZonedHour(instant, 'America/Havana')).toBe(23)
    expect(getZonedHour(instant, 'UTC')).toBe(3)
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

describe('resolveUserTimeZone()', () => {
  it('uses the stored IANA timezone when valid', () => {
    expect(resolveUserTimeZone('Europe/Madrid')).toBe('Europe/Madrid')
    expect(resolveUserTimeZone('America/Mexico_City')).toBe('America/Mexico_City')
  })

  it('falls back to the app timezone for invalid or missing values', () => {
    expect(resolveUserTimeZone('Not/AZone')).toBe(TZ)
    expect(resolveUserTimeZone('')).toBe(TZ)
    expect(resolveUserTimeZone(null)).toBe(TZ)
    expect(resolveUserTimeZone(undefined)).toBe(TZ)
  })
})

describe('getWorkoutStartWindow()', () => {
  // 2026-05-27 es miércoles (ISO 3) en America/Havana
  const wednesday = new Date('2026-05-27T16:00:00.000Z')

  it('marks the workout scheduled for today as today', () => {
    expect(getWorkoutStartWindow(3, wednesday, TZ)).toEqual({ status: 'today' })
  })

  it('marks workouts missed within the recovery window as recoverable', () => {
    expect(getWorkoutStartWindow(2, wednesday, TZ)).toEqual({
      status: 'recoverable',
      daysLate: 1,
      scheduledDate: '2026-05-26',
    })
    expect(getWorkoutStartWindow(1, wednesday, TZ)).toEqual({
      status: 'recoverable',
      daysLate: 2,
      scheduledDate: '2026-05-25',
    })
  })

  it('blocks workouts missed beyond the recovery window', () => {
    // Domingo (ISO 7) quedó a 3 días del miércoles
    expect(getWorkoutStartWindow(7, wednesday, TZ)).toEqual({ status: 'unavailable' })
  })

  it('blocks future workouts and missing schedules', () => {
    expect(getWorkoutStartWindow(4, wednesday, TZ)).toEqual({ status: 'unavailable' })
    expect(getWorkoutStartWindow(null, wednesday, TZ)).toEqual({ status: 'unavailable' })
  })

  it('recovers across the week boundary', () => {
    // 2026-05-25 es lunes (ISO 1); el domingo anterior fue 2026-05-24
    const monday = new Date('2026-05-25T16:00:00.000Z')

    expect(getWorkoutStartWindow(7, monday, TZ)).toEqual({
      status: 'recoverable',
      daysLate: 1,
      scheduledDate: '2026-05-24',
    })
  })

  it('resolves the weekday in the app timezone', () => {
    // 03:30 UTC del 27 todavía es martes 26 en La Habana
    const lateNightInHavana = new Date('2026-05-27T03:30:00.000Z')

    expect(getWorkoutStartWindow(2, lateNightInHavana, TZ)).toEqual({ status: 'today' })
    expect(getWorkoutStartWindow(1, lateNightInHavana, TZ)).toEqual({
      status: 'recoverable',
      daysLate: 1,
      scheduledDate: '2026-05-25',
    })
  })
})
