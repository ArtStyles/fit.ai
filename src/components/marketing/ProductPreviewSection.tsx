import Image from 'next/image'
import type { PublicLocale } from '@/lib/i18n/routing'
import type { HomeContent } from '@/lib/marketing/homeContent'

type Preview = HomeContent['previews'][number]

type ProductPreviewSectionProps = {
  previews: HomeContent['previews']
  locale: PublicLocale
}

function PreviewFallback({ screen }: { screen: Preview['screen'] }) {
  return (
    <div
      aria-hidden="true"
      className="absolute inset-0 bg-background p-4"
    >
      <div className="flex h-full flex-col overflow-hidden rounded-[1.5rem] border border-border bg-card/80">
        <div className="border-b border-border/70 p-4">
          <span className="block h-3 w-28 rounded-full bg-foreground/15" />
          <span className="mt-3 block h-8 w-40 rounded-xl bg-primary/25" />
        </div>
        <div className="grid flex-1 gap-3 p-4">
          {screen === 'dashboard' && (
            <>
              <span className="rounded-2xl bg-primary/20" />
              <span className="rounded-2xl bg-muted/30" />
              <span className="rounded-2xl bg-muted/20" />
            </>
          )}
          {screen === 'session' && [0, 1, 2, 3].map(row => (
            <span key={row} className="rounded-2xl border border-border/60 bg-muted/20" />
          ))}
          {screen === 'progress' && (
            <>
              <span className="rounded-2xl bg-violet-500/20" />
              <span className="rounded-2xl bg-muted/25" />
              <span className="rounded-2xl bg-muted/25" />
            </>
          )}
        </div>
      </div>
    </div>
  )
}

export function ProductPreviewSection({ previews, locale }: ProductPreviewSectionProps) {
  return (
    <div>
      {previews.map((preview, index) => (
        <section
          key={preview.screen}
          className="border-b border-border/60 px-5 py-20 sm:px-8 sm:py-24 lg:px-12"
        >
          <div className="mx-auto grid w-full max-w-7xl items-center gap-10 lg:grid-cols-2 lg:gap-20">
            <div className={index % 2 === 1 ? 'lg:order-2' : undefined}>
              <h2 className="max-w-xl font-display text-4xl font-black leading-none tracking-[-0.025em] text-foreground sm:text-5xl">
                {preview.title}
              </h2>
              <p className="mt-5 max-w-lg text-base leading-7 text-muted-foreground sm:text-lg sm:leading-8">
                {preview.body}
              </p>
            </div>
            <div className={index % 2 === 1 ? 'lg:order-1' : undefined}>
              <div className="relative mx-auto aspect-[390/844] w-full max-w-[390px] overflow-hidden rounded-[2rem] border border-border bg-background shadow-2xl shadow-black/35">
                {process.env.NODE_ENV !== 'production' ? <PreviewFallback screen={preview.screen} /> : null}
                <Image
                  src={`/marketing/${preview.screen}-${locale}.webp`}
                  alt={preview.alt}
                  fill
                  sizes="(min-width: 1024px) 390px, min(100vw - 2.5rem, 390px)"
                  className="relative z-10 object-cover"
                />
              </div>
            </div>
          </div>
        </section>
      ))}
    </div>
  )
}
