import { describe, expect, it } from 'vitest'
import { summarizeChanges, validateAdjustmentChanges } from '../adjustments'
import type { AdjustmentContext } from '../adjustments'

const VALID_IDS = new Set(['we-1', 'we-2', 'we-3'])

const CONTEXT: AdjustmentContext = {
  workoutName: 'Push — Pecho',
  workoutFocus: 'Pecho · Tríceps',
  exercises: [
    { workoutExerciseId: 'we-1', name: 'Press Banca', sets: 3, reps: 8, targetRpe: 7 },
    { workoutExerciseId: 'we-2', name: 'Press Militar', sets: 3, reps: 10, targetRpe: 7 },
    { workoutExerciseId: 'we-3', name: 'Cable Fly', sets: 3, reps: 12, targetRpe: 8 },
  ],
}

describe('validateAdjustmentChanges()', () => {
  it('accepts well-formed updates and removals', () => {
    const changes = validateAdjustmentChanges([
      { type: 'update_exercise', workoutExerciseId: 'we-1', sets: 4, targetRpe: 8 },
      { type: 'remove_exercise', workoutExerciseId: 'we-3' },
    ], VALID_IDS)

    expect(changes).toEqual([
      { type: 'update_exercise', workoutExerciseId: 'we-1', sets: 4, targetRpe: 8 },
      { type: 'remove_exercise', workoutExerciseId: 'we-3' },
    ])
  })

  it('drops changes that reference unknown exercises', () => {
    const changes = validateAdjustmentChanges([
      { type: 'update_exercise', workoutExerciseId: 'we-999', sets: 4 },
      { type: 'remove_exercise', workoutExerciseId: 'we-2' },
    ], VALID_IDS)

    expect(changes).toEqual([{ type: 'remove_exercise', workoutExerciseId: 'we-2' }])
  })

  it('clamps values to sane bounds', () => {
    const changes = validateAdjustmentChanges([
      { type: 'update_exercise', workoutExerciseId: 'we-1', sets: 99, reps: 500, targetRpe: 14, restSeconds: 5 },
    ], VALID_IDS)

    expect(changes).toEqual([
      { type: 'update_exercise', workoutExerciseId: 'we-1', sets: 10, reps: 100, targetRpe: 10, restSeconds: 15 },
    ])
  })

  it('drops updates with no usable fields, malformed items and non-arrays', () => {
    expect(validateAdjustmentChanges([
      { type: 'update_exercise', workoutExerciseId: 'we-1' },
      { type: 'update_exercise', workoutExerciseId: 'we-2', sets: 'cuatro' },
      { type: 'destroy_database', workoutExerciseId: 'we-1' },
      'nonsense',
      null,
    ], VALID_IDS)).toEqual([])

    expect(validateAdjustmentChanges('not an array', VALID_IDS)).toEqual([])
    expect(validateAdjustmentChanges(undefined, VALID_IDS)).toEqual([])
  })

  it('keeps only the first change per exercise', () => {
    const changes = validateAdjustmentChanges([
      { type: 'update_exercise', workoutExerciseId: 'we-1', sets: 4 },
      { type: 'remove_exercise', workoutExerciseId: 'we-1' },
    ], VALID_IDS)

    expect(changes).toEqual([
      { type: 'update_exercise', workoutExerciseId: 'we-1', sets: 4 },
    ])
  })
})

describe('summarizeChanges()', () => {
  it('describes updates and removals in Spanish using exercise names', () => {
    const summary = summarizeChanges([
      { type: 'update_exercise', workoutExerciseId: 'we-1', sets: 4, targetRpe: 8 },
      { type: 'update_exercise', workoutExerciseId: 'we-2', restSeconds: 60 },
      { type: 'remove_exercise', workoutExerciseId: 'we-3' },
    ], CONTEXT)

    expect(summary).toEqual([
      'Press Banca → 4 series, RPE 8',
      'Press Militar → descanso 60 s',
      'Quitar Cable Fly',
    ])
  })
})
