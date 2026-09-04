import { describe, expect, it } from 'vitest'
import { getCoachNavItems, getPersonalNavItems, isAppNavItemActive } from '../appNavigation'

describe('app navigation', () => {
  it('uses Entrenadores as the final destination when community is disabled', () => {
    expect(getPersonalNavItems({ communityEnabled: false }).at(-1)).toMatchObject({
      href: '/trainers',
      label: 'Entrenadores',
    })
  })

  it('uses Comunidad as the final destination when community is enabled', () => {
    expect(getPersonalNavItems({ communityEnabled: true }).at(-1)).toMatchObject({
      href: '/feed',
      label: 'Comunidad',
    })
  })

  it('keeps Mi entrenador available alongside the discovery destination in both community modes', () => {
    for (const communityEnabled of [false, true]) {
      expect(getPersonalNavItems({ communityEnabled })).toContainEqual({
        href: '/coaching',
        label: 'Mi entrenador',
      })
    }
  })

  it('uses exactly the five approved destinations for active trainers', () => {
    expect(getCoachNavItems()).toEqual([
      { href: '/coach', label: 'Resumen' },
      { href: '/coach/clients', label: 'Clientes' },
      { href: '/coach/programs', label: 'Rutinas' },
      { href: '/coach/requests', label: 'Solicitudes' },
      { href: '/coach/profile', label: 'Perfil' },
    ])
  })

  it('matches exact and nested routes without matching unrelated prefixes', () => {
    expect(isAppNavItemActive('/plan', '/plan')).toBe(true)
    expect(isAppNavItemActive('/plan/edit', '/plan')).toBe(true)
    expect(isAppNavItemActive('/plans/generate', '/plan')).toBe(false)
  })
})
