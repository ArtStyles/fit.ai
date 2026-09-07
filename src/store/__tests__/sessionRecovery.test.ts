import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useSessionStore } from '../sessionStore'

describe('session completion recovery', () => {
  beforeEach(() => { useSessionStore.getState().clearSession(); vi.useRealTimers() })

  it('restores the original completion timestamp and identifier without reopening the session', () => {
    const startedAt = Date.now() - 60_000
    const finishedAt = startedAt + 30_000
    useSessionStore.getState().restoreSession({
      userId: 'account-a', clientSessionId: '11111111-1111-4111-8111-111111111111',
      workoutId: 'workout-a', workoutName: 'Session A', startedAt, finishedAt, exercises: [],
    })
    expect(useSessionStore.getState()).toMatchObject({ userId: 'account-a', isFinished: true, finishedAt })
    useSessionStore.getState().finishSession()
    expect(useSessionStore.getState().finishedAt).toBe(finishedAt)
    expect(useSessionStore.getState().clientSessionId).toBe('11111111-1111-4111-8111-111111111111')
  })

  it('clears the in-memory owner and retains the authenticated owner on a new session', () => {
    useSessionStore.getState().initSession('workout-a', 'Session A', [], false, 'account-a')
    expect(useSessionStore.getState().userId).toBe('account-a')
    useSessionStore.getState().clearSession()
    expect(useSessionStore.getState().userId).toBe('')
    useSessionStore.getState().initSession('workout-b', 'Session B', [], false, 'account-b')
    expect(useSessionStore.getState()).toMatchObject({ userId: 'account-b', finishedAt: 0, isFinished: false })
  })
})
