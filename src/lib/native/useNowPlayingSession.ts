'use client'

import { App } from '@capacitor/app'
import { useCallback, useEffect, useMemo, useState } from 'react'

import { musicSessionAdapter, type MusicSessionAdapter } from './musicSession'
import {
  createNowPlayingSessionController,
  type NowPlayingState,
} from './musicSessionState'

const INITIAL_STATE: NowPlayingState = { status: 'checking', snapshot: null, error: null }

export function useNowPlayingSession(adapter: MusicSessionAdapter = musicSessionAdapter) {
  const [state, setState] = useState<NowPlayingState>(INITIAL_STATE)
  const [controlPending, setControlPending] = useState(false)
  const controller = useMemo(
    () => createNowPlayingSessionController(adapter, setState),
    [adapter],
  )

  useEffect(() => {
    void controller.start()
    return () => {
      void controller.stop()
    }
  }, [controller])

  useEffect(() => {
    let disposed = false
    let removed = false
    let listener: Awaited<ReturnType<typeof App.addListener>> | null = null
    const removeListener = (nextListener: Awaited<ReturnType<typeof App.addListener>>) => {
      if (removed) return
      removed = true
      void nextListener.remove()
    }
    const registration = App.addListener('appStateChange', ({ isActive }) => {
      if (isActive) void controller.refresh()
    })
    void registration.then(nextListener => {
      if (disposed) {
        removeListener(nextListener)
      } else {
        listener = nextListener
      }
    })

    return () => {
      disposed = true
      if (listener) removeListener(listener)
      else void registration.then(removeListener)
    }
  }, [controller])

  const control = useCallback(async (action: 'play' | 'pause') => {
    setControlPending(true)
    try {
      await adapter[action]()
    } finally {
      setControlPending(false)
    }
  }, [adapter])

  return {
    ...state,
    controlPending,
    play: () => control('play'),
    pause: () => control('pause'),
  }
}
