import { LegalDocumentPage } from '../_legal/LegalDocumentPage'
import { LEGAL_COPY } from '../_legal/legalContent'
import { localizedPath } from '@/lib/i18n/routing'
import { buildLocalizedMetadata } from '@/lib/seo/metadata'

const content = LEGAL_COPY.en.privacy

export const metadata = buildLocalizedMetadata({
  locale: 'en',
  paths: { es: localizedPath('es', 'privacy'), en: localizedPath('en', 'privacy') },
  title: content.title,
  description: content.description,
})

export default function EnglishPrivacyPage({
  params,
  searchParams,
}: {
  params: { locale: string }
  searchParams?: { from?: string }
}) {
  return (
    <LegalDocumentPage
      paramsLocale={params.locale}
      expectedLocale="en"
      document="privacy"
      returnTo={searchParams?.from}
    />
  )
}
