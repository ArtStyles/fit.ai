import { describe, expect, it, vi } from 'vitest'

const appMocks = vi.hoisted(() => ({
  addListener: vi.fn(),
}))

vi.mock('@capacitor/app', () => ({
  App: appMocks,
}))

vi.mock('../musicSession', () => ({
  musicSessionAdapter: {},
}))

import {
  createNowPlayingRefreshAction,
  createControlPendingTracker,
  subscribeToForegroundAppState,
} from '../useNowPlayingSession'

describe('now playing hook lifecycles', () => {
  it('exposes a retry action backed by the real coordinator refresh', async () => {
    const refresh = vi.fn(async () => undefined)
    const action = createNowPlayingRefreshAction({ refresh })

    await action()

    expect(refresh).toHaveBeenCalledOnce()
  })

  it('removes a delayed app-state listener exactly once after cleanup', async () => {
    let resolveRegistration: (handle: { remove(): Promise<void> }) => void = () => undefined
    const registration = new Promise<{ remove(): Promise<void> }>(resolve => {
      resolveRegistration = resolve
    })
    const remove = vi.fn(async () => undefined)

    const cleanup = subscribeToForegroundAppState(
      () => registration,
      vi.fn(),
    )
    cleanup()
    cleanup()
    resolveRegistration({ remove })
    await registration
    await Promise.resolve()

    expect(remove).toHaveBeenCalledOnce()
  })

  it('keeps pending true until all overlapping controls complete and ignores an old lifecycle', () => {
    const oldPending: boolean[] = []
    const nextPending: boolean[] = []
    const oldTracker = createControlPendingTracker(value => oldPending.push(value))
    const firstDone = oldTracker.begin()
    const secondDone = oldTracker.begin()

    firstDone()
    expect(oldPending.at(-1)).toBe(true)
    secondDone()
    expect(oldPending.at(-1)).toBe(false)

    const oldRequestDone = oldTracker.begin()
    oldTracker.dispose()
    expect(oldPending.at(-1)).toBe(false)
    const nextTracker = createControlPendingTracker(value => nextPending.push(value))
    const nextRequestDone = nextTracker.begin()
    oldRequestDone()

    expect(nextPending.at(-1)).toBe(true)
    nextRequestDone()
    expect(nextPending.at(-1)).toBe(false)
  })
})
