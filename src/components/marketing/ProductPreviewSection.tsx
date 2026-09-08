import { ProductScreenshot } from '@/components/marketing/ProductScreenshot'
import type { PublicLocale } from '@/lib/i18n/routing'
import type { HomeContent } from '@/lib/marketing/homeContent'

type ProductPreviewSectionProps = {
  previews: HomeContent['previews']
  locale: PublicLocale
  demoCaption: string
}

export function ProductPreviewSection({ previews, locale, demoCaption }: ProductPreviewSectionProps) {
  return (
    <div>
      {previews.filter(preview => preview.screen !== 'session').map(preview => (
        <section
          key={preview.screen}
          aria-labelledby={`preview-${preview.screen}-title`}
          className="border-b border-border/60 px-5 py-14 sm:px-8 sm:py-20 lg:px-12"
        >
          <div className={`mx-auto grid w-full max-w-6xl items-center gap-9 lg:gap-14 ${preview.screen === 'progress' ? 'lg:grid-cols-[minmax(0,1fr)_minmax(0,560px)]' : 'lg:grid-cols-2'}`}>
            <div>
              <h2 id={`preview-${preview.screen}-title`} className="max-w-xl text-balance font-display text-3xl font-bold leading-tight tracking-[-0.015em] text-foreground sm:text-4xl">
                {preview.title}
              </h2>
              <p className="mt-4 max-w-md text-base leading-7 text-muted-foreground sm:text-lg sm:leading-8">
                {preview.body}
              </p>
            </div>
            <ProductScreenshot preview={preview} locale={locale} caption={demoCaption} />
          </div>
        </section>
      ))}
    </div>
  )
}
