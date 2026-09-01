import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

import type { MusicPlaybackSnapshot } from '@/lib/native/musicSession'
import type { NowPlayingState } from '@/lib/native/musicSessionState'

import { DashboardPrimaryFlow } from '../DashboardPrimaryFlow'
import {
  MusicNowPlayingSlotView,
  subscribeToReconciledMusicPosition,
  type MusicPositionClock,
} from '../MusicNowPlayingSlot'

const SNAPSHOT: MusicPlaybackSnapshot = {
  sessionId: 'session-1',
  packageName: 'com.example.player',
  sourceLabel: 'Reproductor local',
  title: 'Una canción real',
  artist: 'Una artista',
  album: 'Un álbum',
  artworkDataUrl: null,
  state: 'paused',
  positionMs: 23_456,
  durationMs: 180_000,
  playbackSpeed: 1,
  updatedAtMs: 9_000,
  canPlay: true,
  canPause: true,
}

function renderSlot(state: NowPlayingState, overrides: {
  controlPending?: boolean
  controlAnnouncement?: string | null
  positionMs?: number | null
} = {}) {
  return renderToStaticMarkup(
    <MusicNowPlayingSlotView
      state={state}
      positionMs={overrides.positionMs === undefined ? state.snapshot?.positionMs ?? null : overrides.positionMs}
      controlPending={overrides.controlPending ?? false}
      controlAnnouncement={overrides.controlAnnouncement ?? null}
      onPlay={vi.fn()}
      onPause={vi.fn()}
    />,
  )
}

describe('MusicNowPlayingSlotView', () => {
  it('exports the live hook boundary used by Home', async () => {
    const slotModule = await import('../MusicNowPlayingSlot')

    expect(slotModule.MusicNowPlayingSlotController).toBeTypeOf('function')
    expect(slotModule.MusicNowPlayingSlot).toBeTypeOf('function')
  })

  it('exports the scoped reconciled-position subscription used by the live controller', async () => {
    const slotModule = await import('../MusicNowPlayingSlot')

    expect(slotModule.subscribeToReconciledMusicPosition).toBeTypeOf('function')
  })

  it('invalidates a control request when its confirmed session is replaced', async () => {
    const slotModule = await import('../MusicNowPlayingSlot')
    const isCurrent = slotModule.isMusicControlRequestCurrent
    const request = { operation: 4, sessionId: 'session-a' }

    expect(isCurrent?.(request, 4, 'session-a', false)).toBe(true)
    expect(isCurrent?.(request, 4, 'session-b', false)).toBe(false)
    expect(isCurrent?.(request, 5, 'session-a', false)).toBe(false)
    expect(isCurrent?.(request, 4, 'session-a', true)).toBe(false)
  })

  it.each(['checking', 'unsupported', 'not_granted', 'granted_idle'] as const)(
    'leaves zero DOM and zero layout space while the session is %s',
    status => {
      expect(renderSlot({ status, snapshot: null, error: null })).toBe('')
    },
  )

  it('exposes a read failure only to assistive technology without a visible shell', () => {
    const html = renderSlot({
      status: 'error',
      snapshot: null,
      error: 'android.provider.internal: verbose provider failure details',
    })

    expect(html).toBe('<span class="sr-only" aria-live="polite">No se pudo detectar la reproducción actual.</span>')
    expect(html).not.toContain('provider failure')
    expect(html).not.toContain('data-music-now-playing-slot')
    expect(html).not.toContain('<article')
  })

  it('composes exactly one clipped halo behind one centered card and forwards the confirmed snapshot', () => {
    const html = renderSlot(
      { status: 'active', snapshot: SNAPSHOT, error: null },
      {
        controlPending: true,
        controlAnnouncement: 'No se pudo controlar la reproducción.',
        positionMs: 67_890,
      },
    )

    expect(html).toContain('data-music-now-playing-slot="true"')
    expect(html).toContain('class="relative isolate mx-auto h-[143px] w-full max-w-3xl overflow-hidden"')
    expect(html.match(/viewBox="0 0 760 143"/g)).toHaveLength(1)
    expect(html.match(/data-music-card="true"/g)).toHaveLength(1)
    expect(html).toContain('data-music-card-layer="true"')
    expect(html).toContain('Una canción real')
    expect(html).toContain('Una artista')
    expect(html).toContain('Reproductor local')
    expect(html).toContain('data-position-ms="67890"')
    expect(html).not.toContain('data-position-ms="23456"')
    expect(html).toContain('aria-label="Reproducir Una canción real"')
    expect(html).toContain('aria-busy="true"')
    expect(html).toContain('<span class="sr-only" aria-live="polite">No se pudo controlar la reproducción.</span>')
  })

  it('fails closed when active status has no confirmed snapshot', () => {
    expect(renderSlot({ status: 'active', snapshot: null, error: null })).toBe('')
  })
})

describe('reconciled music position subscription', () => {
  function createClock(initialNowMs: number) {
    let nowMs = initialNowMs
    let intervalCallback: (() => void) | null = null
    const intervalHandle = {} as ReturnType<typeof setInterval>
    const scheduledDelays: number[] = []
    const clearedHandles: Array<ReturnType<typeof setInterval>> = []
    const clock: MusicPositionClock = {
      now: () => nowMs,
      setInterval: (callback, delayMs) => {
        intervalCallback = callback
        scheduledDelays.push(delayMs)
        return intervalHandle
      },
      clearInterval: handle => { clearedHandles.push(handle) },
    }

    return {
      clock,
      scheduledDelays,
      clearedHandles,
      advanceTo(nextNowMs: number) {
        nowMs = nextNowMs
        intervalCallback?.()
      },
    }
  }

  it('publishes reconciled playing position every second and cancels its scoped interval', () => {
    const harness = createClock(12_000)
    const positions: Array<number | null> = []
    const playing = {
      ...SNAPSHOT,
      state: 'playing' as const,
      positionMs: 20_000,
      updatedAtMs: 10_000,
      playbackSpeed: 1.25,
    }

    const cleanup = subscribeToReconciledMusicPosition(
      { status: 'active', snapshot: playing, error: null },
      positionMs => positions.push(positionMs),
      harness.clock,
    )
    harness.advanceTo(13_000)
    cleanup()

    expect(positions).toEqual([22_500, 23_750])
    expect(harness.scheduledDelays).toEqual([1_000])
    expect(harness.clearedHandles).toHaveLength(1)
  })

  it('publishes once without an interval when paused and publishes null while inactive', () => {
    const pausedHarness = createClock(50_000)
    const pausedPositions: Array<number | null> = []
    const cleanupPaused = subscribeToReconciledMusicPosition(
      { status: 'active', snapshot: SNAPSHOT, error: null },
      positionMs => pausedPositions.push(positionMs),
      pausedHarness.clock,
    )
    cleanupPaused()

    const idleHarness = createClock(50_000)
    const idlePositions: Array<number | null> = []
    const cleanupIdle = subscribeToReconciledMusicPosition(
      { status: 'granted_idle', snapshot: null, error: null },
      positionMs => idlePositions.push(positionMs),
      idleHarness.clock,
    )
    cleanupIdle()

    expect(pausedPositions).toEqual([23_456])
    expect(pausedHarness.scheduledDelays).toEqual([])
    expect(pausedHarness.clearedHandles).toEqual([])
    expect(idlePositions).toEqual([null])
    expect(idleHarness.scheduledDelays).toEqual([])
  })
})

describe('DashboardPrimaryFlow', () => {
  it('renders the production Home flow once in header, music, notice and journey order', () => {
    const html = renderToStaticMarkup(
      <DashboardPrimaryFlow
        header={<header data-primary-stage="header" />}
        mainLabel="Inicio"
        mainClassName="dashboard-main"
        title={<h1 data-primary-stage="title">Inicio</h1>}
        music={<section data-primary-stage="music" />}
        notice={<aside data-primary-stage="notice" />}
        journey={<div data-primary-stage="journey" />}
      />,
    )
    const stages = Array.from(html.matchAll(/data-primary-stage="([^"]+)"/g), match => match[1])

    expect(stages).toEqual(['header', 'title', 'music', 'notice', 'journey'])
    expect(stages.filter(stage => stage === 'music')).toHaveLength(1)
    expect(html).toContain('<main aria-label="Inicio" class="dashboard-main"')
    expect(html).toContain('data-marketing-capture="dashboard"')
  })
})
