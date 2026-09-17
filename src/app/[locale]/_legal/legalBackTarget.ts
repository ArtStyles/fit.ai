import { localizedPath, type PublicLocale } from '@/lib/i18n/routing'
export type LegalReturnSource = string | string[] | undefined
export function legalBackTarget(locale: PublicLocale, _returnTo: LegalReturnSource) {
  return { href: localizedPath(locale, 'home'), label: locale === 'es' ? 'Volver al inicio' : 'Back to home' }
}
