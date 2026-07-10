import { describe, expect, it } from 'vitest'
import { legalBackTarget } from '../legalBackTarget'

describe('legal document back navigation', () => {
  it('returns to account settings when the legal page came from settings', () => {
    expect(legalBackTarget('es', 'Volver al inicio', 'settings-account')).toEqual({
      href: '/settings/cuenta',
      label: 'Cuenta',
    })
    expect(legalBackTarget('en', 'Back to home', 'settings-account')).toEqual({
      href: '/settings/cuenta',
      label: 'Account',
    })
  })

  it('keeps public legal pages pointing back to localized home by default', () => {
    expect(legalBackTarget('es', 'Volver al inicio')).toEqual({
      href: '/es',
      label: 'Volver al inicio',
    })
    expect(legalBackTarget('en', 'Back to home')).toEqual({
      href: '/en',
      label: 'Back to home',
    })
  })
})
