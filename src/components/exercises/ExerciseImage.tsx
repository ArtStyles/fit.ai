'use client'

import { useEffect, useState } from 'react'
import Image from 'next/image'
import { Dumbbell, ZoomIn } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { resolveExerciseImage, type ResolvedExerciseImage } from './resolveExerciseImage'
import { canZoom } from './zoomable'

type Variant = 'thumb' | 'hero'

type VariantCfg = { aspect: string; icon: string; sizes: string }

const VARIANT_CFG: Record<Variant, VariantCfg> = {
  thumb: { aspect: 'aspect-square', icon: 'h-1/3 w-1/3', sizes: '200px' },
  hero: { aspect: 'aspect-[16/10]', icon: 'h-12 w-12', sizes: '(max-width: 640px) 100vw, 512px' },
}

/** Marco visual de la imagen (imagen real o placeholder). Sin interacción. */
function ImageFrame({
  resolved,
  showImage,
  alt,
  cfg,
  className,
  onError,
}: {
  resolved: ResolvedExerciseImage
  showImage: boolean
  alt: string
  cfg: VariantCfg
  className?: string
  onError: () => void
}) {
  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-xl border border-zinc-800 bg-gradient-to-br from-zinc-800/60 to-zinc-900',
        cfg.aspect,
        className,
      )}
    >
      {showImage && resolved.kind === 'image' ? (
        <Image
          src={resolved.src}
          alt={alt}
          fill
          sizes={cfg.sizes}
          className="object-cover"
          onError={onError}
        />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center text-zinc-600">
          <Dumbbell className={cfg.icon} aria-hidden="true" />
        </div>
      )}
    </div>
  )
}

export function ExerciseImage({
  src,
  alt,
  variant = 'thumb',
  className,
  zoomable = false,
  zoomFocusable = true,
}: {
  src: string | null | undefined
  alt: string
  variant?: Variant
  className?: string
  zoomable?: boolean
  /** Si es false, el botón de zoom no entra en el orden de tabulación
   *  (para cuando la imagen va anidada en un contenedor clickeable). */
  zoomFocusable?: boolean
}) {
  const [errored, setErrored] = useState(false)

  // Si cambia el src (instancia reutilizada), olvidar un error previo.
  useEffect(() => {
    setErrored(false)
  }, [src])

  const resolved = resolveExerciseImage(src)
  const cfg = VARIANT_CFG[variant]
  const showImage = resolved.kind === 'image' && !errored
  const zoom = canZoom({ zoomable, kind: resolved.kind, errored })

  const frame = (
    <ImageFrame
      resolved={resolved}
      showImage={showImage}
      alt={alt}
      cfg={cfg}
      className={zoom ? 'h-full w-full' : className}
      onError={() => setErrored(true)}
    />
  )

  // Caso normal (placeholder, sin zoom, o imagen rota): comportamiento idéntico al previo.
  if (!zoom || resolved.kind !== 'image') {
    return frame
  }

  return (
    <Dialog>
      <DialogTrigger asChild>
        {/* stopPropagation en click/keydown: evita disparar la acción del contenedor
            clickeable (card que navega, fila que selecciona) al tocar la imagen. */}
        <button
          type="button"
          aria-label={`Ampliar imagen de ${alt}`}
          tabIndex={zoomFocusable ? undefined : -1}
          onClick={e => e.stopPropagation()}
          onKeyDown={e => {
            if (e.key === 'Enter' || e.key === ' ') e.stopPropagation()
          }}
          className={cn(
            'group relative block cursor-zoom-in rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/60',
            className,
          )}
        >
          {frame}
          <span className="pointer-events-none absolute bottom-1 right-1 flex h-5 w-5 items-center justify-center rounded-md bg-black/55 text-white/90 opacity-80 transition-opacity group-hover:opacity-100">
            <ZoomIn className="h-3 w-3" aria-hidden="true" />
          </span>
        </button>
      </DialogTrigger>

      <DialogContent
        aria-describedby={undefined}
        className="grid h-[100dvh] w-screen max-w-none place-items-center border-0 bg-transparent p-0 text-white shadow-none sm:rounded-none"
      >
        <div className="flex w-[92vw] max-w-3xl flex-col items-center">
          <div className="relative h-[78vh] w-full">
            <Image
              src={resolved.src}
              alt={alt}
              fill
              sizes="(max-width: 52rem) 92vw, 48rem"
              className="object-contain"
            />
          </div>
          <DialogTitle className="mt-4 text-center text-base font-semibold text-white">
            {alt}
          </DialogTitle>
        </div>
      </DialogContent>
    </Dialog>
  )
}
