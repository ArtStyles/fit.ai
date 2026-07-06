import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useSessionStore, type ExerciseSession } from '../sessionStore'

function exercise(id: string, status: ExerciseSession['status'] = 'active'): ExerciseSession {
  return {
    workoutExerciseId: `we-${id}`,
    exerciseId: id,
    originalExerciseId: null,
    originalName: null,
    name: `Exercise ${id}`,
    imageUrl: null,
    instructions: null,
    muscleGroups: [],
    isCompound: false,
    targetSets: 2,
    targetReps: 8,
    targetDuration: null,
    restSeconds: 60,
    targetRpe: 7,
    suggestedWeight: null,
    weightSuggestionBasis: null,
    notes: null,
    source: 'planned',
    skipReason: null,
    previousPerformance: null,
    sets: [
      { weightKg: '10', reps: '8', rpe: null, completed: false },
      { weightKg: '10', reps: '8', rpe: null, completed: false },
    ],
    status,
    expanded: status === 'active',
    hasLastSessionData: false,
  }
}

describe('session store side effects', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    useSessionStore.getState().clearSession()
    useSessionStore.getState().initSession('workout-1', 'Workout', [exercise('one'), exercise('two', 'pending')])
  })

  it('starts rest after a completed set and preserves it across logging edits', () => {
    const store = useSessionStore.getState()
    store.completeSet('we-one', 0)
    const startedTimer = useSessionStore.getState().restTimer
    expect(startedTimer).toMatchObject({ remainingSeconds: 60, exerciseId: 'we-one' })

    useSessionStore.getState().updateSetField('we-one', 1, 'weightKg', '12.5')
    expect(useSessionStore.getState().restTimer).toEqual(startedTimer)
  })

  it('preserves an active rest timer when another exercise is skipped', () => {
    useSessionStore.getState().startRestTimer('we-one', 60)
    const startedTimer = useSessionStore.getState().restTimer
    useSessionStore.getState().skipExercise('we-two', 'Fatiga')
    expect(useSessionStore.getState().restTimer).toEqual(startedTimer)
  })

  it('clears rest only when the session finishes', () => {
    useSessionStore.getState().startRestTimer('we-one', 60)
    useSessionStore.getState().finishSession()
    expect(useSessionStore.getState().restTimer).toBeNull()
    expect(useSessionStore.getState().isFinished).toBe(true)
  })
})
