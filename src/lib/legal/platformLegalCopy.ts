import type { LegalCopy, LegalDocumentKind } from '@/app/[locale]/_legal/legalContent'
import type { PublicLocale } from '@/lib/i18n/routing'
export function platformLegalCopy(_locale: PublicLocale, _document: LegalDocumentKind, content: LegalCopy): LegalCopy { return content }
