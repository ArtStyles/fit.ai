import { describe, expect, it } from 'vitest'
import { toCompletedSessionPresentation } from '../historyRows'

const snapshot = {
  version: 1,
  workout: {
    id: '11111111-1111-4111-8111-111111111111',
    name: 'Original Legs',
    focus: 'Piernas',
    dayOfWeek: 3,
  },
  plan: {
    id: '22222222-2222-4222-8222-222222222222',
    familyId: '33333333-3333-4333-8333-333333333333',
    name: 'Previous plan',
    weekNumber: 2,
  },
  exercises: [],
} as const

describe('completed session history rows', () => {
  it('keeps an orphan session visible with the translated fallback', () => {
    const orphan = {
      id: 'log-1',
      workout_id: null,
      completed_at: '2026-07-01T12:00:00Z',
      duration_minutes: 45,
      session_context_snapshot: null,
      workout: null,
    }

    expect(toCompletedSessionPresentation(orphan, 'Entrenamiento')).toMatchObject({
      id: 'log-1',
      workoutId: null,
      workoutName: 'Entrenamiento',
      focus: null,
    })
  })

  it('uses immutable snapshot context for an orphan before relation or fallback', () => {
    expect(toCompletedSessionPresentation({
      id: 'log-2',
      workout_id: null,
      completed_at: '2026-07-02T12:00:00Z',
      duration_minutes: 50,
      session_context_snapshot: snapshot,
      workout: null,
    }, 'Entrenamiento')).toMatchObject({
      workoutId: null,
      workoutName: 'Original Legs',
      focus: 'Piernas',
      source: 'snapshot',
    })
  })

  it('normalizes PostgREST one-to-one workout arrays for legacy sessions', () => {
    expect(toCompletedSessionPresentation({
      id: 'log-3',
      workout_id: 'workout-3',
      completed_at: '2026-07-03T12:00:00Z',
      duration_minutes: 30,
      session_context_snapshot: null,
      workout: [{ name: 'Legacy Push', focus: 'Pecho' }],
    }, 'Entrenamiento')).toMatchObject({
      workoutId: 'workout-3',
      workoutName: 'Legacy Push',
      focus: 'Pecho',
      source: 'workout',
    })
  })
})
