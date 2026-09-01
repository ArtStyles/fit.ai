'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

import { useI18n } from '@/components/i18n/I18nProvider'
import type { NowPlayingState } from '@/lib/native/musicSessionState'
import {
  createMusicVisualSeed,
  reconcilePositionMs,
} from '@/lib/native/musicSessionState'
import { useNowPlayingSession } from '@/lib/native/useNowPlayingSession'

import { MusicNowPlayingCard } from './MusicNowPlayingCard'
import { MusicWebHalo } from './MusicWebHalo'

type MusicNowPlayingSlotViewProps = {
  state: NowPlayingState
  positionMs: number | null
  controlPending: boolean
  controlAnnouncement?: string | null
  onPlay(): void
  onPause(): void
}

type MusicNowPlayingSession = ReturnType<typeof useNowPlayingSession>

export type MusicPositionClock = {
  now(): number
  setInterval(callback: () => void, delayMs: number): ReturnType<typeof setInterval>
  clearInterval(handle: ReturnType<typeof setInterval>): void
}

type MusicControlRequest = {
  operation: number
  sessionId: string
}

type MusicControlAnnouncement = {
  sessionId: string
  message: string
}

const CONTROL_ANNOUNCEMENT_MS = 3_000
const CONTROL_ERROR_MESSAGE = 'No se pudo controlar la reproducción.'
const SESSION_ERROR_MESSAGE = 'No se pudo detectar la reproducción actual.'
const POSITION_UPDATE_MS = 1_000
const SYSTEM_POSITION_CLOCK: MusicPositionClock = {
  now: () => Date.now(),
  setInterval: (callback, delayMs) => setInterval(callback, delayMs),
  clearInterval: handle => clearInterval(handle),
}

export function isMusicControlRequestCurrent(
  request: MusicControlRequest,
  currentOperation: number,
  currentSessionId: string | null,
  disposed: boolean,
): boolean {
  return !disposed
    && request.operation === currentOperation
    && request.sessionId === currentSessionId
}

export function MusicNowPlayingSlotView({
  state,
  positionMs,
  controlPending,
  controlAnnouncement = null,
  onPlay,
  onPause,
}: MusicNowPlayingSlotViewProps) {
  const { t } = useI18n()
  if (state.status === 'error') {
    return (
      <span className="sr-only" aria-live="polite">
        {t(SESSION_ERROR_MESSAGE)}
      </span>
    )
  }

  if (state.status !== 'active' || !state.snapshot) return null

  const seed = createMusicVisualSeed(state.snapshot)
  return (
    <section
      data-music-now-playing-slot="true"
      className="relative isolate mx-auto h-[143px] w-full max-w-3xl overflow-hidden"
    >
      <MusicWebHalo seed={seed} />
      <div
        data-music-card-layer="true"
        className="absolute inset-0 z-10 flex items-center px-3 sm:px-4"
      >
        <MusicNowPlayingCard
          snapshot={state.snapshot}
          positionMs={positionMs}
          controlPending={controlPending}
          onPlay={onPlay}
          onPause={onPause}
        />
      </div>
      {controlAnnouncement ? (
        <span className="sr-only" aria-live="polite">{controlAnnouncement}</span>
      ) : null}
    </section>
  )
}

export function subscribeToReconciledMusicPosition(
  state: NowPlayingState,
  onPosition: (positionMs: number | null) => void,
  clock: MusicPositionClock,
): () => void {
  const snapshot = state.status === 'active' ? state.snapshot : null
  if (!snapshot) {
    onPosition(null)
    return () => undefined
  }

  const publish = () => onPosition(reconcilePositionMs(snapshot, clock.now()))
  publish()
  if (snapshot.state !== 'playing') return () => undefined

  const interval = clock.setInterval(publish, POSITION_UPDATE_MS)
  let cleaned = false
  return () => {
    if (cleaned) return
    cleaned = true
    clock.clearInterval(interval)
  }
}

function useReconciledMusicPosition(
  state: NowPlayingState,
  clock: MusicPositionClock,
): number | null {
  const visibleSnapshot = state.status === 'active' ? state.snapshot : null
  const [sample, setSample] = useState(() => ({
    snapshot: visibleSnapshot,
    positionMs: visibleSnapshot ? reconcilePositionMs(visibleSnapshot, clock.now()) : null,
  }))

  useEffect(() => subscribeToReconciledMusicPosition(
    state,
    positionMs => setSample({ snapshot: visibleSnapshot, positionMs }),
    clock,
  ), [clock, state, visibleSnapshot])

  return sample.snapshot === visibleSnapshot
    ? sample.positionMs
    : visibleSnapshot
      ? reconcilePositionMs(visibleSnapshot, clock.now())
      : null
}

export function MusicNowPlayingSlotController({
  session,
  positionClock = SYSTEM_POSITION_CLOCK,
}: {
  session: MusicNowPlayingSession
  positionClock?: MusicPositionClock
}) {
  const { t } = useI18n()
  const confirmedSessionId = session.status === 'active'
    ? session.snapshot?.sessionId ?? null
    : null
  const [controlAnnouncement, setControlAnnouncement] = useState<MusicControlAnnouncement | null>(null)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const operationRef = useRef(0)
  const disposedRef = useRef(false)
  const confirmedSessionIdRef = useRef(confirmedSessionId)
  const positionMs = useReconciledMusicPosition(session, positionClock)

  const clearAnnouncement = useCallback(() => {
    if (timeoutRef.current !== null) {
      clearTimeout(timeoutRef.current)
      timeoutRef.current = null
    }
    setControlAnnouncement(null)
  }, [])

  useEffect(() => {
    disposedRef.current = false
    return () => {
      disposedRef.current = true
      operationRef.current += 1
      if (timeoutRef.current !== null) clearTimeout(timeoutRef.current)
    }
  }, [])

  useEffect(() => {
    confirmedSessionIdRef.current = confirmedSessionId
    clearAnnouncement()
  }, [clearAnnouncement, confirmedSessionId])

  const runControl = useCallback(async (
    action: () => Promise<void>,
    sessionId: string,
  ) => {
    const request = { operation: ++operationRef.current, sessionId }
    clearAnnouncement()
    try {
      await action()
    } catch {
      if (!isMusicControlRequestCurrent(
        request,
        operationRef.current,
        confirmedSessionIdRef.current,
        disposedRef.current,
      )) return
      setControlAnnouncement({ sessionId, message: t(CONTROL_ERROR_MESSAGE) })
      timeoutRef.current = setTimeout(() => {
        timeoutRef.current = null
        if (isMusicControlRequestCurrent(
          request,
          operationRef.current,
          confirmedSessionIdRef.current,
          disposedRef.current,
        )) {
          setControlAnnouncement(null)
        }
      }, CONTROL_ANNOUNCEMENT_MS)
    }
  }, [clearAnnouncement, t])

  return (
    <MusicNowPlayingSlotView
      state={session}
      positionMs={positionMs}
      controlPending={session.controlPending}
      controlAnnouncement={controlAnnouncement?.sessionId === confirmedSessionId
        ? controlAnnouncement.message
        : null}
      onPlay={() => {
        if (confirmedSessionId) void runControl(session.play, confirmedSessionId)
      }}
      onPause={() => {
        if (confirmedSessionId) void runControl(session.pause, confirmedSessionId)
      }}
    />
  )
}

export function MusicNowPlayingSlot() {
  const session = useNowPlayingSession()
  return <MusicNowPlayingSlotController session={session} />
}
