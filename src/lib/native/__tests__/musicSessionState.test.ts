import { describe, expect, it, vi } from 'vitest'

import type {
  MusicPlaybackSnapshot,
  MusicSessionAdapter,
  MusicSessionAuthorization,
} from '../musicSession'
import {
  createMusicVisualSeed,
  createNowPlayingSessionController,
  reconcilePositionMs,
  type MusicSessionClock,
  type NowPlayingState,
} from '../musicSessionState'

const PLAYING_SNAPSHOT: MusicPlaybackSnapshot = {
  sessionId: 'session-1',
  packageName: 'com.example.player',
  sourceLabel: 'Example Player',
  title: 'Song',
  artist: 'Artist',
  album: 'Album',
  artworkDataUrl: null,
  state: 'playing',
  positionMs: 10_000,
  durationMs: 180_000,
  playbackSpeed: 1,
  updatedAtMs: 1_000,
  canPlay: false,
  canPause: true,
}

const PAUSED_SNAPSHOT: MusicPlaybackSnapshot = {
  ...PLAYING_SNAPSHOT,
  state: 'paused',
  updatedAtMs: 2_000,
}

type HarnessOptions = {
  authorization?: MusicSessionAuthorization
  authorizationReads?: MusicSessionAuthorization[]
  current?: MusicPlaybackSnapshot | null
  currentReads?: Array<MusicPlaybackSnapshot | null>
  emitOnListen?: MusicPlaybackSnapshot | null
}

function createHarness(options: HarnessOptions = {}) {
  let now = 10_000
  let nextTimerId = 1
  const timers = new Map<number, { at: number; callback: () => void }>()
  const states: NowPlayingState[] = []
  const remove = vi.fn(async () => undefined)
  let listener: ((snapshot: MusicPlaybackSnapshot | null) => void) | null = null
  const currentReads = [...(options.currentReads ?? [options.current ?? null])]
  const clock: MusicSessionClock = {
    now: () => now,
    setTimeout: ((callback: () => void, delayMs: number) => {
      const timerId = nextTimerId++
      timers.set(timerId, { at: now + delayMs, callback })
      return timerId
    }) as unknown as MusicSessionClock['setTimeout'],
    clearTimeout: ((timerId: number) => {
      timers.delete(timerId)
    }) as unknown as MusicSessionClock['clearTimeout'],
  }
  const adapter: MusicSessionAdapter = {
    getAuthorizationStatus: async () => options.authorizationReads?.shift() ?? options.authorization ?? 'granted',
    openNotificationListenerSettings: async () => undefined,
    getCurrentSession: async () => currentReads.shift() ?? options.current ?? null,
    play: async () => undefined,
    pause: async () => undefined,
    addListener: async (_eventName, nextListener) => {
      listener = nextListener
      if (options.emitOnListen !== undefined) nextListener(options.emitOnListen)
      return { remove }
    },
  }

  return {
    adapter,
    clock,
    remove,
    onState: (state: NowPlayingState) => states.push(state),
    emit(snapshot: MusicPlaybackSnapshot | null) {
      listener?.(snapshot)
    },
    latest() {
      return states.at(-1)!
    },
    pendingTimers() {
      return timers.size
    },
    advanceBy(durationMs: number) {
      const target = now + durationMs
      while (true) {
        const due = Array.from(timers.entries())
          .filter(([, timer]) => timer.at <= target)
          .sort(([, first], [, second]) => first.at - second.at)[0]
        if (!due) break
        const [timerId, timer] = due
        now = timer.at
        timers.delete(timerId)
        timer.callback()
      }
      now = target
    },
  }
}

describe('now playing session controller', () => {
  it.each(['unsupported', 'not_granted'] as const)(
    'does not register a listener when authorization is %s',
    async authorization => {
      const harness = createHarness({ authorization, current: PLAYING_SNAPSHOT })
      const controller = createNowPlayingSessionController(harness.adapter, harness.onState, harness.clock)

      await controller.start()

      expect(harness.latest()).toEqual({ status: authorization, snapshot: null, error: null })
      await controller.stop()
      expect(harness.remove).not.toHaveBeenCalled()
    },
  )

  it('publishes the initial snapshot and ignores a stale post-listener read', async () => {
    const newerSnapshot = { ...PLAYING_SNAPSHOT, title: 'New song', updatedAtMs: 2_000 }
    const harness = createHarness({
      authorization: 'granted',
      currentReads: [PLAYING_SNAPSHOT, PLAYING_SNAPSHOT],
      emitOnListen: newerSnapshot,
    })
    const controller = createNowPlayingSessionController(harness.adapter, harness.onState, harness.clock)

    await controller.start()

    expect(harness.latest()).toEqual({ status: 'active', snapshot: newerSnapshot, error: null })
  })

  it('keeps a paused session for exactly twelve seconds', async () => {
    const harness = createHarness({ authorization: 'granted', current: PLAYING_SNAPSHOT })
    const states: NowPlayingState[] = []
    const controller = createNowPlayingSessionController(harness.adapter, state => states.push(state), harness.clock)
    await controller.start()

    harness.emit({ ...PLAYING_SNAPSHOT, state: 'paused', updatedAtMs: 2_000 })
    expect(states.at(-1)).toMatchObject({ status: 'active', snapshot: { state: 'paused' } })

    harness.advanceBy(11_999)
    expect(states.at(-1)?.status).toBe('active')
    harness.advanceBy(1)
    expect(states.at(-1)).toEqual({ status: 'granted_idle', snapshot: null, error: null })
  })

  it('cancels paused exit when playback resumes and ignores older events', async () => {
    const harness = createHarness({ authorization: 'granted', current: PLAYING_SNAPSHOT })
    const controller = createNowPlayingSessionController(harness.adapter, harness.onState, harness.clock)
    await controller.start()
    harness.emit({ ...PLAYING_SNAPSHOT, state: 'paused', updatedAtMs: 4_000 })
    harness.emit({ ...PLAYING_SNAPSHOT, state: 'playing', updatedAtMs: 5_000 })
    harness.emit({ ...PLAYING_SNAPSHOT, title: 'Old title', updatedAtMs: 4_500 })
    harness.advanceBy(12_000)

    expect(harness.latest().snapshot?.title).toBe(PLAYING_SNAPSHOT.title)
    expect(harness.latest().status).toBe('active')
  })

  it('removes the native listener and timeout when stopped', async () => {
    const harness = createHarness({ authorization: 'granted', current: PAUSED_SNAPSHOT })
    const controller = createNowPlayingSessionController(harness.adapter, harness.onState, harness.clock)
    await controller.start()
    await controller.stop()

    expect(harness.remove).toHaveBeenCalledOnce()
    expect(harness.pendingTimers()).toBe(0)
    await controller.stop()
    expect(harness.remove).toHaveBeenCalledOnce()
  })

  it('cleans the listener and paused timeout when foreground refresh finds revoked permission', async () => {
    const harness = createHarness({
      authorizationReads: ['granted', 'not_granted'],
      current: PAUSED_SNAPSHOT,
    })
    const controller = createNowPlayingSessionController(harness.adapter, harness.onState, harness.clock)
    await controller.start()

    await controller.refresh()

    expect(harness.latest()).toEqual({ status: 'not_granted', snapshot: null, error: null })
    expect(harness.remove).toHaveBeenCalledOnce()
    expect(harness.pendingTimers()).toBe(0)
  })

  it('does not publish a snapshot or attach a listener after stop invalidates a pending start', async () => {
    let resolveSnapshot: (snapshot: MusicPlaybackSnapshot) => void = () => undefined
    let requestSnapshot: () => void = () => undefined
    const snapshotRequested = new Promise<void>(resolve => {
      requestSnapshot = resolve
    })
    const adapter: MusicSessionAdapter = {
      getAuthorizationStatus: async () => 'granted',
      openNotificationListenerSettings: async () => undefined,
      getCurrentSession: () => new Promise(resolve => {
        resolveSnapshot = resolve
        requestSnapshot()
      }),
      play: async () => undefined,
      pause: async () => undefined,
      addListener: vi.fn(async () => ({ remove: vi.fn(async () => undefined) })),
    }
    const states: NowPlayingState[] = []
    const controller = createNowPlayingSessionController(adapter, state => states.push(state), createHarness().clock)
    const starting = controller.start()
    await snapshotRequested

    await controller.stop()
    resolveSnapshot(PLAYING_SNAPSHOT)
    await starting

    expect(states).toEqual([{ status: 'checking', snapshot: null, error: null }])
    expect(adapter.addListener).not.toHaveBeenCalled()
  })

  it('does not publish a late foreground refresh after stop', async () => {
    let resolveRefresh: (snapshot: MusicPlaybackSnapshot) => void = () => undefined
    let requestRefresh: () => void = () => undefined
    const refreshRequested = new Promise<void>(resolve => {
      requestRefresh = resolve
    })
    let currentReadCount = 0
    const adapter: MusicSessionAdapter = {
      getAuthorizationStatus: async () => 'granted',
      openNotificationListenerSettings: async () => undefined,
      getCurrentSession: () => {
        currentReadCount += 1
        if (currentReadCount <= 2) return Promise.resolve(PLAYING_SNAPSHOT)
        return new Promise(resolve => {
          resolveRefresh = resolve
          requestRefresh()
        })
      },
      play: async () => undefined,
      pause: async () => undefined,
      addListener: async () => ({ remove: vi.fn(async () => undefined) }),
    }
    const states: NowPlayingState[] = []
    const controller = createNowPlayingSessionController(adapter, state => states.push(state), createHarness().clock)
    await controller.start()
    const refreshing = controller.refresh()
    await refreshRequested

    await controller.stop()
    resolveRefresh({ ...PLAYING_SNAPSHOT, title: 'Late refresh', updatedAtMs: 2_000 })
    await refreshing

    expect(states.at(-1)).toEqual({ status: 'checking', snapshot: null, error: null })
  })
})

describe('music session helpers', () => {
  it('reconciles playing position at playback speed and clamps it to duration', () => {
    expect(reconcilePositionMs({ ...PLAYING_SNAPSHOT, playbackSpeed: 1.25 }, 5_000)).toBe(15_000)
    expect(reconcilePositionMs({ ...PLAYING_SNAPSHOT, positionMs: 179_000, playbackSpeed: 1.25 }, 5_000)).toBe(180_000)
  })

  it('creates an identical visual seed from identical stable metadata', () => {
    expect(createMusicVisualSeed(PLAYING_SNAPSHOT)).toBe(createMusicVisualSeed({
      ...PLAYING_SNAPSHOT,
      sessionId: 'another-session',
      updatedAtMs: 99_999,
      artworkDataUrl: 'data:image/png;base64,ignored',
    }))
  })
})
