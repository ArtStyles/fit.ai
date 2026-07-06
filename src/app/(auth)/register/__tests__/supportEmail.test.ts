import { describe, expect, it } from 'vitest'
import { requiredSupportEmail } from '../../../[locale]/_legal/supportEmail'

describe('required support email', () => {
  it('fails clearly when NEXT_PUBLIC_SUPPORT_EMAIL is missing', () => {
    expect(() => requiredSupportEmail({})).toThrow('NEXT_PUBLIC_SUPPORT_EMAIL is required')
  })

  it('returns a normalized configured address', () => {
    expect(requiredSupportEmail({ NEXT_PUBLIC_SUPPORT_EMAIL: ' support@vekira.test ' })).toBe(
      'support@vekira.test',
    )
  })
})
