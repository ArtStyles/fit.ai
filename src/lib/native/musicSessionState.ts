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
  let lifecycle = 0
  let startPromise: Promise<void> | null = null
  let listener: PluginListenerHandle | null = null
  let pauseTimeout: ReturnType<typeof setTimeout> | null = null
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

  const removeListener = async () => {
    const currentListener = listener
    listener = null
    await currentListener?.remove()
  }

  const clearResources = async () => {
    clearPauseTimeout()
    await removeListener()
  }

  const applySnapshot = (snapshot: MusicPlaybackSnapshot | null) => {
    if (snapshot && state.snapshot && snapshot.updatedAtMs < state.snapshot.updatedAtMs) return

    if (!snapshot || !snapshot.title.trim() || snapshot.state === 'stopped') {
      clearPauseTimeout()
      publish(idleState())
      return
    }

    if (snapshot.state === 'playing') {
      clearPauseTimeout()
      publish({ status: 'active', snapshot, error: null })
      return
    }

    publish({ status: 'active', snapshot, error: null })
    if (pauseTimeout !== null) return
    pauseTimeout = clock.setTimeout(() => {
      pauseTimeout = null
      if (!active || state.snapshot?.state !== 'paused') return
      publish(idleState())
    }, PAUSED_SESSION_GRACE_MS)
  }

  const start = async () => {
    if (active && startPromise) return startPromise
    if (active) return

    active = true
    const run = ++lifecycle
    const isCurrentRun = () => active && lifecycle === run
    const startWork = async () => {
      publish({ status: 'checking', snapshot: null, error: null })
      try {
        const authorization = await adapter.getAuthorizationStatus()
        if (!isCurrentRun()) return
        if (authorization !== 'granted') {
          publish({ status: authorization, snapshot: null, error: null })
          return
        }

        const initialSnapshot = await adapter.getCurrentSession()
        if (!isCurrentRun()) return
        applySnapshot(initialSnapshot)

        const attachedListener = await adapter.addListener('sessionChanged', snapshot => {
          if (isCurrentRun()) applySnapshot(snapshot)
        })
        if (!isCurrentRun()) {
          await attachedListener.remove()
          return
        }
        listener = attachedListener

        const postListenerSnapshot = await adapter.getCurrentSession()
        if (!isCurrentRun()) return
        applySnapshot(postListenerSnapshot)
      } catch (error) {
        if (!isCurrentRun()) return
        await clearResources()
        publish({ status: 'error', snapshot: null, error: errorMessage(error) })
      }
    }
    startPromise = startWork().finally(() => {
      if (lifecycle === run) startPromise = null
    })
    return startPromise
  }

  const refresh = async () => {
    if (!active) return
    const run = lifecycle
    publish({ status: 'checking', snapshot: null, error: null })
    try {
      const authorization = await adapter.getAuthorizationStatus()
      if (!active || lifecycle !== run) return
      if (authorization !== 'granted') {
        await clearResources()
        if (active && lifecycle === run) publish({ status: authorization, snapshot: null, error: null })
        return
      }
      const refreshedSnapshot = await adapter.getCurrentSession()
      if (!active || lifecycle !== run) return
      applySnapshot(refreshedSnapshot)
    } catch (error) {
      if (!active || lifecycle !== run) return
      await clearResources()
      if (active && lifecycle === run) {
        publish({ status: 'error', snapshot: null, error: errorMessage(error) })
      }
    }
  }

  const stop = async () => {
    if (!active && !listener && pauseTimeout === null) return
    active = false
    lifecycle += 1
    await clearResources()
  }

  return { start, refresh, stop }
}
