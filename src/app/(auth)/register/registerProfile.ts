import { normalizeLanguage, type AppLanguage } from '@/lib/i18n'
import { localizedPath } from '@/lib/i18n/routing'

export function registrationLocale(
  query: string | undefined,
  cookie: string | undefined,
): AppLanguage {
  return query === 'es' || query === 'en' ? query : normalizeLanguage(cookie)
}

export function signupMetadata(locale: AppLanguage) {
  return { preferred_language: locale }
}

export function registrationLegalLinks(locale: AppLanguage) {
  return {
    privacy: localizedPath(locale, 'privacy'),
    terms: localizedPath(locale, 'terms'),
  }
}
