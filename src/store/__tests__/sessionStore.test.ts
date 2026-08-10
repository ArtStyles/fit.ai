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

  it('creates one stable client session id and preserves it on restore', () => {
    const original = useSessionStore.getState().clientSessionId
    expect(original).toMatch(/^[0-9a-f-]{36}$/i)

    const state = useSessionStore.getState()
    state.restoreSession({
      clientSessionId: original,
      workoutId: state.workoutId,
      workoutName: state.workoutName,
      startedAt: state.startedAt,
      exercises: state.exercises,
    })
    expect(useSessionStore.getState().clientSessionId).toBe(original)
  })

  it('migrates a legacy backup to one stable id without regenerating during edits', () => {
    const state = useSessionStore.getState()
    state.restoreSession({
      workoutId: state.workoutId,
      workoutName: state.workoutName,
      startedAt: state.startedAt,
      exercises: state.exercises,
    })
    const migrated = useSessionStore.getState().clientSessionId
    useSessionStore.getState().updateSetField('we-one', 0, 'reps', '9')
    expect(useSessionStore.getState().clientSessionId).toBe(migrated)
  })

  it('replaces an invalid restored id once and keeps the replacement stable', () => {
    const state = useSessionStore.getState()
    state.restoreSession({
      clientSessionId: 'not-a-session-id',
      workoutId: state.workoutId,
      workoutName: state.workoutName,
      startedAt: state.startedAt,
      exercises: state.exercises,
    })

    const migrated = useSessionStore.getState().clientSessionId
    expect(migrated).not.toBe('not-a-session-id')
    expect(migrated).toMatch(/^[0-9a-f-]{36}$/i)
    useSessionStore.getState().updateSetField('we-one', 0, 'reps', '9')
    expect(useSessionStore.getState().clientSessionId).toBe(migrated)
  })

  it('keeps execution data editable but refuses ad-hoc and replacement exercises in a locked prescription', () => {
    useSessionStore.getState().clearSession()
    useSessionStore.getState().initSession('workout-locked', 'Locked workout', [exercise('one')], true)

    const before = useSessionStore.getState().exercises
    useSessionStore.getState().addSessionExercise({
      exerciseId: 'extra',
      name: 'Extra exercise',
      imageUrl: null,
      instructions: null,
      muscleGroups: [],
      isCompound: false,
    })
    useSessionStore.getState().replaceSessionExercise('we-one', {
      exerciseId: 'replacement',
      name: 'Replacement exercise',
      imageUrl: null,
      instructions: null,
      muscleGroups: [],
      isCompound: false,
    })
    useSessionStore.getState().updateSetField('we-one', 0, 'weightKg', '42.5')
    useSessionStore.getState().skipExercise('we-one', 'Dolor')

    expect(useSessionStore.getState().exercises).toHaveLength(before.length)
    expect(useSessionStore.getState().exercises[0]).toMatchObject({
      exerciseId: 'one',
      sets: expect.arrayContaining([expect.objectContaining({ weightKg: '42.5' })]),
      status: 'skipped',
      skipReason: 'Dolor',
    })
  })

  it('refuses to finish a locked prescription while any prescribed exercise has no evidence', () => {
    useSessionStore.getState().clearSession()
    useSessionStore.getState().initSession(
      'workout-locked',
      'Locked workout',
      [exercise('one'), exercise('two', 'pending')],
      true,
    )

    useSessionStore.getState().completeSet('we-one', 0)
    useSessionStore.getState().finishSession()

    expect(useSessionStore.getState().isFinished).toBe(false)
  })

  it('accepts partial-set evidence when every locked exercise has at least one completed set', () => {
    useSessionStore.getState().clearSession()
    useSessionStore.getState().initSession('workout-locked', 'Locked workout', [exercise('one')], true)

    useSessionStore.getState().completeSet('we-one', 0)
    useSessionStore.getState().finishSession()

    expect(useSessionStore.getState().isFinished).toBe(true)
  })

  it('finishes a locked prescription only after every exercise is completed or cleanly skipped', () => {
    useSessionStore.getState().clearSession()
    useSessionStore.getState().initSession(
      'workout-locked',
      'Locked workout',
      [exercise('one'), exercise('two', 'pending')],
      true,
    )

    useSessionStore.getState().completeSet('we-one', 0)
    useSessionStore.getState().completeSet('we-one', 1)
    useSessionStore.getState().skipExercise('we-two', 'Sin equipo')
    useSessionStore.getState().finishSession()

    expect(useSessionStore.getState().isFinished).toBe(true)
  })

  it('keeps personal-session safe stop available after partial progress', () => {
    useSessionStore.getState().clearSession()
    useSessionStore.getState().initSession('workout-personal', 'Personal workout', [exercise('one')], false)

    useSessionStore.getState().completeSet('we-one', 0)
    useSessionStore.getState().finishSession()

    expect(useSessionStore.getState().isFinished).toBe(true)
  })
})
