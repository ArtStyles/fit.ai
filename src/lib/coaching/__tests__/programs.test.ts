import { describe, expect, it } from 'vitest'
import {
  buildTrainerProgramSnapshot,
  parseTrainerProgramSnapshot,
  type TrainerProgramSnapshotInput,
} from '../programs'

const ids = {
  workoutMonday: '11111111-1111-4111-8111-111111111111',
  workoutThursday: '22222222-2222-4222-8222-222222222222',
  squat: '33333333-3333-4333-8333-333333333333',
  row: '44444444-4444-4444-8444-444444444444',
  squatExercise: '55555555-5555-4555-8555-555555555555',
  rowExercise: '66666666-6666-4666-8666-666666666666',
}

function validInput(): TrainerProgramSnapshotInput {
  return {
    name: ' Fuerza base ',
    goal: ' ganar fuerza ',
    description: '  ',
    daysPerWeek: 2,
    allowedExerciseIds: new Set([ids.squatExercise, ids.rowExercise]),
    workouts: [
      {
        sourceTemplateWorkoutId: ids.workoutThursday,
        name: ' Tirón ',
        dayOfWeek: 4,
        orderInPlan: 2,
        exercises: [{
          sourceTemplateExerciseId: ids.row,
          exerciseId: ids.rowExercise,
          orderIndex: 2,
          sets: 3,
          reps: 10,
          weightKg: 40,
          targetRpe: 7,
          restSeconds: 90,
          notes: ' espalda ',
        }],
      },
      {
        sourceTemplateWorkoutId: ids.workoutMonday,
        name: ' Pierna ',
        dayOfWeek: 1,
        orderInPlan: 1,
        exercises: [{
          sourceTemplateExerciseId: ids.squat,
          exerciseId: ids.squatExercise,
          orderIndex: 1,
          sets: 4,
          reps: 6,
          weightKg: null,
          targetRpe: null,
          restSeconds: 120,
          notes: '  ',
        }],
      },
    ],
  }
}

describe('trainer program snapshots', () => {
  it('normalizes, sorts, and freezes a deterministic V1 snapshot', () => {
    const snapshot = buildTrainerProgramSnapshot(validInput())

    expect(snapshot).toEqual({
      schemaVersion: 1,
      name: 'Fuerza base',
      goal: 'ganar fuerza',
      description: null,
      daysPerWeek: 2,
      workouts: [
        expect.objectContaining({ sourceTemplateWorkoutId: ids.workoutMonday, name: 'Pierna', dayOfWeek: 1 }),
        expect.objectContaining({ sourceTemplateWorkoutId: ids.workoutThursday, name: 'Tirón', dayOfWeek: 4 }),
      ],
    })
    expect(snapshot.workouts[0].exercises[0].notes).toBeNull()
    expect(Object.isFrozen(snapshot)).toBe(true)
    expect(Object.isFrozen(snapshot.workouts)).toBe(true)
    expect(Object.isFrozen(snapshot.workouts[0].exercises[0])).toBe(true)
  })

  it.each([
    ['duplicate workout days', { daysPerWeek: 2, workouts: [{ dayOfWeek: 1 }, { dayOfWeek: 1 }] }],
    ['an out-of-range day', { daysPerWeek: 1, workouts: [{ dayOfWeek: 8 }] }],
    ['a mismatched days-per-week count', { daysPerWeek: 1, workouts: [{}, {}] }],
    ['a non-UUID source id', { workouts: [{ sourceTemplateWorkoutId: 'not-a-uuid' }] }],
    ['an exercise outside the allowed catalog', { workouts: [{ exercises: [{ exerciseId: ids.workoutMonday }] }] }],
    ['an infinite numeric prescription', { workouts: [{ exercises: [{ sets: Number.POSITIVE_INFINITY }] }] }],
  ])('rejects %s', (_label, patch) => {
    const input = validInput()
    const firstWorkout = input.workouts[0]
    const firstExercise = firstWorkout.exercises[0]
    const supplied = patch as { daysPerWeek?: number; workouts?: Array<{ dayOfWeek?: number; sourceTemplateWorkoutId?: string; exercises?: Array<{ exerciseId?: string; sets?: number }> }> }
    if (supplied.daysPerWeek !== undefined) input.daysPerWeek = supplied.daysPerWeek
    if (supplied.workouts) {
      input.workouts = supplied.workouts.map((item, index) => ({
        ...input.workouts[index % input.workouts.length],
        ...item,
        exercises: item.exercises
          ? item.exercises.map(exercise => ({ ...firstExercise, ...exercise }))
          : input.workouts[index % input.workouts.length].exercises,
      }))
    }
    expect(() => buildTrainerProgramSnapshot(input)).toThrow('TRAINER_PROGRAM_SNAPSHOT_INVALID')
  })

  it('accepts only the exact V1 shape and returns an independent immutable copy', () => {
    const built = buildTrainerProgramSnapshot(validInput())
    const parsed = parseTrainerProgramSnapshot(JSON.parse(JSON.stringify(built)))

    expect(parsed).toEqual(built)
    expect(parsed).not.toBe(built)
    expect(() => parseTrainerProgramSnapshot({ ...built, schemaVersion: 2 })).toThrow('TRAINER_PROGRAM_SNAPSHOT_INVALID')
    expect(() => parseTrainerProgramSnapshot({ ...built, extra: true })).toThrow('TRAINER_PROGRAM_SNAPSHOT_INVALID')
    expect(() => parseTrainerProgramSnapshot(JSON.parse('{"__proto__":{"polluted":true}}'))).toThrow('TRAINER_PROGRAM_SNAPSHOT_INVALID')
  })
})
