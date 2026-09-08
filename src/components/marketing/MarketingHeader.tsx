import Link from 'next/link'
import { VekiraLogo } from '@/components/branding/VekiraLogo'
import { localizedPath, type PublicLocale } from '@/lib/i18n/routing'

type MarketingHeaderProps = {
  locale: PublicLocale
  cta: string
}

export function MarketingHeader({ locale, cta }: MarketingHeaderProps) {
  return (
    <header className="border-b border-border/60 bg-background px-5 sm:px-8 lg:px-12">
      <div className="mx-auto flex min-h-16 w-full max-w-6xl flex-wrap items-center justify-between gap-x-4 gap-y-1 py-2">
        <Link
          href={localizedPath(locale, 'home')}
          className="inline-flex min-h-11 items-center rounded-xl outline-none transition-opacity duration-200 hover:opacity-80 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          <VekiraLogo markClassName="h-9 w-9" wordmarkClassName="text-lg" />
        </Link>
        <nav
          aria-label={locale === 'es' ? 'Navegación principal' : 'Main navigation'}
          className="flex flex-wrap items-center gap-x-3 gap-y-1 sm:gap-x-5"
        >
          <a
            href="#como-funciona"
            className="hidden min-h-11 items-center justify-center rounded-control px-1 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background md:inline-flex"
          >
            {locale === 'es' ? 'Cómo funciona' : 'How it works'}
          </a>
          <Link
            href="/login"
            className="inline-flex min-h-11 items-center justify-center rounded-control px-1 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            {locale === 'es' ? 'Iniciar sesión' : 'Sign in'}
          </Link>
          <Link
            href={`/register?locale=${locale}`}
            className="hidden min-h-11 items-center justify-center rounded-control bg-primary px-5 text-sm font-bold text-background transition-[filter] duration-200 hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background sm:inline-flex"
          >
            {cta}
          </Link>
        </nav>
      </div>
    </header>
  )
}
