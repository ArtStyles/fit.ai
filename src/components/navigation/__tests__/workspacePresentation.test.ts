import { describe, expect, it } from 'vitest'
import {
  PERSONAL_ROUTE_PREFIXES,
  classifyWorkspaceRoute,
  isImmersiveWorkspaceRoute,
  isRouteWithinPrefix,
  resolvePresentedWorkspace,
} from '../workspacePresentation'

const personalFamilies = [
  '/dashboard', '/plan', '/plans', '/entrenar', '/session', '/progress',
  '/feed', '/trainers', '/coaching', '/calendario', '/history', '/medidas',
  '/exercises', '/buscar', '/post', '/solicitudes', '/u', '/chat', '/coach/apply',
] as const

describe('workspace presentation', () => {
  it.each(personalFamilies)('classifies %s and its descendants as personal', prefix => {
    expect(PERSONAL_ROUTE_PREFIXES).toContain(prefix)
    expect(classifyWorkspaceRoute(prefix)).toBe('personal')
    expect(classifyWorkspaceRoute(prefix + '/child')).toBe('personal')
  })

  it('uses an exact slash boundary and excludes coach application', () => {
    expect(isRouteWithinPrefix('/coach/clients', '/coach')).toBe(true)
    expect(isRouteWithinPrefix('/coaching', '/coach')).toBe(false)
    expect(classifyWorkspaceRoute('/coach/profile')).toBe('coach')
    expect(classifyWorkspaceRoute('/coach/services')).toBe('coach')
    expect(classifyWorkspaceRoute('/coach/apply')).toBe('personal')
  })

  it.each(['/session/workout-1', '/plans/generate', '/feed/new'])('%s is immersive', pathname => {
    expect(isImmersiveWorkspaceRoute(pathname)).toBe(true)
  })

  it('does not hide chrome for neighboring prefixes', () => {
    expect(isImmersiveWorkspaceRoute('/sessions')).toBe(false)
    expect(isImmersiveWorkspaceRoute('/feed/news')).toBe(false)
  })

  it('applies access, route, then shared preference priority', () => {
    expect(resolvePresentedWorkspace({
      pathname: '/coach/clients',
      preferredWorkspace: 'coach',
      trainerAccess: { granted: false },
    })).toBe('personal')
    expect(resolvePresentedWorkspace({
      pathname: '/coach/clients',
      preferredWorkspace: 'personal',
      trainerAccess: { granted: true },
    })).toBe('coach')
    expect(resolvePresentedWorkspace({
      pathname: '/dashboard',
      preferredWorkspace: 'coach',
      trainerAccess: { granted: true },
    })).toBe('personal')
    expect(resolvePresentedWorkspace({
      pathname: '/settings/perfil',
      preferredWorkspace: 'coach',
      trainerAccess: { granted: true },
    })).toBe('coach')
    expect(resolvePresentedWorkspace({
      pathname: '/future-shared-route',
      preferredWorkspace: 'personal',
      trainerAccess: { granted: true },
    })).toBe('personal')
  })
})
