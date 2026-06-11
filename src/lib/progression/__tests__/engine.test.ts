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
    expect(result?.progressionType).toBe('weight')
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

describe('progression engine — stall detection', () => {
  const stalledHoldInput: ProgressionExerciseInput = {
    ...baseInput,
    // Objetivo completado pero con RPE por encima del target → hold normal
    sets: baseInput.sets.map(set => ({ ...set, rpe: 8 })),
    previousLogCount: 4,
    recentMaxWeightsKg: [40, 40, 40],
  }

  it('suggests a deload after three sessions stuck at the same weight', () => {
    const result = buildProgressionSuggestion(stalledHoldInput)

    expect(result?.action).toBe('decrease')
    expect(result?.stalled).toBe(true)
    // 40 × 0.9 = 36 → redondeado hacia abajo al incremento compuesto (2.5)
    expect(result?.nextWeightKg).toBe(35)
    expect(result?.confidence).toBe('medium')
  })

  it('does not flag a stall when recent sessions show progress', () => {
    const result = buildProgressionSuggestion({
      ...stalledHoldInput,
      recentMaxWeightsKg: [40, 37.5, 35],
    })

    expect(result?.action).toBe('hold')
    expect(result?.stalled).toBeUndefined()
  })

  it('does not flag a stall without enough history', () => {
    const result = buildProgressionSuggestion({
      ...stalledHoldInput,
      previousLogCount: 2,
      recentMaxWeightsKg: [40, 40],
    })

    expect(result?.action).toBe('hold')
  })

  it('flags a stall when reps keep falling short at the same weight', () => {
    const result = buildProgressionSuggestion({
      ...stalledHoldInput,
      sets: [
        { weightKg: '40', reps: '10', rpe: 7, completed: true },
        { weightKg: '40', reps: '8', rpe: 7, completed: true },
        { weightKg: '40', reps: '7', rpe: 7, completed: true },
      ],
    })

    expect(result?.action).toBe('decrease')
    expect(result?.stalled).toBe(true)
  })
})

describe('progression engine — bodyweight (rep progression)', () => {
  const bodyweightInput: ProgressionExerciseInput = {
    ...baseInput,
    exerciseName: 'Pull Up',
    isCompound: true,
    targetReps: 8,
    suggestedWeightKg: null,
    sets: [
      { weightKg: '', reps: '8', rpe: 7, completed: true },
      { weightKg: '', reps: '8', rpe: 7, completed: true },
      { weightKg: '', reps: '8', rpe: 6, completed: true },
    ],
  }

  it('progresses reps when the target is completed at or below target RPE', () => {
    const result = buildProgressionSuggestion(bodyweightInput)

    expect(result?.progressionType).toBe('reps')
    expect(result?.action).toBe('increase')
    expect(result?.currentTargetReps).toBe(8)
    expect(result?.nextTargetReps).toBe(9)
    expect(result?.nextWeightKg).toBeNull()
    expect(result?.confidence).toBe('high')
  })

  it('uses the first bodyweight session as a rep baseline', () => {
    const result = buildProgressionSuggestion({
      ...bodyweightInput,
      previousLogCount: 0,
    })

    expect(result?.progressionType).toBe('reps')
    expect(result?.action).toBe('baseline')
    expect(result?.nextTargetReps).toBe(8)
  })

  it('lowers the rep target when effort is too high', () => {
    const result = buildProgressionSuggestion({
      ...bodyweightInput,
      sets: bodyweightInput.sets.map(set => ({ ...set, rpe: 9 })),
    })

    expect(result?.action).toBe('decrease')
    expect(result?.nextTargetReps).toBe(7)
  })

  it('holds reps without RPE data', () => {
    const result = buildProgressionSuggestion({
      ...bodyweightInput,
      sets: bodyweightInput.sets.map(set => ({ ...set, rpe: null })),
    })

    expect(result?.action).toBe('hold')
    expect(result?.confidence).toBe('low')
    expect(result?.nextTargetReps).toBe(8)
  })

  it('suggests a harder variation at the rep cap instead of more reps', () => {
    const result = buildProgressionSuggestion({
      ...bodyweightInput,
      targetReps: 30,
      sets: [
        { weightKg: '', reps: '30', rpe: 6, completed: true },
        { weightKg: '', reps: '30', rpe: 6, completed: true },
        { weightKg: '', reps: '30', rpe: 6, completed: true },
      ],
    })

    expect(result?.action).toBe('hold')
    expect(result?.nextTargetReps).toBe(30)
    expect(result?.reason).toMatch(/variante|lastre/i)
  })

  it('still asks for a weight baseline when neither weight nor reps were logged', () => {
    const result = buildProgressionSuggestion({
      ...bodyweightInput,
      sets: [{ weightKg: '', reps: '', rpe: null, completed: true }],
    })

    expect(result?.action).toBe('baseline')
    expect(result?.progressionType).toBe('weight')
    expect(result?.nextWeightKg).toBeNull()
  })
})
