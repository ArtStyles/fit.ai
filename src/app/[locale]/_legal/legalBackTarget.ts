import { localizedPath, type PublicLocale } from '@/lib/i18n/routing'

type LegalBackTarget = {
  href: string
  label: string
}

export type LegalReturnSource = string | string[] | undefined

export function legalBackTarget(
  locale: PublicLocale,
  returnTo: LegalReturnSource,
): LegalBackTarget {
  if (returnTo === 'settings-account') {
    return {
      href: '/settings/cuenta',
      label: locale === 'es' ? 'Cuenta' : 'Account',
    }
  }

  return {
    href: localizedPath(locale, 'home'),
    label: locale === 'es' ? 'Volver al inicio' : 'Back to home',
  }
}
