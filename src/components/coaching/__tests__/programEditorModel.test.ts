import { describe, expect, it } from 'vitest'
import { moveItem, summarizeRoutine, summarizeWorkout } from '../program-editor/model'
import type { TemplateWorkoutView } from '../program-editor/types'

const workouts: TemplateWorkoutView[] = [
  {
    id: 'day-a',
    name: 'Día A',
    day_of_week: 1,
    order_in_plan: 1,
    exercises: [
      {
        id: 'squat', exercise_id: 'exercise-squat', order_index: 1,
        sets: 3, reps: 10, weight_kg: null, target_rpe: 7,
        rest_seconds: 60, notes: null,
      },
      {
        id: 'deadlift', exercise_id: 'exercise-deadlift', order_index: 2,
        sets: 4, reps: 6, weight_kg: null, target_rpe: 8,
        rest_seconds: 90, notes: null,
      },
    ],
  },
  {
    id: 'day-b',
    name: 'Día B',
    day_of_week: 4,
    order_in_plan: 2,
    exercises: [{
      id: 'press', exercise_id: 'exercise-press', order_index: 1,
      sets: 3, reps: 8, weight_kg: null, target_rpe: 7,
      rest_seconds: 60, notes: null,
    }],
  },
]

describe('program editor model', () => {
  it('summarizes routine volume with the explicit guidance estimate', () => {
    expect(summarizeRoutine(workouts)).toEqual({
      days: 2,
      exercises: 3,
      sets: 10,
      estimatedMinutes: 32,
    })
  })

  it('summarizes one active workout', () => {
    expect(summarizeWorkout(workouts[0])).toEqual({
      days: 1,
      exercises: 2,
      sets: 7,
      estimatedMinutes: 22,
    })
  })

  it('moves one item by the requested delta without mutating the input', () => {
    const source = ['a', 'b', 'c']

    expect(moveItem(source, 1, -1)).toEqual(['b', 'a', 'c'])
    expect(source).toEqual(['a', 'b', 'c'])
  })

  it('keeps the list unchanged when movement crosses a boundary', () => {
    expect(moveItem(['a', 'b', 'c'], 0, -1)).toEqual(['a', 'b', 'c'])
  })
})
