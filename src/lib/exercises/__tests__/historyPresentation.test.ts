import { describe, expect, it } from 'vitest'
import {
  resolveHistoricalExercisePresentation,
  toExerciseHistoryPresentation,
} from '../historyPresentation'

const sessionSnapshot = {
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
  exercises: [{
    exerciseId: '44444444-4444-4444-8444-444444444444',
    name: 'Historical Row',
    nameEs: 'Remo histÃ³rico',
    muscleGroups: ['back'],
    muscleGroupsEs: ['espalda'],
    isCompound: true,
  }, {
    exerciseId: '55555555-5555-4555-8555-555555555555',
    name: 'Other snapshot exercise',
    nameEs: null,
    muscleGroups: ['arms'],
    muscleGroupsEs: [],
    isCompound: false,
  }],
}

describe('exercise history presentation', () => {
  it('uses an orphan progress-log snapshot before the translated fallback', () => {
    const presentation = toExerciseHistoryPresentation({
      id: 'orphan-log',
      workout_id: null,
      completed_at: '2026-08-02T10:00:00Z',
      duration_minutes: 45,
      mood_rating: null,
      session_context_snapshot: sessionSnapshot,
    }, {}, 'Entrenamiento')

    expect(presentation).toMatchObject({
      workoutId: null,
      workoutName: 'Plan A Pull',
      focus: 'Espalda',
      source: 'snapshot',
    })
  })
})

describe('historical exercise presentation', () => {
  it('uses the matching executed snapshot before changed live metadata', () => {
    expect(resolveHistoricalExercisePresentation({
      exerciseId: '44444444-4444-4444-8444-444444444444',
      sessionContextSnapshot: sessionSnapshot,
      liveExercise: {
        name: 'Renamed live row',
        name_es: 'Remo actual',
        muscle_groups: ['new back'],
        muscle_groups_es: ['espalda nueva'],
        is_compound: false,
      },
      language: 'es',
      fallbackExerciseName: 'Ejercicio',
    })).toEqual({
      exerciseId: '44444444-4444-4444-8444-444444444444',
      name: 'Remo histÃ³rico',
      muscleGroups: ['espalda'],
      isCompound: true,
      source: 'snapshot',
    })
  })

  it('uses localized live metadata when the snapshot has no matching exercise', () => {
    expect(resolveHistoricalExercisePresentation({
      exerciseId: '66666666-6666-4666-8666-666666666666',
      sessionContextSnapshot: sessionSnapshot,
      liveExercise: {
        name: 'Live press',
        name_es: 'Press actual',
        muscle_groups: ['chest'],
        muscle_groups_es: ['pecho'],
        is_compound: true,
      },
      language: 'es',
      fallbackExerciseName: 'Ejercicio',
    })).toEqual({
      exerciseId: '66666666-6666-4666-8666-666666666666',
      name: 'Press actual',
      muscleGroups: ['pecho'],
      isCompound: true,
      source: 'live',
    })
  })

  it('returns the translated fallback without inventing an exercise id', () => {
    expect(resolveHistoricalExercisePresentation({
      exerciseId: null,
      sessionContextSnapshot: sessionSnapshot,
      liveExercise: null,
      language: 'en',
      fallbackExerciseName: 'Exercise',
    })).toEqual({
      exerciseId: null,
      name: 'Exercise',
      muscleGroups: [],
      isCompound: false,
      source: 'fallback',
    })
  })
})
