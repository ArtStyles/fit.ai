import { describe, expect, it } from 'vitest'
import { ADMIN_NAV_ITEMS, isAdminNavItemActive } from '../adminNavigation'

describe('admin navigation', () => {
  it('publishes the four approved destinations in order', () => {
    expect(ADMIN_NAV_ITEMS.map(({ href, label }) => ({ href, label }))).toEqual([
      { href: '/admin', label: 'Resumen' },
      { href: '/admin/users', label: 'Usuarios' },
      { href: '/admin/trainers', label: 'Entrenadores' },
      { href: '/admin/content', label: 'Contenido' },
    ])
  })

  it('keeps the admin root exact and trainer details under Entrenadores', () => {
    expect(isAdminNavItemActive('/admin', '/admin')).toBe(true)
    expect(isAdminNavItemActive('/admin/users', '/admin')).toBe(false)
    expect(isAdminNavItemActive('/admin/trainers/abc', '/admin/trainers')).toBe(true)
    expect(isAdminNavItemActive('/admin/users-extra', '/admin/users')).toBe(false)
  })
})
