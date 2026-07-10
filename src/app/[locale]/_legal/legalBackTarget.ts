import { localizedPath, type PublicLocale } from '@/lib/i18n/routing'

type LegalBackTarget = {
  href: string
  label: string
}

export function legalBackTarget(
  locale: PublicLocale,
  defaultLabel: string,
  returnTo?: string | null,
): LegalBackTarget {
  if (returnTo === 'settings-account') {
    return {
      href: '/settings/cuenta',
      label: locale === 'en' ? 'Account' : 'Cuenta',
    }
  }

  return {
    href: localizedPath(locale, 'home'),
    label: defaultLabel,
  }
}
