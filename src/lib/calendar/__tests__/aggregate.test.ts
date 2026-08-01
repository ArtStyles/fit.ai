import { describe, it, expect } from 'vitest'
import {
  aggregateLogsToDays,
  shiftDateStr,
  daysBetween,
  computeIntensityThresholds,
  intensityLevel,
  computeStreaks,
  computeCalendarStats,
  buildMonthGrid,
  buildHeatmapWeeks,
  buildCalendarSessionPayload,
} from '../aggregate'

describe('shiftDateStr', () => {
  it('moves forward and backward across month boundaries', () => {
    expect(shiftDateStr('2026-01-31', 1)).toBe('2026-02-01')
    expect(shiftDateStr('2026-03-01', -1)).toBe('2026-02-28')
  })
})

describe('daysBetween', () => {
  it('counts whole days inclusive of direction', () => {
    expect(daysBetween('2026-01-01', '2026-01-08')).toBe(7)
    expect(daysBetween('2026-01-08', '2026-01-01')).toBe(-7)
  })
})

describe('aggregateLogsToDays', () => {
  const TZ = 'America/Havana'

  it('groups logs by local day and sums volume + duration', () => {
    const logs = [
      { id: 'a', completed_at: '2026-02-10T15:00:00Z', duration_minutes: 50 },
      { id: 'b', completed_at: '2026-02-10T20:00:00Z', duration_minutes: 30 },
      { id: 'c', completed_at: '2026-02-12T15:00:00Z', duration_minutes: 40 },
    ]
    const exerciseLogs = [
      { progress_log_id: 'a', weights_kg: [100, 100], reps_completed: [5, 5] }, // 1000
      { progress_log_id: 'b', weights_kg: [50], reps_completed: [10] },         // 500
      { progress_log_id: 'c', weights_kg: [60], reps_completed: [10] },         // 600
    ]
    const result = aggregateLogsToDays(logs, exerciseLogs, TZ)

    expect(result).toHaveLength(2)
    expect(result[0]).toMatchObject({ date: '2026-02-10', sessions: 2, volumeKg: 1500, durationMin: 80 })
    expect(result[0].logIds).toEqual(['b', 'a']) // newest first within the day
    expect(result[1]).toMatchObject({ date: '2026-02-12', sessions: 1, volumeKg: 600, durationMin: 40 })
  })

  it('returns days sorted ascending and tolerates null arrays', () => {
    const logs = [
      { id: 'x', completed_at: '2026-02-05T12:00:00Z', duration_minutes: null },
      { id: 'y', completed_at: '2026-01-05T12:00:00Z', duration_minutes: 20 },
    ]
    const result = aggregateLogsToDays(logs, [{ progress_log_id: 'x', weights_kg: null, reps_completed: null }], TZ)
    expect(result.map(d => d.date)).toEqual(['2026-01-05', '2026-02-05'])
    expect(result[1]).toMatchObject({ volumeKg: 0, durationMin: 0 })
  })
})

describe('buildCalendarSessionPayload', () => {
  it('derives daily aggregates and one complete summary per session', () => {
    const result = buildCalendarSessionPayload(
      [{
        id: 'session-1',
        workout_id: 'workout-1',
        completed_at: '2026-08-12T18:00:00Z',
        duration_minutes: 45,
        workout: { name: 'Push', focus: 'Pecho' },
      }],
      [
        { progress_log_id: 'session-1', sets_completed: 3, weights_kg: [50, 50, 50], reps_completed: [10, 8, 6] },
        { progress_log_id: 'session-1', sets_completed: 2, weights_kg: [20, 20], reps_completed: [12, 12] },
      ],
      'America/Havana',
    )

    expect(result.days).toEqual([{
      date: '2026-08-12',
      sessions: 1,
      durationMin: 45,
      volumeKg: 1680,
      logIds: ['session-1'],
    }])
    expect(result.sessions).toEqual([{
      id: 'session-1',
      date: '2026-08-12',
      completedAt: '2026-08-12T18:00:00Z',
      workoutName: 'Push',
      focus: 'Pecho',
      durationMin: 45,
      sets: 5,
      volumeKg: 1680,
    }])
  })
})

describe('computeIntensityThresholds + intensityLevel', () => {
  const days = Array.from({ length: 8 }, (_, i) => ({
    date: `2026-02-0${i + 1}`,
    sessions: 1,
    volumeKg: (i + 1) * 100, // 100..800
    durationMin: 30,
    logIds: ['l'],
  }))

  it('derives p25/p50/p75 from trained-day volumes (ignoring zeros)', () => {
    const t = computeIntensityThresholds(days)
    expect(t).toEqual([300, 500, 700])
  })

  it('maps volume to levels 1..4 (a trained day is never level 0)', () => {
    const t = computeIntensityThresholds(days)
    expect(intensityLevel(0, t)).toBe(1)
    expect(intensityLevel(300, t)).toBe(1)
    expect(intensityLevel(400, t)).toBe(2)
    expect(intensityLevel(600, t)).toBe(3)
    expect(intensityLevel(800, t)).toBe(4)
  })

  it('returns zero thresholds when there is no positive volume', () => {
    expect(computeIntensityThresholds([])).toEqual([0, 0, 0])
  })
})

describe('computeStreaks', () => {
  it('counts current streak through today', () => {
    const dates = new Set(['2026-02-08', '2026-02-09', '2026-02-10'])
    expect(computeStreaks(dates, '2026-02-10')).toEqual({ current: 3, max: 3 })
  })

  it('keeps the current streak when today is not trained but yesterday was', () => {
    const dates = new Set(['2026-02-08', '2026-02-09'])
    expect(computeStreaks(dates, '2026-02-10').current).toBe(2)
  })

  it('breaks the current streak after a full missed day', () => {
    const dates = new Set(['2026-02-01', '2026-02-02', '2026-02-08'])
    const result = computeStreaks(dates, '2026-02-10')
    expect(result.current).toBe(0)
    expect(result.max).toBe(2)
  })
})

describe('computeCalendarStats', () => {
  it('summarises trained days, streaks, average per week and volume', () => {
    const days = [
      { date: '2026-02-02', sessions: 1, volumeKg: 1000, durationMin: 60, logIds: ['a'] },
      { date: '2026-02-04', sessions: 1, volumeKg: 1500, durationMin: 50, logIds: ['b'] },
    ]
    const stats = computeCalendarStats(days, '2026-02-08')
    expect(stats.trainedDays).toBe(2)
    expect(stats.totalVolumeKg).toBe(2500)
    expect(stats.maxStreak).toBe(1)
    expect(stats.avgPerWeek).toBe(2) // 2 días en una semana de span
  })

  it('returns zeros for an empty history', () => {
    expect(computeCalendarStats([], '2026-02-08')).toEqual({
      trainedDays: 0, currentStreak: 0, maxStreak: 0, avgPerWeek: 0, totalVolumeKg: 0,
    })
  })
})

describe('buildMonthGrid', () => {
  it('pads to whole weeks, Monday-first, and flags today/future', () => {
    // Febrero 2026: 1 de feb es domingo → 6 huecos iniciales (L..S)
    const cells = buildMonthGrid(2026, 2, '2026-02-15')
    expect(cells.length % 7).toBe(0)
    expect(cells.slice(0, 6).every(c => c.date === null)).toBe(true)
    expect(cells[6]).toMatchObject({ date: '2026-02-01', dayNum: 1 })

    const today = cells.find(c => c.date === '2026-02-15')
    expect(today?.isToday).toBe(true)
    expect(cells.find(c => c.date === '2026-02-20')?.isFuture).toBe(true)
    expect(cells.find(c => c.date === '2026-02-10')?.isFuture).toBe(false)
  })
})

describe('buildHeatmapWeeks', () => {
  it('returns Monday-first columns covering from..to with future padding as null', () => {
    const weeks = buildHeatmapWeeks('2026-02-04', '2026-02-15') // mié → dom
    expect(weeks).toHaveLength(2)
    expect(weeks[0][0]).toBe('2026-02-02') // lunes de la primera semana
    expect(weeks[0][6]).toBe('2026-02-08') // domingo
    expect(weeks[1][0]).toBe('2026-02-09')
    expect(weeks[1][6]).toBe('2026-02-15')
  })

  it('fills days after toDate with null', () => {
    const weeks = buildHeatmapWeeks('2026-02-09', '2026-02-11') // lun → mié
    expect(weeks).toHaveLength(1)
    expect(weeks[0].slice(0, 3)).toEqual(['2026-02-09', '2026-02-10', '2026-02-11'])
    expect(weeks[0].slice(3)).toEqual([null, null, null, null])
  })
})
