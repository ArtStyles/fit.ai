import { ArrowDown, ArrowRight, Check, Smartphone, WifiOff } from 'lucide-react'
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
    <section aria-labelledby="hero-title" className="landing-hero relative isolate px-5 sm:px-8 lg:px-12">
      <div aria-hidden className="landing-hero-orbit" />
      <div className="mx-auto grid w-full max-w-6xl items-center gap-10 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)] lg:gap-16">
        <div className="landing-hero-copy">
          <p className="landing-eyebrow flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-violet-300" aria-hidden />
            {content.eyebrow}
          </p>
          <h1
            id="hero-title"
            className="landing-hero-title mt-5 max-w-2xl text-balance font-display font-black tracking-[-0.025em] text-foreground"
          >
            {content.title.slice(0, -content.titleAccent.length)}
            <span className="block text-primary">{content.titleAccent}</span>
          </h1>
          <p className="mt-6 max-w-xl text-base leading-7 text-muted-foreground sm:text-lg sm:leading-8">
            {content.body}
          </p>
          <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
            <a
              href={`/${locale}#descargar`}
              data-download-cta="section"
              className="landing-button inline-flex min-h-12 items-center justify-center gap-2 rounded-control bg-primary px-6 font-bold text-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              {content.cta}
              <ArrowRight className="h-4 w-4 shrink-0" aria-hidden />
            </a>
            <a
              href="#como-funciona"
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-control px-3 font-semibold text-foreground transition-colors duration-200 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              {content.secondary}
              <ArrowDown className="h-4 w-4 shrink-0" aria-hidden />
            </a>
          </div>
          <p className="mt-4 flex max-w-md items-start gap-2 text-xs leading-6 text-muted-foreground">
            <Smartphone className="mt-1 h-4 w-4 shrink-0" aria-hidden />{content.hint}
          </p>
          <ul className="mt-7 flex flex-wrap gap-x-5 gap-y-3 text-sm text-muted-foreground">
            {content.highlights.map(highlight => (
              <li key={highlight} className="flex items-center gap-2">
                <Check className="h-4 w-4 shrink-0 text-primary" aria-hidden />
                {highlight}
              </li>
            ))}
          </ul>
        </div>
        <div className="landing-hero-visual">
          <div className="landing-hero-visual-label" aria-hidden>
            <span>VEKIRA / 01</span><span>{locale === 'es' ? 'TU SESIÓN' : 'YOUR SESSION'}</span>
          </div>
          <div className="landing-hero-phone">
            <ProductScreenshot preview={preview} locale={locale} caption={demoCaption} preload />
          </div>
          <p className="landing-offline-badge"><WifiOff size={16} aria-hidden />{locale === 'es' ? 'Tu rutina va contigo. Incluso sin conexión.' : 'Your routine goes with you. Even offline.'}</p>
        </div>
      </div>
    </section>
  )
}
