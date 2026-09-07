import { describe, expect, it } from 'vitest'
import { resolveAdjustmentSchedule } from '../adjustmentSchedule'

describe('resolveAdjustmentSchedule', () => {
  it('reduces a Tuesday Thursday Saturday plan deterministically to Tuesday Thursday', () => {
    expect(resolveAdjustmentSchedule([2, 4, 6], {
      type: 'change_days',
      daysPerWeek: 2,
    })).toEqual([2, 4])
  })

  it('preserves the active workout weekdays for a duration adjustment', () => {
    expect(resolveAdjustmentSchedule([2, 4], {
      type: 'change_duration',
      sessionDurationMinutes: 45,
    })).toEqual([2, 4])
  })

  it('rejects a preview-bound adjustment if the active calendar changed', () => {
    expect(() => resolveAdjustmentSchedule([1, 3, 5], {
      type: 'change_duration',
      sessionDurationMinutes: 45,
      expectedCurrentWorkoutDays: [2, 4, 6],
    } as Parameters<typeof resolveAdjustmentSchedule>[1])).toThrow('STALE_ADJUSTMENT_SCHEDULE')
  })

  it('preserves explicit unique ISO weekdays exactly', () => {
    expect(resolveAdjustmentSchedule([2, 4, 6], {
      type: 'change_days',
      daysPerWeek: 2,
      preferredWorkoutDays: [3, 7],
    })).toEqual([3, 7])
  })

  it.each([
    [2, [2, 2]],
    [2, [0, 4]],
    [2, [2, 8]],
    [3, [2, 4]],
  ])('rejects invalid explicit weekdays for %i days: %j', (daysPerWeek, preferredWorkoutDays) => {
    expect(() => resolveAdjustmentSchedule([2, 4, 6], {
      type: 'change_days',
      daysPerWeek,
      preferredWorkoutDays,
    })).toThrow('INVALID_ADJUSTMENT_SCHEDULE')
  })
})
