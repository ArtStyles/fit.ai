import { describe, expect, it } from 'vitest'
import { CHECK_IN_INTERVAL_DAYS, isCheckInDue } from '../checkin'

const NOW = new Date('2026-06-11T12:00:00.000Z')

function daysAgo(days: number): string {
  return new Date(NOW.getTime() - days * 24 * 60 * 60 * 1000).toISOString()
}

describe('isCheckInDue()', () => {
  it('documents the 28-day interval', () => {
    expect(CHECK_IN_INTERVAL_DAYS).toBe(28)
  })

  it('is not due right after a check-in', () => {
    expect(isCheckInDue(daysAgo(0), NOW)).toBe(false)
    expect(isCheckInDue(daysAgo(27), NOW)).toBe(false)
  })

  it('is due once the interval has passed', () => {
    expect(isCheckInDue(daysAgo(28), NOW)).toBe(true)
    expect(isCheckInDue(daysAgo(60), NOW)).toBe(true)
  })

  it('is due when there is no recorded check-in', () => {
    expect(isCheckInDue(null, NOW)).toBe(true)
  })

  it('ignores malformed dates and treats them as due', () => {
    expect(isCheckInDue('not-a-date', NOW)).toBe(true)
  })
})
