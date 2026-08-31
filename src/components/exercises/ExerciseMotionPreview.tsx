'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'
import { ExerciseImage } from './ExerciseImage'

type ExerciseMotionPreviewProps = {
  posterSrc: string | null
  motionSrc: string | null
  alt: string
  language?: 'es' | 'en'
  className?: string
}

const copy = {
  es: {
    error: 'No se pudo cargar la demostraci\u00f3n visual.',
    pause: 'Pausar movimiento',
    play: 'Ver movimiento',
    title: 'Demostraci\u00f3n visual',
  },
  en: {
    error: 'The visual demonstration could not be loaded.',
    pause: 'Pause movement',
    play: 'View movement',
    title: 'Visual demonstration',
  },
} as const

export function ExerciseMotionPreview({
  posterSrc,
  motionSrc,
  alt,
  language = 'es',
  className,
}: ExerciseMotionPreviewProps) {
  const [isPlaying, setIsPlaying] = useState(false)
  const [activeMotionSrc, setActiveMotionSrc] = useState<string | null>(null)
  const [revision, setRevision] = useState(0)
  const [errorMessage, setErrorMessage] = useState('')
  const labels = copy[language]
  const isCurrentMotionPlaying = isPlaying && activeMotionSrc === motionSrc

  if (!motionSrc) {
    return <ExerciseImage src={posterSrc} alt={alt} variant="hero" zoomable className={className} />
  }

  function playMotion() {
    setErrorMessage('')
    setActiveMotionSrc(motionSrc)
    setRevision(currentRevision => currentRevision + 1)
    setIsPlaying(true)
  }

  function pauseMotion() {
    setIsPlaying(false)
    setActiveMotionSrc(null)
  }

  function handleMotionError() {
    setIsPlaying(false)
    setActiveMotionSrc(null)
    setErrorMessage(labels.error)
  }

  return (
    <section className={cn('space-y-3', className)} aria-label={labels.title}>
      {isCurrentMotionPlaying ? (
        <div className="relative aspect-[16/10] overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900">
          {/* Animated WebP requires a native img: Next/Image optimization can strip its animation. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            key={`${motionSrc}-${revision}`}
            data-motion-preview
            data-motion-revision={revision}
            src={motionSrc}
            alt={alt}
            width={512}
            height={512}
            className="h-full w-full object-contain"
            onError={handleMotionError}
          />
        </div>
      ) : (
        <ExerciseImage src={posterSrc} alt={alt} variant="hero" zoomable />
      )}

      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-medium text-muted-foreground">{labels.title}</p>
        <button
          type="button"
          aria-pressed={isCurrentMotionPlaying}
          onClick={isCurrentMotionPlaying ? pauseMotion : playMotion}
          className="min-h-11 min-w-11 rounded-lg border border-border px-3 py-2 text-sm font-medium transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          {isCurrentMotionPlaying ? labels.pause : labels.play}
        </button>
      </div>

      <p aria-live="polite" className="sr-only">
        {errorMessage}
      </p>
    </section>
  )
}
