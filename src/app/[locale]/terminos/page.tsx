import { LegalDocumentPage } from '../_legal/LegalDocumentPage'
import { LEGAL_COPY } from '../_legal/legalContent'
import { localizedPath } from '@/lib/i18n/routing'
import { buildLocalizedMetadata } from '@/lib/seo/metadata'

const content = LEGAL_COPY.es.terms

export const metadata = buildLocalizedMetadata({
  locale: 'es',
  paths: { es: localizedPath('es', 'terms'), en: localizedPath('en', 'terms') },
  title: content.title,
  description: content.description,
})

export default function SpanishTermsPage({ params }: { params: { locale: string } }) {
  return <LegalDocumentPage paramsLocale={params.locale} expectedLocale="es" document="terms" />
}
