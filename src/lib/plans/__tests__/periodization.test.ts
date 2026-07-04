import { describe, expect, it } from 'vitest'
import { buildWeeklySummary } from '../periodization'

describe('buildWeeklySummary()', () => {
  it('computes adherence, average RPE and skipped exercises', () => {
    const summary = buildWeeklySummary({
      scheduledSessions: 4,
      completedSessions: 3,
      exerciseRows: [
        { exerciseName: 'Sentadilla', rpeValues: [7, 8], note: null },
        { exerciseName: 'Press Banca', rpeValues: [9], note: null },
        { exerciseName: 'Peso Muerto', rpeValues: [], note: 'Saltado: dolor lumbar.' },
        { exerciseName: 'Peso Muerto', rpeValues: [], note: 'Saltado: sin tiempo.' },
      ],
    })

    expect(summary.scheduledSessions).toBe(4)
    expect(summary.completedSessions).toBe(3)
    expect(summary.adherenceRatio).toBeCloseTo(0.75, 2)
    expect(summary.avgRpe).toBeCloseTo(8, 1)
    expect(summary.skippedExercises).toEqual([
      { name: 'Peso Muerto', count: 2, lastReason: 'sin tiempo' },
    ])
  })

  it('handles empty weeks', () => {
    const summary = buildWeeklySummary({
      scheduledSessions: 3,
      completedSessions: 0,
      exerciseRows: [],
    })

    expect(summary.adherenceRatio).toBe(0)
    expect(summary.avgRpe).toBeNull()
    expect(summary.skippedExercises).toEqual([])
  })
})
