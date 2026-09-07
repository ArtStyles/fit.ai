import type { PlanAdjustmentIntent } from '@/lib/training-engine'

export function normalizeIsoWeekdays(value: unknown): number[] | null {
  if (!Array.isArray(value)) return null
  if (!value.every(day => Number.isInteger(day) && Number(day) >= 1 && Number(day) <= 7)) return null
  const days = value.map(Number)
  return new Set(days).size === days.length ? days : null
}

export function resolveAdjustmentSchedule(
  currentWorkoutDays: number[],
  intent: PlanAdjustmentIntent,
): number[] {
  const current = normalizeIsoWeekdays(currentWorkoutDays)
  if (!current || current.length === 0) throw new Error('INVALID_ADJUSTMENT_SCHEDULE')
  const expected = (intent as PlanAdjustmentIntent & {
    expectedCurrentWorkoutDays?: unknown
  }).expectedCurrentWorkoutDays
  if (expected !== undefined) {
    const normalizedExpected = normalizeIsoWeekdays(expected)
    if (!normalizedExpected
      || normalizedExpected.length !== current.length
      || normalizedExpected.some((day, index) => day !== current[index])) {
      throw new Error('STALE_ADJUSTMENT_SCHEDULE')
    }
  }

  if (intent.type !== 'change_days') return current

  if (intent.preferredWorkoutDays !== undefined) {
    const requested = normalizeIsoWeekdays(intent.preferredWorkoutDays)
    if (!requested || requested.length !== intent.daysPerWeek) {
      throw new Error('INVALID_ADJUSTMENT_SCHEDULE')
    }
    return requested
  }

  const retained = current.slice(0, intent.daysPerWeek)
  for (let day = 1; retained.length < intent.daysPerWeek && day <= 7; day += 1) {
    if (!retained.includes(day)) retained.push(day)
  }
  return retained.sort((a, b) => a - b)
}
