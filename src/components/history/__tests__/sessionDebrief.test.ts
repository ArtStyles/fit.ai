import { describe, expect, it } from 'vitest'
import { buildSessionDebrief, readFreeTrainingDurations } from '../sessionDebrief'

describe('session debrief', () => {
  it('preserves missing imported measures and every recorded set without fabricating weighted evidence', () => {
    const importedSets = [
      { weightKg: null, reps: null, durationSeconds: 40, distanceMeters: 120, rpe: null, kind: 'warmup', notes: 'Suave' },
      { weightKg: null, reps: 8, durationSeconds: null, distanceMeters: null, rpe: 7, kind: 'failure', notes: '' },
    ]
    const result = buildSessionDebrief({ durationMinutes: 0, exercises: [{ id: 'import', exerciseId: 'walk', exerciseName: 'Walking', muscleGroups: [], setsCompleted: 2, weightsKg: [null, null], repsCompleted: [null, 8], rpeValues: [null, 7], notes: null, importedSets }], previousByExercise: new Map() })
    expect(result.exercises[0]).toMatchObject({ importedSets, bestSet: null, comparison: null, isRecord: false, completedSets: 2, totalDurationSeconds: 40, volumeRecorded: false })
    expect(result.exercises[0].sets).toEqual([])
    expect(result.totalSets).toBe(2)
  })
  it('calculates imported weighted evidence only from complete pairs, retaining genuine zero weight', () => {
    const importedSets = [
      { weightKg: 100, reps: null, durationSeconds: null, distanceMeters: null, rpe: null, kind: 'normal', notes: '' },
      { weightKg: 0, reps: 12, durationSeconds: null, distanceMeters: null, rpe: 7, kind: 'drop', notes: '' },
      { weightKg: 20, reps: 8, durationSeconds: null, distanceMeters: null, rpe: 8, kind: 'normal', notes: '' },
    ]
    const result = buildSessionDebrief({ durationMinutes: 0, exercises: [{ id: 'import', exerciseId: 'bench', exerciseName: 'Bench', muscleGroups: [], setsCompleted: 3, weightsKg: [100, 0, 20], repsCompleted: [null, 12, 8], rpeValues: [null, 7, 8], notes: null, importedSets }], previousByExercise: new Map() })
    expect(result.exercises[0]).toMatchObject({ volumeKg: 160, volumeRecorded: true, bestSet: { weightKg: 20, reps: 8 }, completedSets: 3 })
  })
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
