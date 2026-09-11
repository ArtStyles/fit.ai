import { describe, expect, it } from 'vitest'
import { buildSessionDebrief, readFreeTrainingDurations } from '../sessionDebrief'

describe('session debrief', () => {
  it('keeps recorded timed series without a fabricated weight comparison or best weighted set', () => {
    const result = buildSessionDebrief({ durationMinutes: 5, exercises: [
      { id: 'timed', exerciseId: 'walk', exerciseName: 'Walking', muscleGroups: [], setsCompleted: 2, weightsKg: [0, 0], repsCompleted: [0, 0], rpeValues: [null, null], notes: null, durationSeconds: [45, 30] },
    ], previousByExercise: new Map([['walk', { weightsKg: [0], repsCompleted: [0], rpeValues: [null] }]]), priorBestByExercise: new Map([['walk', { weightKg: 0, reps: 0 }]]) })
    expect(result.exercises[0]).toMatchObject({ timed: true, totalDurationSeconds: 75, bestSet: null, comparison: null, isRecord: false, completedSets: 2 })
    expect(result.exercises[0].sets.map(set => set.durationSeconds)).toEqual([45, 30])
  })
  it('reads exact free-training durations and never divides a guided aggregate into series', () => {
    const record = { mobile_session_kind: 'free', mobile_free_training: { exercises: [{ exerciseId: 'walk', sets: [{ weightKg: 0, reps: 0, durationSeconds: 45 }, { weightKg: 0, reps: 0, durationSeconds: 30 }] }] } }
    expect(readFreeTrainingDurations(record, 'walk', 2)).toEqual([45, 30])
    expect(readFreeTrainingDurations(record, 'walk', 3)).toBeNull()
    expect(readFreeTrainingDurations({ duration_seconds: 75 }, 'walk', 2)).toBeNull()
    expect(readFreeTrainingDurations({ ...record, mobile_session_kind: 'guided' }, 'walk', 2)).toBeNull()
    expect(readFreeTrainingDurations({ mobile_session_kind: 'free', mobile_free_training: { exercises: [{ exerciseId: 'walk', sets: [{ weightKg: 0, reps: 0, durationSeconds: -1 }] }] } }, 'walk', 1)).toBeNull()
  })
  it('excludes skipped exercises and compares the immediately previous appearance', () => {
    const result = buildSessionDebrief({
      durationMinutes: 50,
      exercises: [
        { id: 'current', exerciseId: 'bench', exerciseName: 'Bench', muscleGroups: ['Chest'], setsCompleted: 2, weightsKg: [60, 60], repsCompleted: [5, 5], rpeValues: [8, 8], notes: null },
        { id: 'skip', exerciseId: 'row', exerciseName: 'Row', muscleGroups: ['Back'], setsCompleted: 0, weightsKg: [], repsCompleted: [], rpeValues: [], notes: 'Saltado: dolor' },
      ],
      previousByExercise: new Map([
        ['bench', { weightsKg: [55], repsCompleted: [5], rpeValues: [7] }],
      ]),
    })

    expect(result.totalSets).toBe(2)
    expect(result.skippedCount).toBe(1)
    expect(result.exercises[0].comparison?.weightDeltaKg).toBe(5)
  })

  it('uses all-time prior best only for the record flag', () => {
    const result = buildSessionDebrief({
      durationMinutes: 35,
      exercises: [
        { id: 'current', exerciseId: 'bench', exerciseName: 'Bench', muscleGroups: ['Chest'], setsCompleted: 1, weightsKg: [60], repsCompleted: [5], rpeValues: [8], notes: null },
      ],
      previousByExercise: new Map([
        ['bench', { weightsKg: [55], repsCompleted: [5], rpeValues: [7] }],
      ]),
      priorBestByExercise: new Map([['bench', { weightKg: 65, reps: 3 }]]),
    })

    expect(result.exercises[0].comparison?.weightDeltaKg).toBe(5)
    expect(result.exercises[0].isRecord).toBe(false)
  })
})
