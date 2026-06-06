'use client'

import { useState } from 'react'
import Image from 'next/image'
import { Dumbbell } from 'lucide-react'
import { cn } from '@/lib/utils'
import { resolveExerciseImage } from './resolveExerciseImage'

type Variant = 'thumb' | 'hero'

const VARIANT_CFG: Record<Variant, { aspect: string; icon: string; sizes: string }> = {
  thumb: { aspect: 'aspect-square', icon: 'h-1/3 w-1/3', sizes: '200px' },
  hero: { aspect: 'aspect-[16/10]', icon: 'h-12 w-12', sizes: '(max-width: 640px) 100vw, 512px' },
}

export function ExerciseImage({
  src,
  alt,
  variant = 'thumb',
  className,
}: {
  src: string | null | undefined
  alt: string
  variant?: Variant
  className?: string
}) {
  const [errored, setErrored] = useState(false)
  const resolved = resolveExerciseImage(src)
  const cfg = VARIANT_CFG[variant]
  const showImage = resolved.kind === 'image' && !errored

  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-xl border border-zinc-800 bg-gradient-to-br from-zinc-800/60 to-zinc-900',
        cfg.aspect,
        className,
      )}
    >
      {showImage ? (
        <Image
          src={resolved.src}
          alt={alt}
          fill
          sizes={cfg.sizes}
          className="object-cover"
          onError={() => setErrored(true)}
        />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center text-zinc-600">
          <Dumbbell className={cfg.icon} aria-hidden="true" />
        </div>
      )}
    </div>
  )
}
