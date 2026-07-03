import { describe, expect, it } from 'vitest'
import { carryForwardProgression, findStalledExerciseIds } from '..'
import type { EvidencePlan } from '..'

function plan(weightKg: number | null, reps = 8): EvidencePlan {
  return {
    display_name: 'Plan',
    ai_notes: '',
    days: [{
      day_number: 1,
      display_name: 'Día 1',
      focus: 'Fuerza',
      exercises: [{
        exercise_id: 'squat',
        sets: 3,
        reps,
        duration_seconds: null,
        rest_seconds: 120,
        target_rpe: 7,
        weight_kg: weightKg,
        weight_suggestion_basis: weightKg === null ? 'user_baseline_pending' : 'based_on_previous_logs',
        notes: null,
      }],
    }],
  }
}

describe('plan progression continuity', () => {
  it('carries earned weight and reps into a regenerated plan', () => {
    const result = carryForwardProgression(plan(null, 6), plan(82.5, 9))
    expect(result.days[0].exercises[0]).toMatchObject({
      sets: 3,
      reps: 9,
      weight_kg: 82.5,
      weight_suggestion_basis: 'based_on_previous_logs',
    })
  })

  it('does not copy targets to a replacement exercise', () => {
    const next = plan(null)
    next.days[0].exercises[0].exercise_id = 'leg-press'
    expect(carryForwardProgression(next, plan(82.5)).days[0].exercises[0].weight_kg).toBeNull()
  })
})

describe('stalled exercise detection', () => {
  const entry = (completedAt: string, weight: number, reps: number) => ({
    exerciseId: 'squat',
    completedAt,
    weightsKg: [weight, weight, weight],
    repsCompleted: [reps, reps, reps],
  })

  it('flags three sessions without load or rep progress', () => {
    expect(findStalledExerciseIds([
      entry('2026-07-03', 80, 8),
      entry('2026-06-26', 80, 8),
      entry('2026-06-19', 80, 8),
    ])).toEqual(['squat'])
  })

  it('does not flag an exercise when reps improved at the same weight', () => {
    expect(findStalledExerciseIds([
      entry('2026-07-03', 80, 10),
      entry('2026-06-26', 80, 9),
      entry('2026-06-19', 80, 8),
    ])).toEqual([])
  })
})
