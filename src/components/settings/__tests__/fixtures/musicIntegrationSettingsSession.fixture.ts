import { useEffect, useState } from 'react'

import type { NowPlayingState } from '@/lib/native/musicSessionState'

type FixtureStatus = 'not_granted' | 'granted_idle' | 'error'

function state(status: FixtureStatus): NowPlayingState {
  return {
    status,
    snapshot: null,
    error: status === 'error' ? 'fixture query failure' : null,
  }
}

export function useNowPlayingSession() {
  const [sessionState, setSessionState] = useState<NowPlayingState>(() => state('not_granted'))

  useEffect(() => {
    window.__setMusicSettingsStatus = status => setSessionState(state(status))
    requestAnimationFrame(() => { window.__MUSIC_SETTINGS_READY__ = true })
  }, [])

  return {
    ...sessionState,
    controlPending: false,
    refresh: async () => undefined,
    play: async () => undefined,
    pause: async () => undefined,
  }
}
