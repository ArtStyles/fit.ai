import type { Workspace } from '@/lib/coaching/workspace'

export const PERSONAL_ROUTE_PREFIXES = [
  '/dashboard', '/plan', '/plans', '/entrenar', '/session', '/progress',
  '/feed', '/trainers', '/coaching', '/calendario', '/history', '/medidas',
  '/exercises', '/buscar', '/post', '/solicitudes', '/u', '/chat', '/coach/apply',
] as const

export const SHARED_ROUTE_PREFIXES = ['/settings', '/notifications'] as const
export const IMMERSIVE_ROUTE_PREFIXES = ['/session', '/plans/generate', '/feed/new'] as const

export type WorkspaceRouteKind = 'personal' | 'coach' | 'shared'

export function isRouteWithinPrefix(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(prefix + '/')
}

export function isImmersiveWorkspaceRoute(pathname: string): boolean {
  return IMMERSIVE_ROUTE_PREFIXES.some(prefix => isRouteWithinPrefix(pathname, prefix))
}

export function classifyWorkspaceRoute(pathname: string): WorkspaceRouteKind {
  if (
    isRouteWithinPrefix(pathname, '/coach')
    && !isRouteWithinPrefix(pathname, '/coach/apply')
  ) return 'coach'
  if (PERSONAL_ROUTE_PREFIXES.some(prefix => isRouteWithinPrefix(pathname, prefix))) {
    return 'personal'
  }
  return 'shared'
}

export function resolvePresentedWorkspace({
  pathname,
  preferredWorkspace,
  trainerAccess,
}: {
  pathname: string
  preferredWorkspace: Workspace
  trainerAccess: { granted: boolean }
}): Workspace {
  if (!trainerAccess.granted) return 'personal'
  const routeKind = classifyWorkspaceRoute(pathname)
  if (routeKind === 'coach') return 'coach'
  if (routeKind === 'personal') return 'personal'
  return preferredWorkspace
}
