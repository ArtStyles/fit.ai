import { LegalDocumentPage } from '../_legal/LegalDocumentPage'
import { LEGAL_COPY } from '../_legal/legalContent'
import { localizedPath } from '@/lib/i18n/routing'
import { buildLocalizedMetadata } from '@/lib/seo/metadata'

const content = LEGAL_COPY.en.terms

export const metadata = buildLocalizedMetadata({
  locale: 'en',
  paths: { es: localizedPath('es', 'terms'), en: localizedPath('en', 'terms') },
  title: content.title,
  description: content.description,
})

type EnglishTermsPageProps = {
  params: { locale: string }
  searchParams?: { from?: string | string[] }
}

export default function EnglishTermsPage({ params, searchParams }: EnglishTermsPageProps) {
  return <LegalDocumentPage paramsLocale={params.locale} expectedLocale="en" document="terms" returnTo={searchParams?.from} />
}
