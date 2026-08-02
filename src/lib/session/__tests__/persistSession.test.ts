import { beforeEach, describe, expect, it, vi } from 'vitest'
import { clearBackup, loadBackup, saveBackup, type SessionSnapshot } from '../persistSession'

const snapshot = {
  clientSessionId: '11111111-1111-4111-8111-111111111111',
  workoutId: 'workout-1',
  workoutName: 'Workout',
  startedAt: 1,
  exercises: [],
} as SessionSnapshot

describe('session backup persistence results', () => {
  const setItem = vi.fn()
  const getItem = vi.fn()
  const removeItem = vi.fn()

  beforeEach(() => {
    setItem.mockReset()
    getItem.mockReset()
    removeItem.mockReset()
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
})
