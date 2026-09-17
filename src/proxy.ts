import { NextResponse, type NextRequest } from 'next/server'
import { normalizeLanguage } from '@/lib/i18n'

const PUBLIC_EXACT = ['/', '/language-selector', '/privacy', '/recover-password', '/delete-account', '/auth/callback']
export function isPublicPath(pathname: string): boolean {
  return PUBLIC_EXACT.includes(pathname)
    || /^\/(es|en)(?:\/(?:privacidad|privacy|terminos|terms))?\/?$/.test(pathname)
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl
  const requestHeaders = new Headers(request.headers)
  requestHeaders.delete('x-fitai-user-id')
  requestHeaders.delete('x-fitai-user-email')
  requestHeaders.delete('x-public-locale')
  const pathLocale = pathname.match(/^\/(es|en)(?:\/|$)/)?.[1]
  const queryLocale = request.nextUrl.searchParams.get('locale')
  const locale = pathLocale ?? (queryLocale === 'es' || queryLocale === 'en' ? queryLocale : normalizeLanguage(request.cookies.get('fitai-language')?.value))
  if (pathLocale || queryLocale === 'es' || queryLocale === 'en') requestHeaders.set('x-public-locale', locale)

  // Each API verifies its own bearer/session and role. Never redirect native
  // preflight requests or API error responses to an HTML login page.
  const api = pathname.startsWith('/api/')
  const accountSignIn = pathname === '/login' && request.nextUrl.searchParams.get('intent') === 'delete-account'
  if (api || isPublicPath(pathname) || accountSignIn) {
    const response = NextResponse.next({ request: { headers: requestHeaders } })
    if (pathLocale || queryLocale === 'es' || queryLocale === 'en') response.cookies.set('fitai-language', locale, { path: '/', sameSite: 'lax' })
    return response
  }

  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return NextResponse.json({ error: 'web_product_retired', download: `/${locale}#descargar` }, { status: 410 })
  }
  const destination = new URL(`/${locale}#descargar`, request.url)
  return NextResponse.redirect(destination)
}

export const config = {
  matcher: ['/((?!_next/|downloads/|favicon.ico|manifest.json|robots.txt|sitemap.xml|sw.js|workbox-.*\\.js|swe-worker-.*\\.js|.*\\.(?:svg|png|jpg|jpeg|gif|webp|woff2?|mp4|webm)$).*)'],
}
