import { LegalDocumentPage } from '../_legal/LegalDocumentPage'
import { LEGAL_COPY } from '../_legal/legalContent'
import { localizedPath } from '@/lib/i18n/routing'
import { buildLocalizedMetadata } from '@/lib/seo/metadata'

const content = LEGAL_COPY.es.privacy

export const metadata = buildLocalizedMetadata({
  locale: 'es',
  paths: { es: localizedPath('es', 'privacy'), en: localizedPath('en', 'privacy') },
  title: content.title,
  description: content.description,
})

type SpanishPrivacyPageProps = {
  params: { locale: string }
  searchParams?: { from?: string | string[] }
}

export default function SpanishPrivacyPage({ params, searchParams }: SpanishPrivacyPageProps) {
  return <LegalDocumentPage paramsLocale={params.locale} expectedLocale="es" document="privacy" returnTo={searchParams?.from} />
}
