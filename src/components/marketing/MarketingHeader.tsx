import Link from 'next/link'
import { VekiraLogo } from '@/components/branding/VekiraLogo'
import { localizedPath, type PublicLocale } from '@/lib/i18n/routing'

type MarketingHeaderProps = {
  locale: PublicLocale
  cta: string
}

export function MarketingHeader({ locale, cta }: MarketingHeaderProps) {
  return (
    <header className="sticky top-0 z-50 border-b border-border/70 bg-background/95 backdrop-blur">
      <div className="mx-auto flex min-h-16 w-full max-w-7xl items-center justify-between gap-4 px-5 sm:px-8 lg:px-12">
        <Link
          href={localizedPath(locale, 'home')}
          className="rounded-xl outline-none transition-opacity duration-200 hover:opacity-80 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          <VekiraLogo markClassName="h-9 w-9" wordmarkClassName="text-lg" />
        </Link>
        <Link
          href={`/register?locale=${locale}`}
          className="inline-flex min-h-11 items-center justify-center rounded-control bg-primary px-4 text-sm font-bold text-background transition-[filter] duration-200 hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background sm:px-5"
        >
          {cta}
        </Link>
      </div>
    </header>
  )
}
