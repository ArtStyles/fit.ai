import { describe, expect, it } from 'vitest'
import { assertRegistrationSignupRequest } from '../../tests/e2e/helpers/acceptance'

const expected = {
  locale: 'en' as const,
  email: 'registration-en@example.test',
  password: 'E2E-registration-123!',
}

function request(method: string, body: unknown) {
  return {
    method: () => method,
    postDataJSON: () => body,
  }
}

const validBody = {
  email: expected.email,
  password: expected.password,
  data: { preferred_language: expected.locale },
  gotrue_meta_security: {},
  code_challenge: 'PKCE_challenge_value_12345678901234567890',
  code_challenge_method: 's256',
}

describe('assertRegistrationSignupRequest', () => {
  it('accepts only the exact Supabase signup request contract', () => {
    expect(() => assertRegistrationSignupRequest(request('POST', validBody), expected)).not.toThrow()
  })

  it.each([
    ['GET', validBody],
    ['POST', { ...validBody, email: 'other@example.test' }],
    ['POST', { ...validBody, password: 'different-password-1' }],
    ['POST', { ...validBody, data: { preferred_language: 'en', full_name: 'Sensitive Name' } }],
    ['POST', { ...validBody, selected_plan: 'pro-monthly' }],
  ])('rejects a mismatched method or payload (%s)', (method, body) => {
    expect(() => assertRegistrationSignupRequest(request(method, body), expected)).toThrow()
  })
})
