import { describe, expect, it } from 'vitest'
import { requiredSupportEmail } from '../../../[locale]/_legal/supportEmail'

describe('required support email', () => {
  it('uses the public Vekira support address when configuration is missing or blank', () => {
    expect(requiredSupportEmail({})).toBe('soporte@vekira.app')
    expect(requiredSupportEmail({ NEXT_PUBLIC_SUPPORT_EMAIL: '   ' })).toBe('soporte@vekira.app')
  })

  it('returns a normalized configured address', () => {
    expect(requiredSupportEmail({ NEXT_PUBLIC_SUPPORT_EMAIL: ' support@vekira.test ' })).toBe(
      'support@vekira.test',
    )
  })
})
