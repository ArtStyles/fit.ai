import Link from 'next/link'
import { ArrowDown, ArrowRight } from 'lucide-react'
import type { PublicLocale } from '@/lib/i18n/routing'
import type { HomeContent } from '@/lib/marketing/homeContent'

type HeroSectionProps = {
  content: HomeContent['hero']
  locale: PublicLocale
}

export function HeroSection({ content, locale }: HeroSectionProps) {
  return (
    <section className="relative isolate overflow-hidden border-b border-border/60 px-5 py-20 sm:px-8 sm:py-28 lg:px-12 lg:py-36">
      <div aria-hidden className="absolute -left-24 top-0 -z-10 h-72 w-72 rounded-full bg-primary/15 blur-3xl sm:h-96 sm:w-96" />
      <div aria-hidden className="absolute -right-32 bottom-0 -z-10 h-64 w-64 rounded-full bg-primary/10 blur-3xl" />
      <div className="mx-auto w-full max-w-7xl">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-primary sm:text-sm">
          {content.eyebrow}
        </p>
        <h1
          id="hero-title"
          className="mt-5 max-w-5xl font-display text-5xl font-black leading-[0.94] tracking-[-0.035em] text-foreground sm:text-7xl lg:text-8xl"
        >
          {content.title}
        </h1>
        <p className="mt-7 max-w-2xl text-base leading-7 text-muted-foreground sm:text-lg sm:leading-8">
          {content.body}
        </p>
        <div className="mt-9 flex flex-col gap-3 sm:flex-row sm:items-center">
          <Link
            href={`/register?locale=${locale}`}
            className="inline-flex min-h-12 items-center justify-center gap-2 rounded-control bg-primary px-6 font-bold text-background transition-[filter] duration-200 hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            {content.cta}
            <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
          <a
            href="#como-funciona"
            className="inline-flex min-h-12 items-center justify-center gap-2 rounded-control border border-border bg-surface-1 px-6 font-semibold text-foreground transition-colors duration-200 hover:border-primary/50 hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            {content.secondary}
            <ArrowDown className="h-4 w-4" aria-hidden />
          </a>
        </div>
      </div>
    </section>
  )
}
