import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

const PUBLIC_EXACT = ['/', '/login', '/register', '/auth/callback', '/privacy', '/pricing', '/suspended']

export function isPublicPath(pathname: string): boolean {
  return PUBLIC_EXACT.includes(pathname)
    || pathname.startsWith('/auth/')
    || /^\/(es|en)(\/|$)/.test(pathname)
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl
  const requestHeaders = new Headers(request.headers)
  const publicLocale = pathname.match(/^\/(es|en)(?:\/|$)/)?.[1]

  if (publicLocale) requestHeaders.set('x-public-locale', publicLocale)

  const createForwardedResponse = () => {
    const response = NextResponse.next({
      request: { headers: requestHeaders },
    })

    if (publicLocale) {
      response.cookies.set('fitai-language', publicLocale, {
        path: '/',
        sameSite: 'lax',
      })
    }

    return response
  }

  let supabaseResponse = createForwardedResponse()

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return request.cookies.getAll() },
        setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = createForwardedResponse()
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()

  const isPublic = isPublicPath(pathname)

  if (user) {
    const { data: accessProfile } = await supabase
      .from('profiles')
      .select('account_status, suspended_until')
      .eq('id', user.id)
      .maybeSingle() as {
        data: { account_status: 'active' | 'suspended'; suspended_until: string | null } | null
      }

    const suspensionActive = accessProfile?.account_status === 'suspended'
      && (!accessProfile.suspended_until || new Date(accessProfile.suspended_until).getTime() > Date.now())

    if (suspensionActive && pathname !== '/suspended' && !pathname.startsWith('/auth')) {
      const redirectResponse = NextResponse.redirect(new URL('/suspended', request.url))
      supabaseResponse.cookies.getAll().forEach(cookie => redirectResponse.cookies.set(cookie))
      return redirectResponse
    }

    requestHeaders.set('x-fitai-user-id', user.id)
    if (user.email) requestHeaders.set('x-fitai-user-email', user.email)

    const refreshedResponse = createForwardedResponse()
    supabaseResponse.cookies.getAll().forEach(cookie => {
      refreshedResponse.cookies.set(cookie)
    })
    supabaseResponse = refreshedResponse
  }

  // Redirect unauthenticated users away from protected routes
  if (!user && !isPublic) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  // Redirect authenticated users away from the landing and auth pages
  if (user && (pathname === '/' || pathname === '/login' || pathname === '/register')) {
    return NextResponse.redirect(new URL('/dashboard', request.url))
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|manifest.json|sw.js|workbox-.*\\.js|swe-worker-.*\\.js|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
