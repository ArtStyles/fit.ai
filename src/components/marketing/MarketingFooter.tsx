import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { VekiraLogo } from '@/components/branding/VekiraLogo'
import { requiredSupportEmail } from '@/app/[locale]/_legal/supportEmail'
import { localizedPath, type PublicLocale } from '@/lib/i18n/routing'
import type { HomeContent } from '@/lib/marketing/homeContent'

type MarketingFooterProps = {
  content: HomeContent['finalCta']
  locale: PublicLocale
}

const footerLinkClassName =
  'inline-flex min-h-11 items-center rounded-control px-1 text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background'

export function MarketingFooter({ content, locale }: MarketingFooterProps) {
  const alternateLocale = locale === 'es' ? 'en' : 'es'
  const supportEmail = requiredSupportEmail()

  return (
    <footer className="landing-footer px-5 pb-8 pt-10 sm:px-8 lg:px-12">
      <div className="mx-auto w-full max-w-6xl">
        <div data-reveal className="flex flex-col items-start gap-6 py-5 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="max-w-2xl font-display text-3xl font-black leading-tight tracking-[-0.025em] text-foreground sm:text-4xl">
              {content.title}
            </h2>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base sm:leading-7">
              {content.body}
            </p>
          </div>
          <a
            href={`/${locale}#descargar`}
            data-download-cta="section"
            className="landing-button inline-flex min-h-12 shrink-0 items-center justify-center gap-2 rounded-control border border-violet-300/40 bg-violet-400/10 px-6 text-sm font-bold text-violet-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            {content.cta}
            <ArrowRight className="h-4 w-4" aria-hidden />
          </a>
        </div>
        <div className="mt-8 flex flex-wrap items-center justify-between gap-x-8 gap-y-4 border-t border-border/60 pt-6">
          <Link
            href={localizedPath(locale, 'home')}
            className="inline-flex min-h-11 items-center rounded-xl outline-none transition-opacity duration-200 hover:opacity-80 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            <VekiraLogo markClassName="h-8 w-8" wordmarkClassName="text-base" />
          </Link>
          <nav
            aria-label={locale === 'es' ? 'Enlaces del sitio' : 'Site links'}
            className="flex flex-wrap items-center gap-x-5 gap-y-1"
          >
            <Link href={localizedPath(locale, 'privacy')} className={footerLinkClassName}>
              {locale === 'es' ? 'Privacidad' : 'Privacy'}
            </Link>
            <Link href={localizedPath(locale, 'terms')} className={footerLinkClassName}>
              {locale === 'es' ? 'Términos' : 'Terms'}
            </Link>
            <Link href={`/recover-password?locale=${locale}`} className={footerLinkClassName}>
              {locale === 'es' ? 'Recuperar cuenta' : 'Recover account'}
            </Link>
            <Link href={`/delete-account?locale=${locale}`} className={footerLinkClassName}>
              {locale === 'es' ? 'Eliminar cuenta' : 'Delete account'}
            </Link>
            <a href={`mailto:${supportEmail}`} className={footerLinkClassName}>
              {locale === 'es' ? 'Soporte' : 'Support'}
            </a>
            <Link
              href={localizedPath(alternateLocale, 'home')}
              hrefLang={alternateLocale}
              lang={alternateLocale}
              className={footerLinkClassName}
            >
              {locale === 'es' ? 'English' : 'Español'}
            </Link>
          </nav>
        </div>
      </div>
    </footer>
  )
}
