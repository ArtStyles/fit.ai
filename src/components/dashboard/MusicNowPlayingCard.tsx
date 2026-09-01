'use client'

import Image from 'next/image'
import { Music2, Pause, Play } from 'lucide-react'

import type { MusicPlaybackSnapshot } from '@/lib/native/musicSession'
import { createMusicVisualSeed } from '@/lib/native/musicSessionState'

import { MusicPulseVisualizer } from './MusicPulseVisualizer'

export type MusicNowPlayingCardProps = {
  snapshot: MusicPlaybackSnapshot
  positionMs: number | null
  controlPending: boolean
  onPlay(): void
  onPause(): void
}

type PlaybackProgress = {
  positionMs: number
  durationMs: number
  value: number
}

function playbackProgress(positionMs: number | null, durationMs: number | null): PlaybackProgress | null {
  if (
    positionMs === null
    || durationMs === null
    || !Number.isFinite(positionMs)
    || !Number.isFinite(durationMs)
    || durationMs <= 0
  ) return null

  const safePositionMs = Math.max(0, positionMs)
  return {
    positionMs: safePositionMs,
    durationMs,
    value: Math.min(1, safePositionMs / durationMs),
  }
}

export function MusicNowPlayingCard({
  snapshot,
  positionMs,
  controlPending,
  onPlay,
  onPause,
}: MusicNowPlayingCardProps) {
  const playing = snapshot.state === 'playing'
  const controlAvailable = playing ? snapshot.canPause : snapshot.canPlay
  const controlLabel = `${playing ? 'Pausar' : 'Reproducir'} ${snapshot.title}`
  const seed = createMusicVisualSeed(snapshot)
  const progress = playbackProgress(positionMs, snapshot.durationMs)

  return (
    <article
      data-music-card="true"
      className="relative h-[90px] w-full overflow-hidden rounded-[19px] bg-[linear-gradient(135deg,hsl(var(--surface-2)),hsl(var(--surface-1))_60%,rgb(38_20_65))] px-3 py-2.5 shadow-[0_18px_40px_rgba(0,0,0,0.35),inset_0_1px_0_rgba(255,255,255,0.05)]"
    >
        <div className="flex h-full min-w-0 items-center gap-2.5">
          {snapshot.artworkDataUrl ? (
            <Image
              src={snapshot.artworkDataUrl}
              alt=""
              aria-hidden="true"
              data-music-artwork="image"
              width={52}
              height={52}
              unoptimized
              className="h-[52px] w-[52px] shrink-0 rounded-[15px] object-cover"
            />
          ) : (
            <div
              aria-hidden="true"
              data-music-artwork="fallback"
              className="grid h-[52px] w-[52px] shrink-0 place-items-center overflow-hidden rounded-[15px] bg-[radial-gradient(circle_at_68%_25%,rgb(216_180_254),transparent_27%),linear-gradient(145deg,rgb(91_33_182),rgb(168_85_247))] shadow-[inset_0_1px_0_rgba(255,255,255,0.22)]"
            >
              <Music2 aria-hidden="true" className="h-6 w-6 text-white" strokeWidth={2.35} />
            </div>
          )}

          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-bold leading-4 text-white">
              {snapshot.title}
            </p>
            <p className="mt-0.5 truncate text-[10px] leading-3.5 text-white/66">
              {snapshot.artist ?? snapshot.album ?? 'Artista desconocido'}
            </p>
            <div className="mt-1.5 flex min-w-0 items-center gap-2">
              <MusicPulseVisualizer playing={playing} positionMs={positionMs} seed={seed} />
              <span aria-hidden="true" className="h-0.5 w-0.5 shrink-0 rounded-full bg-white/28" />
              <span
                data-source-label="true"
                className="min-w-0 truncate text-[9px] font-medium leading-3 text-white/45"
              >
                {snapshot.sourceLabel}
              </span>
            </div>
          </div>

          <button
            type="button"
            aria-label={controlLabel}
            aria-busy={controlPending ? 'true' : undefined}
            disabled={!controlAvailable || controlPending}
            onClick={playing ? onPause : onPlay}
            data-touch-target-size="44"
            className="grid min-h-11 min-w-11 shrink-0 place-items-center rounded-full text-white transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-300 focus-visible:ring-offset-2 focus-visible:ring-offset-[hsl(var(--surface-1))] disabled:cursor-not-allowed disabled:opacity-45"
          >
            <span
              aria-hidden="true"
              data-control-visual-size="40"
              className="grid h-10 w-10 place-items-center rounded-full bg-violet-500 shadow-[0_8px_22px_rgba(124,58,237,0.42),inset_0_1px_0_rgba(255,255,255,0.24)]"
            >
              {playing ? (
                <Pause className="h-[17px] w-[17px] fill-current" strokeWidth={2.2} />
              ) : (
                <Play className="ml-0.5 h-[17px] w-[17px] fill-current" strokeWidth={2.2} />
              )}
            </span>
          </button>
        </div>

        {progress !== null ? (
          <div
            aria-hidden="true"
            data-music-progress="true"
            data-position-ms={progress.positionMs}
            data-duration-ms={progress.durationMs}
            data-progress-value={progress.value}
            className="absolute inset-x-0 bottom-0 h-0.5 overflow-hidden bg-white/[0.055]"
          >
            <span
              className="block h-full bg-gradient-to-r from-violet-600 via-violet-400 to-fuchsia-300"
              style={{ width: `${progress.value * 100}%` }}
            />
          </div>
        ) : null}
    </article>
  )
}
