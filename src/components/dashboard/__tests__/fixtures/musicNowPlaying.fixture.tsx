import { createRoot } from 'react-dom/client'
import { useEffect, useState } from 'react'

import '@/styles/globals.css'
import type { MusicPlaybackSnapshot } from '@/lib/native/musicSession'
import {
  MusicNowPlayingSlotController,
  type MusicPositionClock,
} from '../../MusicNowPlayingSlot'

type FixtureState = {
  snapshot: MusicPlaybackSnapshot
  controlPending: boolean
}

type FixturePatch = Partial<MusicPlaybackSnapshot> & {
  controlPending?: boolean
}

const LONG_SNAPSHOT: MusicPlaybackSnapshot = {
  sessionId: 'fixture-session',
  packageName: 'com.example.fixture',
  sourceLabel: 'ReproductorLocalConUnNombreExtremadamenteLargoParaValidarElRecorte',
  title: 'CanciónConUnTítuloExtremadamenteLargoSinEspaciosQueDebeQuedarRecortado',
  artist: 'ArtistaConUnNombreExtremadamenteLargoSinEspaciosQueNuncaDebeTocarElControl',
  album: 'Álbum de prueba',
  artworkDataUrl: null,
  state: 'paused',
  positionMs: 23_456,
  durationMs: 180_000,
  playbackSpeed: 1,
  updatedAtMs: 9_000,
  canPlay: true,
  canPause: true,
}

const FIXTURE_POSITION_CLOCK: MusicPositionClock = {
  now: () => LONG_SNAPSHOT.updatedAtMs,
  setInterval: (callback, delayMs) => setInterval(callback, delayMs),
  clearInterval: handle => clearInterval(handle),
}

function MusicFixture() {
  const [fixture, setFixture] = useState<FixtureState>({
    snapshot: LONG_SNAPSHOT,
    controlPending: false,
  })

  useEffect(() => {
    window.__setMusicFixture = patch => {
      setFixture(current => ({
        snapshot: { ...current.snapshot, ...patch },
        controlPending: patch.controlPending ?? current.controlPending,
      }))
    }
    requestAnimationFrame(() => { window.__MUSIC_NOW_PLAYING_READY__ = true })
  }, [])

  const runControl = async (action: 'play' | 'pause') => {
    window.__musicControlCalls[action] += 1
    if (window.__rejectNextMusicControl) {
      window.__rejectNextMusicControl = false
      throw new Error('fixture control failure')
    }
  }

  return (
    <MusicNowPlayingSlotController
      positionClock={FIXTURE_POSITION_CLOCK}
      session={{
        status: 'active',
        snapshot: fixture.snapshot,
        error: null,
        controlPending: fixture.controlPending,
        play: () => runControl('play'),
        pause: () => runControl('pause'),
      }}
    />
  )
}

const root = document.getElementById('root')
if (!root) throw new Error('Music now playing fixture root is missing.')

window.__musicControlCalls = { play: 0, pause: 0 }
window.__rejectNextMusicControl = false
window.__unhandledMusicRejections = 0
window.addEventListener('unhandledrejection', event => {
  window.__unhandledMusicRejections += 1
  event.preventDefault()
})

createRoot(root).render(<MusicFixture />)

declare global {
  interface Window {
    __MUSIC_NOW_PLAYING_READY__?: boolean
    __musicControlCalls: { play: number; pause: number }
    __rejectNextMusicControl: boolean
    __setMusicFixture?: (patch: FixturePatch) => void
    __unhandledMusicRejections: number
  }
}
