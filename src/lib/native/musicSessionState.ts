import type { PluginListenerHandle } from '@capacitor/core'

import type { MusicPlaybackSnapshot, MusicSessionAdapter } from './musicSession'

export const PAUSED_SESSION_GRACE_MS = 12_000

export type NowPlayingStatus =
  | 'checking'
  | 'unsupported'
  | 'not_granted'
  | 'granted_idle'
  | 'active'
  | 'error'

export type NowPlayingState = {
  status: NowPlayingStatus
  snapshot: MusicPlaybackSnapshot | null
  error: string | null
}

export type MusicSessionClock = {
  now(): number
  setTimeout(callback: () => void, delayMs: number): ReturnType<typeof setTimeout>
  clearTimeout(handle: ReturnType<typeof setTimeout>): void
}

export type NowPlayingSessionController = {
  start(): Promise<void>
  refresh(): Promise<void>
  stop(): Promise<void>
}

const systemClock: MusicSessionClock = {
  now: () => Date.now(),
  setTimeout: (callback, delayMs) => setTimeout(callback, delayMs),
  clearTimeout: handle => clearTimeout(handle),
}

function idleState(): NowPlayingState {
  return { status: 'granted_idle', snapshot: null, error: null }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unable to read the current music session.'
}

export function reconcilePositionMs(snapshot: MusicPlaybackSnapshot, nowMs: number): number {
  const elapsed = snapshot.state === 'playing'
    ? Math.max(0, nowMs - snapshot.updatedAtMs) * Math.max(0, snapshot.playbackSpeed)
    : 0
  return Math.min(snapshot.durationMs ?? 0, Math.max(0, (snapshot.positionMs ?? 0) + elapsed))
}

export function createMusicVisualSeed(snapshot: MusicPlaybackSnapshot): number {
  const value = `${snapshot.packageName}\u0000${snapshot.title}\u0000${snapshot.artist ?? ''}\u0000${snapshot.durationMs ?? 0}`
  let hash = 2_166_136_261
  for (const character of value) {
    hash ^= character.charCodeAt(0)
    hash = Math.imul(hash, 16_777_619)
  }
  return hash >>> 0
}

export function createNowPlayingSessionController(
  adapter: MusicSessionAdapter,
  onState: (state: NowPlayingState) => void,
  clock: MusicSessionClock = systemClock,
): NowPlayingSessionController {
  let active = false
  let operation = 0
  let startPromise: Promise<void> | null = null
  let listener: PluginListenerHandle | null = null
  let pauseTimeout: ReturnType<typeof setTimeout> | null = null
  let pauseDeadlineMs: number | null = null
  let pausedSnapshotUpdatedAtMs: number | null = null
  let latestSnapshotUpdatedAtMs: number | null = null
  let state: NowPlayingState = { status: 'checking', snapshot: null, error: null }

  const publish = (nextState: NowPlayingState) => {
    state = nextState
    onState(nextState)
  }

  const clearPauseTimeout = () => {
    if (pauseTimeout === null) return
    clock.clearTimeout(pauseTimeout)
    pauseTimeout = null
  }

  const resetPauseGrace = () => {
    clearPauseTimeout()
    pauseDeadlineMs = null
    pausedSnapshotUpdatedAtMs = null
  }

  const removeListener = async () => {
    const currentListener = listener
    listener = null
    await currentListener?.remove()
  }

  const clearResources = async () => {
    resetPauseGrace()
    await removeListener()
  }

  const schedulePausedExit = (snapshot: MusicPlaybackSnapshot) => {
    if (pausedSnapshotUpdatedAtMs !== snapshot.updatedAtMs) {
      clearPauseTimeout()
      pausedSnapshotUpdatedAtMs = snapshot.updatedAtMs
      pauseDeadlineMs = clock.now() + PAUSED_SESSION_GRACE_MS
    }

    const deadline = pauseDeadlineMs
    if (deadline === null) return
    const remainingMs = Math.max(0, deadline - clock.now())
    if (remainingMs === 0) {
      publish(idleState())
      return
    }
    if (pauseTimeout !== null) return
    pauseTimeout = clock.setTimeout(() => {
      pauseTimeout = null
      if (!active || pauseDeadlineMs !== deadline) return
      publish(idleState())
    }, remainingMs)
  }

  const applySnapshot = (snapshot: MusicPlaybackSnapshot | null) => {
    if (snapshot && latestSnapshotUpdatedAtMs !== null && snapshot.updatedAtMs < latestSnapshotUpdatedAtMs) return
    if (snapshot) latestSnapshotUpdatedAtMs = snapshot.updatedAtMs

    if (!snapshot || !snapshot.title.trim() || snapshot.state === 'stopped') {
      resetPauseGrace()
      publish(idleState())
      return
    }

    if (snapshot.state === 'playing') {
      resetPauseGrace()
      publish({ status: 'active', snapshot, error: null })
      return
    }

    if (pauseDeadlineMs !== null && pauseDeadlineMs <= clock.now()
      && pausedSnapshotUpdatedAtMs === snapshot.updatedAtMs) {
      publish(idleState())
      return
    }
    publish({ status: 'active', snapshot, error: null })
    schedulePausedExit(snapshot)
  }

  const isCurrentOperation = (run: number) => active && operation === run

  const readSessionAndEnsureListener = async (run: number) => {
    const initialSnapshot = await adapter.getCurrentSession()
    if (!isCurrentOperation(run)) return
    applySnapshot(initialSnapshot)
    if (listener) return

    const attachedListener = await adapter.addListener('sessionChanged', snapshot => {
      if (active) applySnapshot(snapshot)
    })
    if (!isCurrentOperation(run)) {
      await attachedListener.remove()
      return
    }
    listener = attachedListener

    const postListenerSnapshot = await adapter.getCurrentSession()
    if (!isCurrentOperation(run)) return
    applySnapshot(postListenerSnapshot)
  }

  const start = async () => {
    if (active && startPromise) return startPromise
    if (active) return

    active = true
    const run = ++operation
    const startWork = async () => {
      publish({ status: 'checking', snapshot: null, error: null })
      try {
        const authorization = await adapter.getAuthorizationStatus()
        if (!isCurrentOperation(run)) return
        if (authorization !== 'granted') {
          publish({ status: authorization, snapshot: null, error: null })
          return
        }
        await readSessionAndEnsureListener(run)
      } catch (error) {
        if (!isCurrentOperation(run)) return
        await clearResources()
        publish({ status: 'error', snapshot: null, error: errorMessage(error) })
      }
    }
    startPromise = startWork().finally(() => {
      if (operation === run) startPromise = null
    })
    return startPromise
  }

  const refresh = async () => {
    if (!active) return
    const run = ++operation
    try {
      const authorization = await adapter.getAuthorizationStatus()
      if (!isCurrentOperation(run)) return
      if (authorization !== 'granted') {
        await clearResources()
        if (isCurrentOperation(run)) publish({ status: authorization, snapshot: null, error: null })
        return
      }
      await readSessionAndEnsureListener(run)
    } catch (error) {
      if (!isCurrentOperation(run)) return
      await clearResources()
      if (isCurrentOperation(run)) {
        publish({ status: 'error', snapshot: null, error: errorMessage(error) })
      }
    }
  }

  const stop = async () => {
    if (!active && !listener && pauseTimeout === null) return
    active = false
    operation += 1
    await clearResources()
  }

  return { start, refresh, stop }
}
