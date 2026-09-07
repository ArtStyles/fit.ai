import { createRoot } from 'react-dom/client'
import { startTransition, Suspense, useEffect, useState } from 'react'

import '@/styles/globals.css'
import { I18nProvider } from '@/components/i18n/I18nProvider'
import type { AppLanguage } from '@/lib/i18n'
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
  canSkipPrevious: true,
  canSkipNext: true,
  canSeek: true,
}

const FIXTURE_POSITION_CLOCK: MusicPositionClock = {
  now: () => LONG_SNAPSHOT.updatedAtMs,
  setInterval: (callback, delayMs) => setInterval(callback, delayMs),
  clearInterval: handle => clearInterval(handle),
}

const SUSPENDED_TRANSITION = new Promise<void>(() => undefined)

function SuspendedMusicSessionGate({ suspend }: { suspend: boolean }) {
  if (!suspend) return null

  window.__musicSuspendedGateReached = true
  throw SUSPENDED_TRANSITION
}

function MusicFixture() {
  const [fixture, setFixture] = useState<FixtureState>({
    snapshot: LONG_SNAPSHOT,
    controlPending: false,
  })
  const [suspendTransition, setSuspendTransition] = useState(false)

  useEffect(() => {
    window.__setMusicFixture = patch => {
      setFixture(current => ({
        snapshot: { ...current.snapshot, ...patch },
        controlPending: patch.controlPending ?? current.controlPending,
      }))
    }
    window.__startSuspendedMusicSessionTransition = patch => {
      window.__musicSuspendedGateReached = false
      startTransition(() => {
        setFixture(current => ({
          snapshot: { ...current.snapshot, ...patch },
          controlPending: patch.controlPending ?? current.controlPending,
        }))
        setSuspendTransition(true)
      })
    }
    requestAnimationFrame(() => { window.__MUSIC_NOW_PLAYING_READY__ = true })
  }, [])

  const runControl = async (
    action: 'play' | 'pause' | 'previous' | 'next',
    sessionId: string,
  ) => {
    window.__musicControlCalls[action] += 1
    window.__musicControlSessionIds.push(sessionId)
    if (window.__deferNextMusicControl) {
      window.__deferNextMusicControl = false
      try {
        await new Promise<void>((_resolve, reject) => {
          window.__rejectDeferredMusicControl = () => {
            window.__rejectDeferredMusicControl = undefined
            reject(new Error('deferred fixture control failure'))
          }
        })
      } finally {
        window.__deferredMusicControlSettled = true
      }
      return
    }
    if (window.__rejectNextMusicControl) {
      window.__rejectNextMusicControl = false
      throw new Error('fixture control failure')
    }
  }

  return (
    <Suspense fallback={null}>
      <MusicNowPlayingSlotController
        positionClock={FIXTURE_POSITION_CLOCK}
        session={{
          status: 'active',
          snapshot: fixture.snapshot,
          error: null,
          controlPending: fixture.controlPending,
          refresh: async () => undefined,
          play: sessionId => runControl('play', sessionId),
          pause: sessionId => runControl('pause', sessionId),
          previous: sessionId => runControl('previous', sessionId),
          next: sessionId => runControl('next', sessionId),
          seekTo: async (sessionId, positionMs) => {
            window.__musicControlSessionIds.push(sessionId)
            window.__musicControlCalls.seekTo.push(positionMs)
          },
        }}
      />
      <SuspendedMusicSessionGate suspend={suspendTransition} />
    </Suspense>
  )
}

function LocalizedMusicFixture() {
  const [language, setLanguage] = useState<AppLanguage>('es')

  useEffect(() => {
    window.__setMusicFixtureLanguage = setLanguage
  }, [])

  return (
    <I18nProvider language={language} syncDocumentLanguage={false}>
      <MusicFixture />
    </I18nProvider>
  )
}

const root = document.getElementById('root')
if (!root) throw new Error('Music now playing fixture root is missing.')

window.__musicControlCalls = { play: 0, pause: 0, previous: 0, next: 0, seekTo: [] }
window.__musicControlSessionIds = []
window.__deferNextMusicControl = false
window.__deferredMusicControlSettled = false
window.__musicSuspendedGateReached = false
window.__rejectNextMusicControl = false
window.__unhandledMusicRejections = 0
window.addEventListener('unhandledrejection', event => {
  window.__unhandledMusicRejections += 1
  event.preventDefault()
})

createRoot(root).render(<LocalizedMusicFixture />)

declare global {
  interface Window {
    __MUSIC_NOW_PLAYING_READY__?: boolean
    __deferNextMusicControl: boolean
    __deferredMusicControlSettled: boolean
    __musicControlCalls: {
      play: number
      pause: number
      previous: number
      next: number
      seekTo: number[]
    }
    __musicControlSessionIds: string[]
    __musicSuspendedGateReached: boolean
    __rejectDeferredMusicControl?: () => void
    __rejectNextMusicControl: boolean
    __setMusicFixture?: (patch: FixturePatch) => void
    __setMusicFixtureLanguage?: (language: AppLanguage) => void
    __startSuspendedMusicSessionTransition?: (patch: FixturePatch) => void
    __unhandledMusicRejections: number
  }
}
