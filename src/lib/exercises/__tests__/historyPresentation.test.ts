import { describe, expect, it } from 'vitest'
import { toExerciseHistoryPresentation } from '../historyPresentation'

describe('exercise history presentation', () => {
  it('uses an orphan progress-log snapshot before the translated fallback', () => {
    const presentation = toExerciseHistoryPresentation({
      id: 'orphan-log',
      workout_id: null,
      completed_at: '2026-08-02T10:00:00Z',
      duration_minutes: 45,
      mood_rating: null,
      session_context_snapshot: {
        version: 1,
        workout: {
          id: '11111111-1111-4111-8111-111111111111',
          name: 'Plan A Pull',
          focus: 'Espalda',
          dayOfWeek: 2,
        },
        plan: {
          id: '22222222-2222-4222-8222-222222222222',
          familyId: '33333333-3333-4333-8333-333333333333',
          name: 'Plan A',
          weekNumber: 1,
        },
        exercises: [],
      },
    }, {}, 'Entrenamiento')

    expect(presentation).toMatchObject({
      workoutId: null,
      workoutName: 'Plan A Pull',
      focus: 'Espalda',
      source: 'snapshot',
    })
  })
})
