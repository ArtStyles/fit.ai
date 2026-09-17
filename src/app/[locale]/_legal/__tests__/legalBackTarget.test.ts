import { describe, expect, it } from 'vitest'
import { legalBackTarget } from '../legalBackTarget'

describe('legalBackTarget', () => {
  it.each([
    ['es', { href: '/es', label: 'Volver al inicio' }],
    ['en', { href: '/en', label: 'Back to home' }],
  ] as const)('returns to the portal even for a retired account-settings link in %s', (locale, expected) => {
    expect(legalBackTarget(locale, 'settings-account')).toEqual(expected)
  })

  it.each([
    ['es', undefined, { href: '/es', label: 'Volver al inicio' }],
    ['en', undefined, { href: '/en', label: 'Back to home' }],
    ['es', '', { href: '/es', label: 'Volver al inicio' }],
    ['en', 'settings-account-extra', { href: '/en', label: 'Back to home' }],
    ['es', 'Settings-account', { href: '/es', label: 'Volver al inicio' }],
    ['en', ' settings-account ', { href: '/en', label: 'Back to home' }],
  ] as const)('falls back to the localized home for %s and source %j', (locale, source, expected) => {
    expect(legalBackTarget(locale, source)).toEqual(expected)
  })

  it('treats a repeated source query as untrusted input', () => {
    expect(legalBackTarget('en', ['settings-account', 'anything'])).toEqual({
      href: '/en',
      label: 'Back to home',
    })
  })
})
