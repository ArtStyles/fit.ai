import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  formatDashboardDuration,
  formatDashboardLoad,
  formatDashboardRelativeDate,
  formatDashboardReps,
} from '../dashboardFormatters'

describe('dashboard secondary metric formatting', () => {
  const now = new Date('2026-07-06T12:00:00.000Z')

  it('formats relative and missing dates in both languages', () => {
    expect(formatDashboardRelativeDate(null, 'es', now)).toBe('Fecha no disponible')
    expect(formatDashboardRelativeDate(null, 'en', now)).toBe('Date unavailable')
    expect(formatDashboardRelativeDate('2026-07-06T08:00:00.000Z', 'es', now)).toBe('Hoy')
    expect(formatDashboardRelativeDate('2026-07-05T08:00:00.000Z', 'en', now)).toBe('Yesterday')
  })

  it('omits a missing duration and localizes a present duration', () => {
    expect(formatDashboardDuration(null, 'es')).toBeNull()
    expect(formatDashboardDuration(0, 'en')).toBeNull()
    expect(formatDashboardDuration(47, 'es')).toBe('47 min')
    expect(formatDashboardDuration(47, 'en')).toBe('47 min')
  })

  it('formats bodyweight, integer, decimal, and invalid loads safely', () => {
    expect(formatDashboardLoad(0, 'es')).toBe('Peso corporal')
    expect(formatDashboardLoad(0, 'en')).toBe('Bodyweight')
    expect(formatDashboardLoad(82, 'es')).toBe('82 kg')
    expect(formatDashboardLoad(82.5, 'es')).toBe('82,5 kg')
    expect(formatDashboardLoad(82.5, 'en')).toBe('82.5 kg')
    expect(formatDashboardLoad(Number.NaN, 'en')).toBe('No weight')
  })

  it('formats reps with locale-safe singular and plural labels', () => {
    expect(formatDashboardReps(0, 'es')).toBeNull()
    expect(formatDashboardReps(1, 'es')).toBe('1 repetición')
    expect(formatDashboardReps(5, 'es')).toBe('5 repeticiones')
    expect(formatDashboardReps(1, 'en')).toBe('1 rep')
    expect(formatDashboardReps(5, 'en')).toBe('5 reps')
  })

  it('renders date, duration, load, and reps through the format layer', () => {
    const source = readFileSync(new URL('../SecondaryMetrics.tsx', import.meta.url), 'utf8')
    expect(source).toContain('formatDashboardRelativeDate(')
    expect(source).toContain('formatDashboardDuration(')
    expect(source).toContain('formatDashboardLoad(')
    expect(source).toContain('formatDashboardReps(')
  })
})
