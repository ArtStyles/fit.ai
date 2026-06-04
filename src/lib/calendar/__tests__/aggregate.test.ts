import { describe, it, expect } from 'vitest'
import {
  aggregateLogsToDays,
  shiftDateStr,
  daysBetween,
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
