import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import type { MusicPlaybackSnapshot } from '@/lib/native/musicSession'

import { MusicNowPlayingCard } from '../MusicNowPlayingCard'
import { MusicPulseVisualizer } from '../MusicPulseVisualizer'
import { MusicWebHalo } from '../MusicWebHalo'

const PLAYING_SNAPSHOT: MusicPlaybackSnapshot = {
  sessionId: 'session-1',
  packageName: 'com.example.player',
  sourceLabel: 'Spotify',
  title: 'Blinding Lights',
  artist: 'The Weeknd',
  album: 'After Hours',
  artworkDataUrl: null,
  state: 'playing',
  positionMs: 90_000,
  durationMs: 180_000,
  playbackSpeed: 1,
  updatedAtMs: 1_000,
  canPlay: true,
  canPause: true,
}

function renderCard(snapshot: MusicPlaybackSnapshot = PLAYING_SNAPSHOT, overrides: {
  positionMs?: number | null
  controlPending?: boolean
} = {}) {
  return renderToStaticMarkup(
    <MusicNowPlayingCard
      snapshot={snapshot}
      positionMs={overrides.positionMs === undefined ? 90_000 : overrides.positionMs}
      controlPending={overrides.controlPending ?? false}
      onPlay={() => undefined}
      onPause={() => undefined}
    />,
  )
}

describe('MusicNowPlayingCard', () => {
  it('communicates track metadata, a neutral source label and the available pause action', () => {
    const html = renderCard()

    expect(html).toContain('Blinding Lights')
    expect(html).toContain('The Weeknd')
    expect(html).toContain('Spotify')
    expect(html).toMatch(/<span[^>]*data-source-label="true"[^>]*>Spotify<\/span>/)
    expect(html).toContain('aria-label="Pausar Blinding Lights"')
    expect(html).not.toMatch(/aria-label="Spotify"|alt="Spotify"|data-provider-brand/)
    expect(html.match(/data-music-bar="true"/g)).toHaveLength(4)
    expect(html).not.toContain('disabled=""')
  })

  it('exposes clamped playback progress as semantic values', () => {
    const middle = renderCard()
    const beyondDuration = renderCard(PLAYING_SNAPSHOT, { positionMs: 250_000 })

    expect(middle).toContain('data-position-ms="90000"')
    expect(middle).toContain('data-duration-ms="180000"')
    expect(middle).toContain('data-progress-value="0.5"')
    expect(beyondDuration).toContain('data-progress-value="1"')
  })

  it('uses decorative session artwork when supplied and a provider-neutral Vekira fallback otherwise', () => {
    const artwork = renderCard({
      ...PLAYING_SNAPSHOT,
      artworkDataUrl: 'data:image/png;base64,c2FmZS1hcnR3b3Jr',
    })
    const fallback = renderCard()

    expect(artwork).toMatch(/<img(?=[^>]*data-music-artwork="image")(?=[^>]*alt="")(?=[^>]*aria-hidden="true")[^>]*>/)
    expect(fallback).toContain('data-music-artwork="fallback"')
    expect(fallback).not.toMatch(/aria-label="Spotify"|alt="Spotify"|data-provider-brand/)
  })

  it('disables only the unavailable or pending dynamic action', () => {
    const cannotPause = renderCard({ ...PLAYING_SNAPSHOT, canPause: false })
    const paused = renderCard({ ...PLAYING_SNAPSHOT, state: 'paused', canPlay: true })
    const pending = renderCard(PLAYING_SNAPSHOT, { controlPending: true })

    expect(cannotPause).toContain('aria-label="Pausar Blinding Lights"')
    expect(cannotPause).toContain('disabled=""')
    expect(paused).toContain('aria-label="Reproducir Blinding Lights"')
    expect(paused).not.toContain('disabled=""')
    expect(pending).toContain('aria-busy="true"')
    expect(pending).toContain('disabled=""')
  })
})

describe('music card decoration', () => {
  it('renders a non-interactive 760 by 143 halo with 24 spokes and 8 curved rings', () => {
    const html = renderToStaticMarkup(<MusicWebHalo seed={8_137} />)

    expect(html).toContain('aria-hidden="true"')
    expect(html).toContain('focusable="false"')
    expect(html).toContain('viewBox="0 0 760 143"')
    expect(html).toContain('preserveAspectRatio="none"')
    expect(html.match(/data-music-web-spoke="true"/g)).toHaveLength(24)
    expect(html.match(/data-music-web-ring="true"/g)).toHaveLength(8)
  })

  it('keeps exactly four paused bars stable while deriving their heights from position', () => {
    const first = renderToStaticMarkup(
      <MusicPulseVisualizer playing={false} positionMs={21_000} seed={8_137} />,
    )
    const same = renderToStaticMarkup(
      <MusicPulseVisualizer playing={false} positionMs={21_000} seed={8_137} />,
    )
    const later = renderToStaticMarkup(
      <MusicPulseVisualizer playing={false} positionMs={22_000} seed={8_137} />,
    )

    expect(first).toBe(same)
    expect(first.match(/data-music-bar="true"/g)).toHaveLength(4)
    expect(first).not.toBe(later)
  })
})
