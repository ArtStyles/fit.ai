import { describe, expect, it } from 'vitest'
import { buildProgressSnapshot } from '../progressViewModel'

describe('progress snapshot', () => {
  it('compares two consecutive seven-day periods without sharing the boundary day', () => {
    const sessions = ['2026-08-27', '2026-08-28', '2026-09-03', '2026-09-04', '2026-09-10', '2026-09-11'].map((date, index) => ({ id: String(index), completedAt: `${date}T16:00:00Z`, date, durationMinutes: 20, volumeKg: 10 }))
    const snapshot = buildProgressSnapshot({ todayStr: '2026-09-10', weeks: 1, sessions, days: [], records: [], exercisePoints: [] })
    expect(snapshot).toMatchObject({ startDate: '2026-09-04', priorStart: '2026-08-28', priorEnd: '2026-09-03', volumeKg: 20, priorVolumeKg: 20 })
    expect(snapshot.selected.map(row => row.date)).toEqual(['2026-09-04', '2026-09-10'])
    expect(snapshot.weeklyBuckets).toHaveLength(1)
  })
  it('keeps comparison absent when the prior period has zero volume', () => {
    const snapshot = buildProgressSnapshot({
      todayStr: '2026-08-28',
      weeks: 4,
      sessions: [{ id: 'a', completedAt: '2026-08-20T10:00:00Z', date: '2026-08-20', durationMinutes: 40, volumeKg: 1000 }],
      days: [{ date: '2026-08-20', sessions: 1, volumeKg: 1000, durationMin: 40, logIds: ['a'] }],
      records: [],
      exercisePoints: [],
    })

    expect(snapshot.volumeDelta).toBeNull()
    expect(snapshot.comparisonLabel).toBe('none')
  })

  it('normalizes exercise change inside the same movement', () => {
    const snapshot = buildProgressSnapshot({
      todayStr: '2026-08-28',
      weeks: 4,
      sessions: [],
      days: [],
      records: [],
      exercisePoints: [
        { exerciseId: 'bench', exerciseName: 'Bench', date: '2026-08-02', maxWeightKg: 50, repsAtMaxWeight: 5, volumeKg: 500 },
        { exerciseId: 'bench', exerciseName: 'Bench', date: '2026-08-20', maxWeightKg: 55, repsAtMaxWeight: 5, volumeKg: 550 },
      ],
    })

    expect(snapshot.exerciseHighlights[0]).toMatchObject({ exerciseId: 'bench', changePercent: 10 })
  })

  it('builds one chronological bucket per requested week', () => {
    const snapshot = buildProgressSnapshot({
      todayStr: '2026-08-28',
      weeks: 4,
      sessions: [],
      days: [{ date: '2026-08-28', sessions: 2, volumeKg: 900, durationMin: 60, logIds: ['a', 'b'] }],
      records: [],
      exercisePoints: [],
    })

    expect(snapshot.weeklyBuckets).toHaveLength(4)
    expect(snapshot.weeklyBuckets.at(-1)).toMatchObject({ sessions: 2, trainedDays: 1, volumeKg: 900 })
  })
})
