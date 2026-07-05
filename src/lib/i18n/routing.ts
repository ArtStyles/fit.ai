export const PUBLIC_LOCALES = ['es', 'en'] as const

export type PublicLocale = (typeof PUBLIC_LOCALES)[number]
export type PublicRoute =
  | 'home'
  | 'personalized-workouts'
  | 'exercises'
  | 'faq'
  | 'privacy'
  | 'terms'

const ROUTES: Record<PublicRoute, Record<PublicLocale, string>> = {
  home: { es: '', en: '' },
  'personalized-workouts': {
    es: 'entrenamiento-personalizado',
    en: 'personalized-workouts',
  },
  exercises: { es: 'ejercicios', en: 'exercises' },
  faq: { es: 'preguntas-frecuentes', en: 'faq' },
  privacy: { es: 'privacidad', en: 'privacy' },
  terms: { es: 'terminos', en: 'terms' },
}

export function isPublicLocale(value: string): value is PublicLocale {
  return PUBLIC_LOCALES.includes(value as PublicLocale)
}

export function localizedPath(locale: PublicLocale, route: PublicRoute): string {
  const slug = ROUTES[route][locale]
  return `/${locale}${slug ? `/${slug}` : ''}`
}

export function alternateLocalePath(pathname: string, target: PublicLocale): string {
  for (const route of Object.keys(ROUTES) as PublicRoute[]) {
    if (PUBLIC_LOCALES.some(locale => localizedPath(locale, route) === pathname)) {
      return localizedPath(target, route)
    }
  }

  return localizedPath(target, 'home')
}
