import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  formatDashboardDuration,
  formatDashboardLoad,
  formatDashboardRelativeDate,
  formatDashboardReps,
} from '../dashboardFormatters'

describe('dashboard secondary metric formatting', () => {
  const relativeDate = formatDashboardRelativeDate as unknown as (
    value: string | null,
    language: 'es' | 'en',
    timeZone: string,
    referenceInstant: string,
  ) => string

  it('uses the profile timezone at UTC midnight boundaries', () => {
    const reference = '2026-07-06T00:30:00.000Z'
    const session = '2026-07-05T12:00:00.000Z'

    expect(relativeDate(session, 'en', 'America/Los_Angeles', reference)).toBe('Today')
    expect(relativeDate(session, 'en', 'UTC', reference)).toBe('Yesterday')
  })

  it('formats Today and Yesterday in Spanish and English', () => {
    const reference = '2026-07-06T05:00:00.000Z'
    expect(relativeDate('2026-07-06T04:30:00.000Z', 'es', 'America/Havana', reference)).toBe('Hoy')
    expect(relativeDate('2026-07-05T23:00:00.000Z', 'es', 'America/Havana', reference)).toBe('Ayer')
    expect(relativeDate('2026-07-06T04:30:00.000Z', 'en', 'America/Havana', reference)).toBe('Today')
    expect(relativeDate('2026-07-05T23:00:00.000Z', 'en', 'America/Havana', reference)).toBe('Yesterday')
  })

  it('uses calendar days across a DST-adjacent boundary', () => {
    expect(relativeDate(
      '2026-03-08T06:30:00.000Z',
      'en',
      'America/New_York',
      '2026-03-09T04:30:00.000Z',
    )).toBe('Yesterday')
  })

  it('formats invalid and missing dates safely', () => {
    expect(relativeDate(null, 'es', 'America/Havana', '2026-07-06T12:00:00.000Z')).toBe('Fecha no disponible')
    expect(relativeDate('invalid', 'en', 'America/Havana', '2026-07-06T12:00:00.000Z')).toBe('Date unavailable')
  })

  it('uses the profile timezone for deterministic fallback dates', () => {
    const value = '2026-01-15T23:30:00.000Z'
    const reference = '2026-07-06T12:00:00.000Z'
    const expectedEs = new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short', timeZone: 'Asia/Tokyo' }).format(new Date(value))
    const expectedEn = new Intl.DateTimeFormat('en-US', { day: 'numeric', month: 'short', timeZone: 'Asia/Tokyo' }).format(new Date(value))

    expect(relativeDate(value, 'es', 'Asia/Tokyo', reference)).toBe(expectedEs)
    expect(relativeDate(value, 'en', 'Asia/Tokyo', reference)).toBe(expectedEn)
    expect(relativeDate(value, 'en', 'Asia/Tokyo', reference)).toBe(expectedEn)
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
    expect(source).toContain('metrics.timeZone')
    expect(source).toContain('metrics.referenceInstant')
    const formatter = readFileSync(new URL('../dashboardFormatters.ts', import.meta.url), 'utf8')
    expect(formatter).not.toMatch(/new Date\(\)/)
    const page = readFileSync(new URL('../../../app/(app)/dashboard/page.tsx', import.meta.url), 'utf8')
    expect(page).toContain('timeZone: tz')
    expect(page).toContain('referenceInstant: referenceNow.toISOString()')
  })
})
