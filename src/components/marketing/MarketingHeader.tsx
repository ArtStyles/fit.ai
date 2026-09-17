import Link from 'next/link'
import { VekiraLogo } from '@/components/branding/VekiraLogo'
import { localizedPath, type PublicLocale } from '@/lib/i18n/routing'

type MarketingHeaderProps = {
  locale: PublicLocale
  cta: string
}

export function MarketingHeader({ locale, cta }: MarketingHeaderProps) {
  return (
    <header className="landing-header px-5 sm:px-8 lg:px-12">
      <div className="mx-auto flex min-h-16 w-full max-w-6xl flex-wrap items-center justify-between gap-x-4 py-2">
        <Link
          href={localizedPath(locale, 'home')}
          className="inline-flex min-h-11 items-center rounded-xl outline-none transition-opacity duration-200 hover:opacity-80 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          <VekiraLogo markClassName="h-8 w-8" wordmarkClassName="text-lg" />
        </Link>
        <nav
          aria-label={locale === 'es' ? 'Navegación principal' : 'Main navigation'}
          className="landing-nav order-last flex w-full items-center gap-x-5 sm:order-none sm:ml-auto sm:w-auto"
        >
          <a href={`/${locale}#experiencia`} className="landing-nav-link">
            {locale === 'es' ? 'La app' : 'The app'}
          </a>
          <a
            href={`/${locale}#como-funciona`}
            className="landing-nav-link"
          >
            {locale === 'es' ? 'Cómo funciona' : 'How it works'}
          </a>
          <a
            href={`/${locale}#ayuda`}
            className="landing-nav-link"
          >
            {locale === 'es' ? 'Ayuda' : 'Help'}
          </a>
        </nav>
        <a
          href={`/${locale}#descargar`}
          data-download-cta="section"
          aria-label={cta}
          className="landing-button inline-flex min-h-11 shrink-0 items-center justify-center rounded-control bg-primary px-4 text-sm font-bold text-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          {locale === 'es' ? 'Descargar' : 'Download'}
        </a>
      </div>
    </header>
  )
}
