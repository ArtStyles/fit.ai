import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useSessionStore } from '@/store/sessionStore'
import { clearBackup, loadBackup, saveBackup, type SessionSnapshot } from '../persistSession'

const snapshot = {
  clientSessionId: '11111111-1111-4111-8111-111111111111',
  workoutId: 'workout-1',
  workoutName: 'Workout',
  startedAt: 1,
  exercises: [],
} as SessionSnapshot

const legacyExercise = {
  workoutExerciseId: 'we-1',
  exerciseId: 'ex-1',
  name: 'Squat',
  status: 'active',
  sets: [{ weightKg: '10', reps: '8', rpe: null, completed: false }],
}

describe('session backup persistence results', () => {
  const setItem = vi.fn()
  const getItem = vi.fn()
  const removeItem = vi.fn()

  beforeEach(() => {
    setItem.mockReset()
    getItem.mockReset()
    removeItem.mockReset()
    useSessionStore.getState().clearSession()
    vi.stubGlobal('localStorage', { setItem, getItem, removeItem })
  })

  it('reports a failed write and succeeds when the user retries', () => {
    setItem.mockImplementationOnce(() => { throw new Error('quota exceeded') })

    expect(saveBackup(snapshot)).toEqual({ ok: false, error: 'quota exceeded' })
    expect(saveBackup(snapshot)).toEqual({ ok: true })
    expect(setItem).toHaveBeenCalledTimes(2)
  })

  it('reports a failed deletion and succeeds when cleanup retries', () => {
    removeItem.mockImplementationOnce(() => { throw new Error('storage blocked') })

    expect(clearBackup(snapshot.workoutId)).toEqual({ ok: false, error: 'storage blocked' })
    expect(clearBackup(snapshot.workoutId)).toEqual({ ok: true })
    expect(removeItem).toHaveBeenCalledTimes(2)
  })

  it('rejects a structurally corrupt backup before it reaches the session store', () => {
    getItem.mockReturnValue(JSON.stringify({
      ...snapshot,
      exercises: 'not-an-array',
    }))

    expect(loadBackup(snapshot.workoutId)).toBeNull()
  })

  it.each([
    [[null]],
    [[{ workoutExerciseId: 'we-1', exerciseId: 'ex-1', name: 'Squat', status: 'active', sets: 'bad' }]],
    [[{
      workoutExerciseId: 'we-1', exerciseId: 'ex-1', name: 'Squat', status: 'active',
      sets: [{ weightKg: 10, reps: '8', rpe: null, completed: false }],
    }]],
  ])('rejects corrupt exercise/set elements: %j', exercises => {
    getItem.mockReturnValue(JSON.stringify({ ...snapshot, exercises }))
    expect(loadBackup(snapshot.workoutId)).toBeNull()
  })

  it('accepts a valid legacy backup without a client id or newer exercise metadata', () => {
    getItem.mockReturnValue(JSON.stringify({
      workoutId: snapshot.workoutId,
      workoutName: snapshot.workoutName,
      startedAt: snapshot.startedAt,
      exercises: [legacyExercise],
    }))

    const restored = loadBackup(snapshot.workoutId)
    expect(restored).not.toBeNull()
    expect(restored?.exercises[0]).toEqual({
      ...legacyExercise,
      originalExerciseId: null,
      originalName: null,
      imageUrl: null,
      instructions: null,
      muscleGroups: [],
      isCompound: false,
      targetSets: 1,
      targetReps: null,
      targetDuration: null,
      restSeconds: 60,
      targetRpe: 7,
      suggestedWeight: null,
      weightSuggestionBasis: null,
      notes: null,
      source: 'planned',
      skipReason: null,
      expanded: true,
      hasLastSessionData: false,
      previousPerformance: null,
    })

    useSessionStore.getState().restoreSession(restored!)
    expect(() => {
      useSessionStore.getState().updateSetField('we-1', 0, 'reps', '9')
      useSessionStore.getState().finishSession()
    }).not.toThrow()
    expect(useSessionStore.getState().exercises[0].muscleGroups).toEqual([])
  })

  it.each([
    ['originalExerciseId', 42],
    ['originalName', []],
    ['imageUrl', 42],
    ['instructions', []],
    ['muscleGroups', 'legs'],
    ['isCompound', 'false'],
    ['targetSets', '3'],
    ['targetReps', '8'],
    ['targetDuration', '30'],
    ['restSeconds', '60'],
    ['targetRpe', '7'],
    ['suggestedWeight', '10'],
    ['weightSuggestionBasis', 'guessed'],
    ['notes', 42],
    ['source', 'imported'],
    ['skipReason', 42],
    ['expanded', 'yes'],
    ['hasLastSessionData', 'no'],
    ['previousPerformance', 'bad'],
  ])('rejects corrupt optional exercise field %s', (field, corruptValue) => {
    getItem.mockReturnValue(JSON.stringify({
      ...snapshot,
      exercises: [{ ...legacyExercise, [field]: corruptValue }],
    }))

    expect(loadBackup(snapshot.workoutId)).toBeNull()
  })

  it.each([
    ['rpe', '7'],
    ['completed', 'false'],
    ['durationSeconds', '30'],
  ])('rejects corrupt optional set field %s', (field, corruptValue) => {
    getItem.mockReturnValue(JSON.stringify({
      ...snapshot,
      exercises: [{
        ...legacyExercise,
        sets: [{ ...legacyExercise.sets[0], [field]: corruptValue }],
      }],
    }))

    expect(loadBackup(snapshot.workoutId)).toBeNull()
  })
})
