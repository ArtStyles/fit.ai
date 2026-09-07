import { describe, expect, it } from 'vitest'
import { getCoachNavItems, getPersonalNavItems, isAppNavItemActive } from '../appNavigation'

describe('app navigation', () => {
  it('uses five personal destinations with Entrenar third', () => {
    expect(getPersonalNavItems({ communityEnabled: false }).map(item => item.href)).toEqual([
      '/dashboard', '/plan', '/entrenar', '/progress', '/trainers',
    ])
  })

  it('replaces Entrenadores with Comunidad without adding a sixth destination', () => {
    expect(getPersonalNavItems({ communityEnabled: true }).map(item => item.href)).toEqual([
      '/dashboard', '/plan', '/entrenar', '/progress', '/feed',
    ])
  })

  it('uses exactly four professional destinations', () => {
    expect(getCoachNavItems()).toEqual([
      { href: '/coach', label: 'Resumen' },
      { href: '/coach/clients', label: 'Clientes' },
      { href: '/coach/programs', label: 'Rutinas' },
      { href: '/coach/requests', label: 'Solicitudes' },
    ])
  })

  it('does not mark overview active on profile or services', () => {
    expect(isAppNavItemActive('/coach/profile', '/coach')).toBe(false)
    expect(isAppNavItemActive('/coach/services', '/coach')).toBe(false)
    expect(getCoachNavItems().some(item => (item.href as string) === '/coach/profile')).toBe(false)
  })

  it('matches exact and nested routes without matching unrelated prefixes', () => {
    expect(isAppNavItemActive('/plan', '/plan')).toBe(true)
    expect(isAppNavItemActive('/plan/edit', '/plan')).toBe(true)
    expect(isAppNavItemActive('/plans/generate', '/plan')).toBe(false)
  })
})
