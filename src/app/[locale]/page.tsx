import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { TrackPageView } from '@/components/analytics/TrackPageView'
import { HeroSection } from '@/components/marketing/HeroSection'
import { MarketingFaq } from '@/components/marketing/MarketingFaq'
import { MarketingFooter } from '@/components/marketing/MarketingFooter'
import { MarketingHeader } from '@/components/marketing/MarketingHeader'
import { ProductPreviewSection } from '@/components/marketing/ProductPreviewSection'
import { SafetySection } from '@/components/marketing/SafetySection'
import { TrainingLoopSection } from '@/components/marketing/TrainingLoopSection'
import { isPublicLocale, localizedPath } from '@/lib/i18n/routing'
import { HOME_CONTENT } from '@/lib/marketing/homeContent'
import { buildLocalizedMetadata } from '@/lib/seo/metadata'

type LocalizedHomeProps = {
  params: { locale: string }
}

export function generateMetadata({ params }: LocalizedHomeProps): Metadata {
  if (!isPublicLocale(params.locale)) notFound()

  const content = HOME_CONTENT[params.locale]

  return buildLocalizedMetadata({
    locale: params.locale,
    paths: {
      es: localizedPath('es', 'home'),
      en: localizedPath('en', 'home'),
    },
    title: content.hero.title,
    description: content.hero.body,
  })
}

export default function LocalizedHome({ params }: LocalizedHomeProps) {
  if (!isPublicLocale(params.locale)) notFound()

  const locale = params.locale
  const content = HOME_CONTENT[locale]

  return (
    <div className="min-h-screen bg-background text-foreground">
      <TrackPageView locale={locale} />
      <MarketingHeader locale={locale} cta={content.hero.cta} />
      <main id="app-main-content">
        <HeroSection content={content.hero} locale={locale} />
        <TrainingLoopSection problem={content.problem} loop={content.loop} />
        <ProductPreviewSection previews={content.previews} />
        <SafetySection content={content.safety} />
        <MarketingFaq title={content.faqTitle} items={content.faq} />
      </main>
      <MarketingFooter content={content.finalCta} locale={locale} />
    </div>
  )
}
