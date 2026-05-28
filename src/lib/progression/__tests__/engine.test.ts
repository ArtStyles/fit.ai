import { describe, expect, it } from 'vitest'
import { buildProgressionSuggestion } from '../engine'
import type { ProgressionExerciseInput } from '../types'

const baseInput: ProgressionExerciseInput = {
  exerciseId: 'exercise-1',
  exerciseName: 'Bench Press',
  isCompound: true,
  targetSets: 3,
  targetReps: 10,
  targetRpe: 7,
  suggestedWeightKg: 40,
  previousLogCount: 2,
  status: 'completed',
  sets: [
    { weightKg: '40', reps: '10', rpe: 7, completed: true },
    { weightKg: '40', reps: '10', rpe: 7, completed: true },
    { weightKg: '40', reps: '10', rpe: 6, completed: true },
  ],
}

describe('progression engine', () => {
  it('increases weight when all targets are completed at or below target RPE', () => {
    const result = buildProgressionSuggestion(baseInput)

    expect(result?.action).toBe('increase')
    expect(result?.nextWeightKg).toBe(42.5)
    expect(result?.confidence).toBe('high')
  })

  it('holds weight when the target is completed but effort is above target', () => {
    const result = buildProgressionSuggestion({
      ...baseInput,
      sets: baseInput.sets.map(set => ({ ...set, rpe: 8 })),
    })

    expect(result?.action).toBe('hold')
    expect(result?.nextWeightKg).toBe(40)
  })

  it('decreases weight when reps are missed with very high effort', () => {
    const result = buildProgressionSuggestion({
      ...baseInput,
      sets: [
        { weightKg: '40', reps: '10', rpe: 9, completed: true },
        { weightKg: '40', reps: '8', rpe: 9, completed: true },
        { weightKg: '40', reps: '7', rpe: 10, completed: true },
      ],
    })

    expect(result?.action).toBe('decrease')
    expect(result?.nextWeightKg).toBe(37.5)
  })

  it('uses the first completed session as a baseline', () => {
    const result = buildProgressionSuggestion({
      ...baseInput,
      previousLogCount: 0,
    })

    expect(result?.action).toBe('baseline')
    expect(result?.nextWeightKg).toBe(40)
  })
})
