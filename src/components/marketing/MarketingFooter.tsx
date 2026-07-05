import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { VekiraLogo } from '@/components/branding/VekiraLogo'
import type { PublicLocale } from '@/lib/i18n/routing'
import type { HomeContent } from '@/lib/marketing/homeContent'

type MarketingFooterProps = {
  content: HomeContent['finalCta']
  locale: PublicLocale
}

export function MarketingFooter({ content, locale }: MarketingFooterProps) {
  return (
    <footer className="px-5 py-20 sm:px-8 sm:py-24 lg:px-12">
      <div className="mx-auto w-full max-w-7xl">
        <div className="rounded-card border border-primary/30 bg-primary/10 p-7 sm:p-10 lg:p-14">
          <h2 className="max-w-3xl font-display text-4xl font-black leading-none tracking-[-0.025em] text-foreground sm:text-6xl">
            {content.title}
          </h2>
          <p className="mt-5 max-w-2xl text-base leading-7 text-muted-foreground sm:text-lg sm:leading-8">
            {content.body}
          </p>
          <Link
            href={`/register?locale=${locale}`}
            className="mt-8 inline-flex min-h-12 items-center justify-center gap-2 rounded-control bg-primary px-6 font-bold text-background transition-[filter] duration-200 hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            {content.cta}
            <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
        </div>
        <div className="mt-12 border-t border-border pt-8">
          <VekiraLogo wordmarkClassName="text-lg" />
        </div>
      </div>
    </footer>
  )
}
