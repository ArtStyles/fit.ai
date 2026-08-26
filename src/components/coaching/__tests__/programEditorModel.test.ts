import { describe, expect, it } from 'vitest'
import {
  moveItem,
  shouldPruneTemplateExerciseDraft,
  summarizeRoutine,
  summarizeWorkout,
  templateExerciseDraftMatches,
} from '../program-editor/model'
import type { TemplateExerciseDraft, TemplateExerciseView, TemplateWorkoutView } from '../program-editor/types'

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

const persistedExercise: TemplateExerciseView = {
  id: 'template-exercise',
  exercise_id: 'exercise-a',
  order_index: 1,
  sets: 5,
  reps: 12,
  weight_kg: 82.5,
  target_rpe: 8,
  rest_seconds: 75,
  notes: null,
  exercise: null,
}

const originalExerciseDraft: TemplateExerciseDraft = {
  exerciseId: 'exercise-a',
  sets: '3',
  reps: '10',
  weightKg: '',
  targetRpe: '7',
  restSeconds: '60',
  notes: '',
}

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

  it('matches successful drafts by their canonical persisted prescription', () => {
    expect(templateExerciseDraftMatches(persistedExercise, {
      exerciseId: ' exercise-a ',
      sets: '05',
      reps: '12.0',
      weightKg: '082.50',
      targetRpe: '8.0',
      restSeconds: '075',
      notes: '   ',
    })).toBe(true)
  })

  describe('saved prescription reconciliation', () => {
    it('prunes a canonicalized saved draft after refreshed props', () => {
      expect(shouldPruneTemplateExerciseDraft({
        exercise: persistedExercise,
        draft: {
          exerciseId: 'exercise-a',
          sets: '05',
          reps: '12',
          weightKg: '82.50',
          targetRpe: '8',
          restSeconds: '075',
          notes: '   ',
        },
        baseline: originalExerciseDraft,
        propsRefreshed: true,
        saveState: 'saved',
      })).toBe(true)
    })

    it('lets a refreshed conflicting server value replace the saved draft', () => {
      expect(shouldPruneTemplateExerciseDraft({
        exercise: { ...persistedExercise, reps: 15, notes: 'Ajuste externo' },
        draft: { ...originalExerciseDraft, reps: '12', notes: 'Propuesta enviada' },
        baseline: originalExerciseDraft,
        propsRefreshed: true,
        saveState: 'saved',
      })).toBe(true)
    })

    it.each(['dirty', 'error'] as const)('preserves a %s draft across refreshed props', saveState => {
      expect(shouldPruneTemplateExerciseDraft({
        exercise: persistedExercise,
        draft: { ...originalExerciseDraft, reps: '12' },
        baseline: originalExerciseDraft,
        propsRefreshed: true,
        saveState,
      })).toBe(false)
    })

    it('preserves a saved draft while props are still the original stale baseline', () => {
      expect(shouldPruneTemplateExerciseDraft({
        exercise: { ...persistedExercise, sets: 3, reps: 10, weight_kg: null, target_rpe: 7, rest_seconds: 60 },
        draft: { ...originalExerciseDraft, reps: '12' },
        baseline: originalExerciseDraft,
        propsRefreshed: false,
        saveState: 'saved',
      })).toBe(false)
    })
  })
})
