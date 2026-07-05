import { describe, expect, it } from 'vitest'
import { APP_NAV_ITEMS, isAppNavItemActive } from '../appNavigation'

describe('app navigation', () => {
  it('uses the approved five destinations in order', () => {
    expect(APP_NAV_ITEMS.map(item => item.href)).toEqual([
      '/dashboard', '/plan', '/entrenar', '/progress', '/feed',
    ])
  })

  it('matches exact and nested routes without matching unrelated prefixes', () => {
    expect(isAppNavItemActive('/plan', '/plan')).toBe(true)
    expect(isAppNavItemActive('/plan/edit', '/plan')).toBe(true)
    expect(isAppNavItemActive('/plans/generate', '/plan')).toBe(false)
  })
})
