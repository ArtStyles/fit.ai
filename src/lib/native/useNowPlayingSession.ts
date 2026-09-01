'use client'

import { App } from '@capacitor/app'
import { useCallback, useEffect, useMemo, useState } from 'react'

import { musicSessionAdapter, type MusicSessionAdapter } from './musicSession'
import {
  createNowPlayingSessionController,
  type NowPlayingSessionController,
  type NowPlayingState,
} from './musicSessionState'

const INITIAL_STATE: NowPlayingState = { status: 'checking', snapshot: null, error: null }

type AppStateListenerHandle = { remove(): Promise<void> }
type RegisterAppStateListener = (
  eventName: 'appStateChange',
  listener: (state: { isActive: boolean }) => void,
) => Promise<AppStateListenerHandle>

export function subscribeToForegroundAppState(
  registerListener: RegisterAppStateListener,
  onForeground: () => void,
): () => void {
  let disposed = false
  let removed = false
  let listener: AppStateListenerHandle | null = null
  const removeListener = (nextListener: AppStateListenerHandle) => {
    if (removed) return
    removed = true
    void nextListener.remove()
  }
  const registration = registerListener('appStateChange', ({ isActive }) => {
    if (isActive) onForeground()
  })
  void registration.then(nextListener => {
    if (disposed) removeListener(nextListener)
    else listener = nextListener
  })

  return () => {
    disposed = true
    if (listener) removeListener(listener)
    else void registration.then(removeListener)
  }
}

export function createControlPendingTracker(onPendingChange: (pending: boolean) => void) {
  let disposed = false
  let pendingCount = 0

  return {
    begin() {
      if (disposed) return () => undefined
      pendingCount += 1
      onPendingChange(true)
      let completed = false
      return () => {
        if (completed || disposed) return
        completed = true
        pendingCount -= 1
        onPendingChange(pendingCount > 0)
      }
    },
    dispose() {
      if (disposed) return
      disposed = true
      if (pendingCount > 0) onPendingChange(false)
      pendingCount = 0
    },
  }
}

export function createNowPlayingRefreshAction(
  controller: Pick<NowPlayingSessionController, 'refresh'>,
): () => Promise<void> {
  return () => controller.refresh()
}

export function useNowPlayingSession(adapter: MusicSessionAdapter = musicSessionAdapter) {
  const [state, setState] = useState<NowPlayingState>(INITIAL_STATE)
  const [controlPending, setControlPending] = useState(false)
  const controller = useMemo(
    () => createNowPlayingSessionController(adapter, setState),
    [adapter],
  )
  const refresh = useMemo(() => createNowPlayingRefreshAction(controller), [controller])
  const controlTracker = useMemo(
    () => createControlPendingTracker(setControlPending),
    // Pending controls belong to one adapter lifecycle, even though the tracker does not call it directly.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [adapter],
  )

  useEffect(() => {
    void controller.start()
    return () => {
      void controller.stop()
    }
  }, [controller])

  useEffect(() => {
    return subscribeToForegroundAppState(
      (eventName, listener) => App.addListener(eventName, listener),
      () => void refresh(),
    )
  }, [refresh])

  useEffect(() => () => controlTracker.dispose(), [controlTracker])

  const control = useCallback(async (action: 'play' | 'pause') => {
    const complete = controlTracker.begin()
    try {
      await adapter[action]()
    } finally {
      complete()
    }
  }, [adapter, controlTracker])

  return {
    ...state,
    controlPending,
    refresh,
    play: () => control('play'),
    pause: () => control('pause'),
  }
}
