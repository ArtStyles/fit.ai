import { describe, expect, it } from 'vitest'
import {
  applyDeloadToPlan,
  buildWeeklySummary,
  describeCyclePhase,
  describeWeeklySummary,
  getCyclePhase,
} from '../periodization'
import type { AIPlan } from '@/lib/ai/types'

describe('getCyclePhase()', () => {
  it('cycles build → build → intensify → deload every 4 weeks', () => {
    expect(getCyclePhase(1)).toBe('build')
    expect(getCyclePhase(2)).toBe('build')
    expect(getCyclePhase(3)).toBe('intensify')
    expect(getCyclePhase(4)).toBe('deload')
    expect(getCyclePhase(5)).toBe('build')
    expect(getCyclePhase(8)).toBe('deload')
  })
})

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
        { exerciseName: 'Curl', rpeValues: [null], note: 'Agregado solo por hoy.' },
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

describe('describeWeeklySummary()', () => {
  it('renders a Spanish summary with adherence and skips', () => {
    const text = describeWeeklySummary({
      scheduledSessions: 4,
      completedSessions: 3,
      adherenceRatio: 0.75,
      avgRpe: 8.2,
      skippedExercises: [{ name: 'Peso Muerto', count: 2, lastReason: 'dolor lumbar' }],
    })

    expect(text).toContain('3/4')
    expect(text).toContain('8.2')
    expect(text).toContain('Peso Muerto')
    expect(text).toContain('dolor lumbar')
  })
})

describe('describeCyclePhase()', () => {
  it('explains the deload week', () => {
    const text = describeCyclePhase('deload', 4)

    expect(text.toLowerCase()).toContain('descarga')
  })
})

describe('applyDeloadToPlan()', () => {
  const plan: AIPlan = {
    display_name: 'Plan Test',
    ai_notes: 'Notas.',
    days: [
      {
        day_number: 1,
        display_name: 'Push',
        focus: 'Pecho',
        exercises: [
          {
            exercise_id: 'ex-1',
            sets: 4,
            reps: 8,
            duration_seconds: null,
            rest_seconds: 90,
            target_rpe: 8,
            weight_kg: 40,
            weight_suggestion_basis: 'based_on_previous_logs',
            notes: null,
          },
          {
            exercise_id: 'ex-2',
            sets: 3,
            reps: 12,
            duration_seconds: null,
            rest_seconds: 60,
            target_rpe: 9,
            weight_kg: null,
            weight_suggestion_basis: 'user_baseline_pending',
            notes: null,
          },
        ],
      },
    ],
  }

  it('cuts volume and caps effort without touching exercise selection', () => {
    const deloaded = applyDeloadToPlan(plan)

    const [first, second] = deloaded.days[0].exercises
    expect(first.sets).toBe(3)        // ceil(4 × 0.6)
    expect(second.sets).toBe(2)       // ceil(3 × 0.6)
    expect(first.target_rpe).toBeLessThanOrEqual(6)
    expect(second.target_rpe).toBeLessThanOrEqual(6)
    expect(first.exercise_id).toBe('ex-1')
    expect(first.reps).toBe(8)
    expect(first.weight_kg).toBe(40)
  })

  it('does not mutate the original plan', () => {
    applyDeloadToPlan(plan)

    expect(plan.days[0].exercises[0].sets).toBe(4)
    expect(plan.days[0].exercises[0].target_rpe).toBe(8)
  })
})
