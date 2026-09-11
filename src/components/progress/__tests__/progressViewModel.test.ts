import { describe, expect, it } from 'vitest'
import { MAX_SESSION_REPS, MAX_SESSION_SETS, MAX_SESSION_WEIGHT_KG } from '@/lib/session/limits'
import { buildProgressSnapshot, normalizeProgressDayVolumes, summarizeProgressSetEvidence } from '../progressViewModel'

describe('progress snapshot', () => {
  it('uses only explicit valid strength sets within the completed-set count', () => {
    expect(summarizeProgressSetEvidence({
      setsCompleted: 2,
      weightsKg: [0, 40, 999],
      repsCompleted: [12, 8, 3],
    })).toEqual({
      bestSet: { weightKg: 40, reps: 8 },
      maxReps: 12,
      volumeKg: 320,
    })
  })

  it('does not turn timed or incomplete values into repetition results', () => {
    expect(summarizeProgressSetEvidence({ setsCompleted: 2, weightsKg: [0, 0], repsCompleted: [0, 0] })).toBeNull()
    expect(summarizeProgressSetEvidence({ setsCompleted: 1, weightsKg: [60], repsCompleted: [null] })).toBeNull()
    expect(summarizeProgressSetEvidence({ setsCompleted: 1, weightsKg: [null], repsCompleted: [10] })).toBeNull()
  })

  it('rejects evidence beyond the shared session limits', () => {
    expect(summarizeProgressSetEvidence({ setsCompleted: MAX_SESSION_SETS + 1, weightsKg: [20], repsCompleted: [8] })).toBeNull()
    expect(summarizeProgressSetEvidence({ setsCompleted: 1, weightsKg: [MAX_SESSION_WEIGHT_KG + 1], repsCompleted: [8] })).toBeNull()
    expect(summarizeProgressSetEvidence({ setsCompleted: 1, weightsKg: [20], repsCompleted: [MAX_SESSION_REPS + 1] })).toBeNull()
  })

  it('uses normalized session evidence for daily chart volume while preserving the day aggregate', () => {
    const days = [{ date: '2026-09-11', sessions: 2, volumeKg: 9999, durationMin: 40, logIds: ['a', 'b'], volumeRecorded: true }]
    const sessions = [
      { id: 'a', completedAt: '2026-09-11T10:00:00Z', date: '2026-09-11', durationMinutes: 20, volumeKg: 320 },
      { id: 'b', completedAt: '2026-09-11T18:00:00Z', date: '2026-09-11', durationMinutes: 20, volumeKg: 275 },
    ]
    expect(normalizeProgressDayVolumes(days, sessions)).toEqual([{ ...days[0], volumeKg: 595 }])
  })

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
