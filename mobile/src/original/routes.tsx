import type { ReactNode } from 'react'
import { ScreenState } from '@/components/feedback/ScreenState'
import { PageTopBar } from '@/components/navigation/PageTopBar'
import { PendingLink } from '@/components/navigation/PendingLink'

type PageProps = {
  params: Promise<Record<string, string>>
  searchParams: Promise<Record<string, string | string[]>>
}

type PageModule = { default: unknown }

export type OriginalRouteDefinition = {
  pathname: string
  source: string
  connectivity: 'local' | 'connected'
  load: () => Promise<PageModule>
}

function route(
  pathname: string,
  load: OriginalRouteDefinition['load'],
  connectivity: OriginalRouteDefinition['connectivity'] = 'local',
  source = `src/app/(app)${pathname.replace(/:([^/]+)/g, '[$1]')}/page.tsx`,
): OriginalRouteDefinition {
  return { pathname, source, connectivity, load }
}

// These are the existing page modules, not a second set of mobile screens.
// Explicit lazy imports also let Vite bundle every route without a Next server.
export const originalRoutes: readonly OriginalRouteDefinition[] = [
  route('/register', () => import('@/app/(auth)/register/page'), 'local', 'src/app/(auth)/register/page.tsx'),
  route('/suspended', () => import('@/app/suspended/page'), 'local', 'src/app/suspended/page.tsx'),
  route('/dashboard', () => import('@/app/(app)/dashboard/page')),
  route('/registrar', () => import('./free-training/page'), 'local', 'mobile/src/original/free-training/page.tsx'),
  route('/companion', () => import('@/app/(app)/companion/page')),
  route('/plan', () => import('@/app/(app)/plan/page')),
  route('/entrenar', () => import('@/app/(app)/entrenar/page')),
  route('/session/:workoutId', () => import('@/app/(app)/session/[workoutId]/page')),
  route('/history', () => import('@/app/(app)/history/page')),
  route('/history/:logId', () => import('@/app/(app)/history/[logId]/page')),
  route('/progress', () => import('@/app/(app)/progress/page')),
  route('/calendario', () => import('@/app/(app)/calendario/page')),
  route('/medidas', () => import('@/app/(app)/medidas/page')),
  route('/exercises', () => import('@/app/(app)/exercises/page')),
  route('/exercises/:exerciseId', () => import('@/app/(app)/exercises/[exerciseId]/page')),
  route('/plans/generate', () => import('@/app/(app)/plans/generate/page')),
  route('/settings', () => import('@/app/(app)/settings/page')),
  route('/settings/perfil', () => import('@/app/(app)/settings/perfil/page')),
  route('/settings/datos', () => import('@/app/(app)/settings/datos/page')),
  route('/settings/entrenamiento', () => import('@/app/(app)/settings/entrenamiento/page')),
  route('/settings/notificaciones', () => import('@/app/(app)/settings/notificaciones/page')),
  route('/settings/musica', () => import('@/app/(app)/settings/musica/page')),
  route('/settings/idioma', () => import('@/app/(app)/settings/idioma/page')),
  route('/settings/cuenta', () => import('@/app/(app)/settings/cuenta/page')),
  route('/onboarding', () => import('@/app/onboarding/page'), 'local', 'src/app/onboarding/page.tsx'),
  route('/trainers', () => import('@/app/(app)/trainers/page'), 'connected'),
  route('/trainers/:slug', () => import('@/app/(app)/trainers/[slug]/page'), 'connected'),
  route('/coaching', () => import('@/app/(app)/coaching/page'), 'connected'),
  route('/notifications', () => import('@/app/(app)/notifications/page'), 'connected'),
  route('/chat', () => import('@/app/(app)/chat/page'), 'connected'),
  route('/coach', () => import('@/app/(app)/coach/page'), 'connected'),
  route('/coach/apply', () => import('@/app/(app)/coach/apply/page'), 'connected'),
  route('/coach/clients', () => import('@/app/(app)/coach/clients/page'), 'connected'),
  route('/coach/clients/:clientId', () => import('@/app/(app)/coach/clients/[clientId]/page'), 'connected'),
  route('/coach/programs', () => import('@/app/(app)/coach/programs/page'), 'connected'),
  route('/coach/programs/new', () => import('@/app/(app)/coach/programs/new/page'), 'connected'),
  route('/coach/programs/:templateId', () => import('@/app/(app)/coach/programs/[templateId]/page'), 'connected'),
  route('/coach/requests', () => import('@/app/(app)/coach/requests/page'), 'connected'),
  route('/coach/profile', () => import('@/app/(app)/coach/profile/page'), 'connected'),
  route('/coach/services', () => import('@/app/(app)/coach/services/page'), 'connected'),
  route('/solicitudes', () => import('@/app/(app)/solicitudes/page'), 'connected'),
  route('/feed', () => import('@/app/(app)/feed/page'), 'connected'),
  route('/feed/new', () => import('@/app/(app)/feed/new/page'), 'connected'),
  route('/post/:id', () => import('@/app/(app)/post/[id]/page'), 'connected'),
  route('/u/:username', () => import('@/app/(app)/u/[username]/page'), 'connected'),
  route('/buscar', () => import('@/app/(app)/buscar/page'), 'connected'),
  route('/:locale/privacidad', () => import('@/app/[locale]/privacidad/page'), 'local', 'src/app/[locale]/privacidad/page.tsx'),
  route('/:locale/terminos', () => import('@/app/[locale]/terminos/page'), 'local', 'src/app/[locale]/terminos/page.tsx'),
  route('/:locale/privacy', () => import('@/app/[locale]/privacy/page'), 'local', 'src/app/[locale]/privacy/page.tsx'),
  route('/:locale/terms', () => import('@/app/[locale]/terms/page'), 'local', 'src/app/[locale]/terms/page.tsx'),
]

export function matchOriginalRoute(pathname: string): {
  route: OriginalRouteDefinition
  params: Record<string, string>
} | null {
  if (!pathname.startsWith('/') || pathname.includes('?') || pathname.includes('#')) return null
  const segments = pathname.replace(/\/+$/, '').slice(1).split('/')
  // Static routes win even if a dynamic route is inserted earlier later on.
  const candidates = originalRoutes.filter(definition => definition.pathname.split('/').length === segments.length + 1)
    .sort((left, right) => left.pathname.split(':').length - right.pathname.split(':').length)

  for (const definition of candidates) {
    const pattern = definition.pathname.slice(1).split('/')
    const params: Record<string, string> = {}
    let matches = true
    for (let index = 0; index < pattern.length; index++) {
      const expected = pattern[index]
      const actual = segments[index]
      if (expected.startsWith(':')) {
        if (!actual) { matches = false; break }
        try {
          params[expected.slice(1)] = decodeURIComponent(actual)
        } catch {
          matches = false
          break
        }
      } else if (expected !== actual) {
        matches = false
        break
      }
    }
    if (matches) return { route: definition, params }
  }
  return null
}

function searchRecord(searchParams: URLSearchParams): Record<string, string | string[]> {
  const result = Object.create(null) as Record<string, string | string[]>
  for (const key of new Set(searchParams.keys())) {
    const values = searchParams.getAll(key)
    result[key] = values.length === 1 ? values[0] : values
  }
  return result
}

export async function loadOriginalRoute(pathname: string, searchParams: URLSearchParams): Promise<ReactNode> {
  const match = matchOriginalRoute(pathname)
  if (match?.route.connectivity === 'connected' && typeof navigator !== 'undefined' && !navigator.onLine) {
    return <div className="min-h-screen bg-background pb-24"><PageTopBar title={pathname.startsWith('/trainers') ? 'Entrenadores' : 'Servicios conectados'} backHref="/dashboard" backLabel="Inicio" /><main className="mx-auto max-w-lg px-4 py-8"><ScreenState kind="offline" title="Esta pantalla necesita conexión" description="Conecta a internet para consultar entrenadores y servicios de tu cuenta. Tus rutinas descargadas, sesiones y progreso siguen disponibles en este dispositivo." action={<PendingLink href="/dashboard" className="inline-flex min-h-11 items-center rounded-xl bg-violet-500 px-4 text-sm font-semibold text-white">Volver a Inicio</PendingLink>} /></main></div>
  }
  if (!match) {
    return (
      <div className="min-h-screen bg-background pb-24">
        <PageTopBar title="Página no encontrada" backHref="/dashboard" backLabel="Inicio" />
        <main className="mx-auto max-w-lg px-4 py-8">
          <ScreenState
            kind="empty"
            title="No encontramos esta pantalla"
            description="Vuelve al inicio para continuar con tu entrenamiento."
            action={<PendingLink href="/dashboard" className="inline-flex min-h-11 items-center rounded-xl bg-violet-500 px-4 text-sm font-semibold text-white">Ir al inicio</PendingLink>}
          />
        </main>
      </div>
    )
  }

  const pageModule = await match.route.load()
  if (typeof pageModule.default !== 'function') throw new Error(`Missing original page: ${match.route.source}`)
  const page = pageModule.default as (props: PageProps) => ReactNode | Promise<ReactNode>
  // Only invoke the designated page. Its returned client components must render
  // normally under React so hooks, context, state and event handlers stay intact.
  return await page({
    params: Promise.resolve(match.params),
    searchParams: Promise.resolve(searchRecord(searchParams)),
  })
}
