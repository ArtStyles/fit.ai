import Image from 'next/image'
import type { PublicLocale } from '@/lib/i18n/routing'
import type { HomeContent } from '@/lib/marketing/homeContent'

type ProductScreenshotProps = {
  preview: HomeContent['previews'][number]
  locale: PublicLocale
  caption: string
  preload?: boolean
}

const SCREEN_DIMENSIONS = {
  dashboard: { width: 780, height: 1406 },
  session: { width: 780, height: 1924 },
  progress: { width: 1520, height: 1708 },
} as const

export function ProductScreenshot({ preview, locale, caption, preload = false }: ProductScreenshotProps) {
  const dimensions = SCREEN_DIMENSIONS[preview.screen]
  const isProgress = preview.screen === 'progress'

  return (
    <figure className={`mx-auto w-full ${isProgress ? 'max-w-[560px]' : 'max-w-[300px]'}`}>
      <div className="overflow-hidden rounded-[1.5rem] border border-border bg-background shadow-2xl shadow-black/25">
        <Image
          src={`/marketing/demo-${preview.screen}-${locale}.webp`}
          alt={preview.alt}
          width={dimensions.width}
          height={dimensions.height}
          preload={preload}
          sizes={isProgress ? '(min-width: 640px) 560px, calc(100vw - 2.5rem)' : '(min-width: 360px) 300px, calc(100vw - 2.5rem)'}
          className="block h-auto w-full"
        />
      </div>
      <figcaption className="mt-4 text-center text-xs leading-5 text-muted-foreground">{caption}</figcaption>
    </figure>
  )
}
