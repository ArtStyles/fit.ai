import { describe, expect, it } from 'vitest'
import { buildHistoryEvidence } from '../historyViewModel'

describe('history evidence', () => {
  it('prefers a new record over a volume comparison', () => {
    const result = buildHistoryEvidence({
      todayStr: '2026-08-10',
      sessions: [
        { id: 'new', workoutId: 'w1', date: '2026-08-10', completedAt: '2026-08-10T10:00:00Z', workoutName: 'Push', focus: null, durationMinutes: 40 },
        { id: 'old', workoutId: 'w1', date: '2026-08-03', completedAt: '2026-08-03T10:00:00Z', workoutName: 'Push', focus: null, durationMinutes: 40 },
      ],
      exercises: [
        { progressLogId: 'new', exerciseId: 'bench', weightsKg: [60], repsCompleted: [5], rpeValues: [8], setsCompleted: 1 },
        { progressLogId: 'old', exerciseId: 'bench', weightsKg: [50], repsCompleted: [5], rpeValues: [7], setsCompleted: 1 },
      ],
    })

    expect(result.rows[0].signal).toMatchObject({ kind: 'record' })
  })

  it('compares volume only with the previous session of the same workout', () => {
    const result = buildHistoryEvidence({
      todayStr: '2026-08-10',
      sessions: [
        { id: 'new', workoutId: 'w1', date: '2026-08-10', completedAt: '2026-08-10T10:00:00Z', workoutName: 'Push', focus: null, durationMinutes: 40 },
        { id: 'other', workoutId: 'w2', date: '2026-08-08', completedAt: '2026-08-08T10:00:00Z', workoutName: 'Legs', focus: null, durationMinutes: 40 },
        { id: 'old', workoutId: 'w1', date: '2026-08-03', completedAt: '2026-08-03T10:00:00Z', workoutName: 'Push', focus: null, durationMinutes: 40 },
      ],
      exercises: [
        { progressLogId: 'new', exerciseId: 'bench', weightsKg: [50, 50], repsCompleted: [5, 5], rpeValues: null, setsCompleted: 2 },
        { progressLogId: 'other', exerciseId: 'squat', weightsKg: [100], repsCompleted: [10], rpeValues: null, setsCompleted: 1 },
        { progressLogId: 'old', exerciseId: 'bench', weightsKg: [50], repsCompleted: [5], rpeValues: null, setsCompleted: 1 },
      ],
    })

    expect(result.rows[0].signal).toEqual({ kind: 'volume', changePercent: 100 })
    expect(result.rows[2].signal).toBeNull()
  })
})
