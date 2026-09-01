import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { I18nProvider } from '@/components/i18n/I18nProvider'
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
  language?: 'es' | 'en'
} = {}) {
  return renderToStaticMarkup(
    <I18nProvider language={overrides.language ?? 'es'} syncDocumentLanguage={false}>
      <MusicNowPlayingCard
        snapshot={snapshot}
        positionMs={overrides.positionMs === undefined ? 90_000 : overrides.positionMs}
        controlPending={overrides.controlPending ?? false}
        onPlay={() => undefined}
        onPause={() => undefined}
      />
    </I18nProvider>,
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
    const beforeStart = renderCard(PLAYING_SNAPSHOT, { positionMs: -1_000 })
    const beyondDuration = renderCard(PLAYING_SNAPSHOT, { positionMs: 250_000 })

    expect(middle).toContain('data-position-ms="90000"')
    expect(middle).toContain('data-duration-ms="180000"')
    expect(middle).toContain('data-progress-value="0.5"')
    expect(beforeStart).toContain('data-position-ms="0"')
    expect(beforeStart).toContain('data-progress-value="0"')
    expect(beyondDuration).toContain('data-progress-value="1"')
  })

  it('omits progress and invalid numeric output when position or duration is not finite and valid', () => {
    const invalidPositions = [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, null]
    const invalidDurations = [
      Number.NaN,
      Number.POSITIVE_INFINITY,
      Number.NEGATIVE_INFINITY,
      null,
      0,
      -1,
    ]

    for (const positionMs of invalidPositions) {
      const html = renderCard(PLAYING_SNAPSHOT, { positionMs })
      expect(html).not.toContain('data-music-progress="true"')
      expect(html).not.toMatch(/NaN|Infinity/)
    }

    for (const durationMs of invalidDurations) {
      const html = renderCard({ ...PLAYING_SNAPSHOT, durationMs })
      expect(html).not.toContain('data-music-progress="true"')
      expect(html).not.toMatch(/NaN|Infinity/)
    }
  })

  it('exports only the standalone music surface and leaves halo composition to its owner', () => {
    const html = renderCard()

    expect(html).toMatch(/^<article[^>]*data-music-card="true"/)
    expect(html).not.toContain('data-music-now-playing')
    expect(html).not.toContain('data-music-web-spoke')
    expect(html).not.toContain('data-music-web-ring')
    expect(html).not.toContain('viewBox="0 0 760 143"')
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

  it('localizes fallback artist and play or pause labels through the app provider', () => {
    const unknownArtist = renderCard({
      ...PLAYING_SNAPSHOT,
      artist: null,
      album: null,
    }, { language: 'en' })
    const paused = renderCard({ ...PLAYING_SNAPSHOT, state: 'paused' }, { language: 'en' })

    expect(unknownArtist).toContain('Unknown artist')
    expect(unknownArtist).toContain('aria-label="Pause Blinding Lights"')
    expect(paused).toContain('aria-label="Play Blinding Lights"')
    expect(`${unknownArtist}${paused}`).not.toMatch(/Artista desconocido|Pausar Blinding Lights|Reproducir Blinding Lights/)
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

  it('normalizes null, negative and non-finite positions before deriving bar output', () => {
    const atZero = renderToStaticMarkup(
      <MusicPulseVisualizer playing positionMs={0} seed={8_137} />,
    )

    for (const positionMs of [null, -1, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      const html = renderToStaticMarkup(
        <MusicPulseVisualizer playing positionMs={positionMs} seed={8_137} />,
      )
      expect(html).toBe(atZero)
      expect(html).not.toMatch(/NaN|Infinity/)
    }
  })
})
