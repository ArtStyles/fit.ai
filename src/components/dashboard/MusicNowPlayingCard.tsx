'use client'

import Image from 'next/image'
import { Music2, Pause, Play, SkipBack, SkipForward } from 'lucide-react'
import { useRef, useState } from 'react'

import { useI18n } from '@/components/i18n/I18nProvider'
import type { MusicPlaybackSnapshot } from '@/lib/native/musicSession'
import { createMusicVisualSeed } from '@/lib/native/musicSessionState'

import { MusicPulseVisualizer } from './MusicPulseVisualizer'

export type MusicNowPlayingCardProps = {
  snapshot: MusicPlaybackSnapshot
  positionMs: number | null
  controlPending: boolean
  onPlay(): void
  onPause(): void
  onPrevious(): void
  onNext(): void
  onSeek(positionMs: number): void
}

type PlaybackProgress = {
  positionMs: number
  durationMs: number
  value: number
}

function formatPlaybackTime(positionMs: number): string {
  const totalSeconds = Math.floor(Math.max(0, positionMs) / 1_000)
  const seconds = totalSeconds % 60
  const totalMinutes = Math.floor(totalSeconds / 60)
  const minutes = totalMinutes % 60
  const hours = Math.floor(totalMinutes / 60)
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
    : `${minutes}:${String(seconds).padStart(2, '0')}`
}

function playbackProgress(positionMs: number | null, durationMs: number | null): PlaybackProgress | null {
  if (
    positionMs === null
    || durationMs === null
    || !Number.isFinite(positionMs)
    || !Number.isFinite(durationMs)
    || durationMs <= 0
  ) return null

  const safePositionMs = Math.min(durationMs, Math.max(0, positionMs))
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
  onPrevious,
  onNext,
  onSeek,
}: MusicNowPlayingCardProps) {
  const { t } = useI18n()
  const playing = snapshot.state === 'playing'
  const controlAvailable = playing ? snapshot.canPause : snapshot.canPlay
  const controlLabel = t(playing ? 'Pausar {title}' : 'Reproducir {title}', { title: snapshot.title })
  const seed = createMusicVisualSeed(snapshot)
  const progress = playbackProgress(positionMs, snapshot.durationMs)
  const [seekDraftMs, setSeekDraftMs] = useState<number | null>(null)
  const pointerSeekActiveRef = useRef(false)
  const displayedProgress = progress === null
    ? null
    : playbackProgress(seekDraftMs ?? progress.positionMs, progress.durationMs)
  const seekDisabled = !snapshot.canSeek || controlPending
  const commitSeek = (value: string) => {
    if (progress === null || seekDisabled) {
      setSeekDraftMs(null)
      return
    }
    const nextPositionMs = Math.min(progress.durationMs, Math.max(0, Number(value)))
    setSeekDraftMs(null)
    if (Number.isFinite(nextPositionMs)) onSeek(nextPositionMs)
  }

  return (
    <article
      data-music-card="true"
      aria-busy={controlPending ? 'true' : undefined}
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
              {snapshot.artist ?? snapshot.album ?? t('Artista desconocido')}
            </p>
            <div className="mt-1.5 flex min-w-0 items-center gap-2">
              <MusicPulseVisualizer playing={playing} positionMs={positionMs} seed={seed} />
              <span aria-hidden="true" className="h-0.5 w-0.5 shrink-0 rounded-full bg-white/28" />
              <span
                data-source-label="true"
                className="hidden min-w-0 truncate text-[9px] font-medium leading-3 text-white/45 min-[350px]:block"
              >
                {snapshot.sourceLabel}
              </span>
            </div>
          </div>

          <div data-music-transport="true" className="flex shrink-0 items-center">
            <button
              type="button"
              aria-label={t('Anterior')}
              disabled={!snapshot.canSkipPrevious || controlPending}
              onClick={onPrevious}
              data-touch-target-size="44"
              className="grid min-h-11 min-w-11 place-items-center rounded-full text-white/78 transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-300 disabled:cursor-not-allowed disabled:opacity-30"
            >
              <SkipBack aria-hidden="true" className="h-[16px] w-[16px] fill-current" strokeWidth={2} />
            </button>
            <button
              type="button"
              aria-label={controlLabel}
              disabled={!controlAvailable || controlPending}
              onClick={playing ? onPause : onPlay}
              data-touch-target-size="44"
              className="grid min-h-11 min-w-11 place-items-center rounded-full text-white transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-300 focus-visible:ring-offset-2 focus-visible:ring-offset-[hsl(var(--surface-1))] disabled:cursor-not-allowed disabled:opacity-45"
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
            <button
              type="button"
              aria-label={t('Siguiente')}
              disabled={!snapshot.canSkipNext || controlPending}
              onClick={onNext}
              data-touch-target-size="44"
              className="grid min-h-11 min-w-11 place-items-center rounded-full text-white/78 transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-300 disabled:cursor-not-allowed disabled:opacity-30"
            >
              <SkipForward aria-hidden="true" className="h-[16px] w-[16px] fill-current" strokeWidth={2} />
            </button>
          </div>
        </div>

        {displayedProgress !== null ? (
          <div
            data-music-progress="true"
            data-position-ms={displayedProgress.positionMs}
            data-duration-ms={displayedProgress.durationMs}
            data-progress-value={displayedProgress.value}
            className="absolute inset-x-0 bottom-0 h-3"
          >
            <span aria-hidden="true" className="absolute inset-x-0 bottom-0 h-[3px] bg-white/[0.07]" />
            <span
              aria-hidden="true"
              className="absolute bottom-0 left-0 h-[3px] bg-gradient-to-r from-violet-600 via-violet-400 to-fuchsia-300"
              style={{ width: `${displayedProgress.value * 100}%` }}
            />
            <input
              type="range"
              aria-label={t('Posición de {title}', { title: snapshot.title })}
              aria-valuetext={t('{position} de {duration}', {
                position: formatPlaybackTime(displayedProgress.positionMs),
                duration: formatPlaybackTime(displayedProgress.durationMs),
              })}
              min={0}
              max={displayedProgress.durationMs}
              step={1_000}
              value={displayedProgress.positionMs}
              disabled={seekDisabled}
              onPointerDown={() => {
                pointerSeekActiveRef.current = true
              }}
              onChange={event => setSeekDraftMs(Number(event.currentTarget.value))}
              onPointerUp={event => {
                if (!pointerSeekActiveRef.current) return
                pointerSeekActiveRef.current = false
                commitSeek(event.currentTarget.value)
              }}
              onPointerCancel={() => {
                pointerSeekActiveRef.current = false
                setSeekDraftMs(null)
              }}
              onKeyUp={event => {
                if (['ArrowLeft', 'ArrowRight', 'Home', 'End', 'PageUp', 'PageDown'].includes(event.key)) {
                  commitSeek(event.currentTarget.value)
                }
              }}
              onBlur={event => {
                if (seekDraftMs !== null) commitSeek(event.currentTarget.value)
              }}
              className="absolute inset-x-0 -bottom-1 h-4 w-full cursor-pointer appearance-none bg-transparent focus-visible:outline-none disabled:cursor-not-allowed [&::-moz-range-thumb]:h-2.5 [&::-moz-range-thumb]:w-2.5 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-violet-200 [&::-moz-range-thumb]:opacity-0 focus-visible:[&::-moz-range-thumb]:opacity-100 active:[&::-moz-range-thumb]:opacity-100 [&::-moz-range-track]:bg-transparent [&::-webkit-slider-runnable-track]:h-4 [&::-webkit-slider-runnable-track]:bg-transparent [&::-webkit-slider-thumb]:mt-[3px] [&::-webkit-slider-thumb]:h-2.5 [&::-webkit-slider-thumb]:w-2.5 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-violet-200 [&::-webkit-slider-thumb]:opacity-0 focus-visible:[&::-webkit-slider-thumb]:opacity-100 active:[&::-webkit-slider-thumb]:opacity-100"
            />
          </div>
        ) : null}
    </article>
  )
}
