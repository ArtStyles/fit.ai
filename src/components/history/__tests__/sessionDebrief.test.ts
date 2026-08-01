import { describe, expect, it } from 'vitest'
import { buildSessionDebrief } from '../sessionDebrief'

describe('session debrief', () => {
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
