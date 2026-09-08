import Link from 'next/link'
import { ArrowDown, ArrowRight, Check } from 'lucide-react'
import { ProductScreenshot } from '@/components/marketing/ProductScreenshot'
import type { PublicLocale } from '@/lib/i18n/routing'
import type { HomeContent } from '@/lib/marketing/homeContent'

type HeroSectionProps = {
  content: HomeContent['hero']
  locale: PublicLocale
  preview: HomeContent['previews'][number]
  demoCaption: string
}

export function HeroSection({ content, locale, preview, demoCaption }: HeroSectionProps) {
  return (
    <section aria-labelledby="hero-title" className="relative isolate overflow-hidden border-b border-border/60 px-5 py-12 sm:px-8 sm:py-16 lg:px-12 lg:py-20">
      <div aria-hidden className="absolute right-0 top-20 -z-10 h-96 w-96 rounded-full bg-primary/10 blur-3xl" />
      <div className="mx-auto grid w-full max-w-6xl items-center gap-12 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)] lg:gap-16">
        <div>
          <p className="max-w-md text-xs font-bold uppercase leading-6 tracking-[0.16em] text-primary sm:text-sm">
            {content.eyebrow}
          </p>
          <h1
            id="hero-title"
            className="mt-4 max-w-2xl text-balance font-display text-5xl font-black leading-[1.02] tracking-[-0.025em] text-foreground sm:text-6xl xl:text-7xl"
          >
            {content.title.slice(0, -content.titleAccent.length)}
            <span className="block text-primary">{content.titleAccent}</span>
          </h1>
          <p className="mt-6 max-w-xl text-base leading-7 text-muted-foreground sm:text-lg sm:leading-8">
            {content.body}
          </p>
          <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
            <Link
              href={`/register?locale=${locale}`}
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-control bg-primary px-6 font-bold text-background transition-[filter] duration-200 hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              {content.cta}
              <ArrowRight className="h-4 w-4 shrink-0" aria-hidden />
            </Link>
            <a
              href="#como-funciona"
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-control px-3 font-semibold text-foreground transition-colors duration-200 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              {content.secondary}
              <ArrowDown className="h-4 w-4 shrink-0" aria-hidden />
            </a>
          </div>
          <p className="mt-3 max-w-md text-sm leading-6 text-muted-foreground">{content.hint}</p>
          <ul className="mt-7 flex flex-wrap gap-x-5 gap-y-3 text-sm text-muted-foreground">
            {content.highlights.map(highlight => (
              <li key={highlight} className="flex items-center gap-2">
                <Check className="h-4 w-4 shrink-0 text-primary" aria-hidden />
                {highlight}
              </li>
            ))}
          </ul>
        </div>
        <ProductScreenshot preview={preview} locale={locale} caption={demoCaption} preload />
      </div>
    </section>
  )
}
