import { describe, expect, it, vi } from 'vitest'
import {
  resendRegistrationCode,
  signUpForRegistration,
  verifyRegistrationCode,
} from '../authFlow'

describe('signUpForRegistration', () => {
  it('submits exact credentials with preferred-language-only metadata', async () => {
    const signUp = vi.fn().mockResolvedValue({
      data: { user: { identities: [{}] }, session: null },
      error: null,
    })

    await signUpForRegistration({
      signUp,
      email: 'user@example.com',
      password: 'password1',
      locale: 'en',
      onAuthenticated: vi.fn(),
    })

    expect(signUp).toHaveBeenCalledOnce()
    expect(signUp).toHaveBeenCalledWith({
      email: 'user@example.com',
      password: 'password1',
      options: { data: { preferred_language: 'en' } },
    })
  })

  it('returns duplicate when Supabase reports no identities', async () => {
    const result = await signUpForRegistration({
      signUp: vi.fn().mockResolvedValue({
        data: { user: { identities: [] }, session: null },
        error: null,
      }),
      email: 'used@example.com',
      password: 'password1',
      locale: 'es',
      onAuthenticated: vi.fn(),
    })

    expect(result).toEqual({ kind: 'duplicate' })
  })

  it('requests verification when signup has no session', async () => {
    const onAuthenticated = vi.fn()
    const result = await signUpForRegistration({
      signUp: vi.fn().mockResolvedValue({
        data: { user: { identities: [{}] }, session: null },
        error: null,
      }),
      email: 'verify@example.com',
      password: 'password1',
      locale: 'es',
      onAuthenticated,
    })

    expect(result).toEqual({ kind: 'verification-required' })
    expect(onAuthenticated).not.toHaveBeenCalled()
  })

  it('redirects an authenticated session to onboarding', async () => {
    const onAuthenticated = vi.fn()
    const result = await signUpForRegistration({
      signUp: vi.fn().mockResolvedValue({
        data: { user: { identities: [{}] }, session: { access_token: 'token' } },
        error: null,
      }),
      email: 'active@example.com',
      password: 'password1',
      locale: 'es',
      onAuthenticated,
    })

    expect(result).toEqual({ kind: 'authenticated' })
    expect(onAuthenticated).toHaveBeenCalledOnce()
    expect(onAuthenticated).toHaveBeenCalledWith('/onboarding')
  })

  it('returns the signup error without navigating', async () => {
    const onAuthenticated = vi.fn()
    const result = await signUpForRegistration({
      signUp: vi.fn().mockResolvedValue({
        data: { user: null, session: null },
        error: { message: 'signup disabled' },
      }),
      email: 'user@example.com',
      password: 'password1',
      locale: 'es',
      onAuthenticated,
    })

    expect(result).toEqual({ kind: 'error', message: 'signup disabled' })
    expect(onAuthenticated).not.toHaveBeenCalled()
  })
})

describe('verifyRegistrationCode', () => {
  it('returns an OTP failure without navigating', async () => {
    const onVerified = vi.fn()
    const result = await verifyRegistrationCode({
      verifyOtp: vi.fn().mockResolvedValue({ error: { message: 'expired token' } }),
      email: 'user@example.com',
      code: '12345678',
      onVerified,
    })

    expect(result).toEqual({ kind: 'error', message: 'expired token' })
    expect(onVerified).not.toHaveBeenCalled()
  })

  it('submits the signup OTP and redirects success to onboarding', async () => {
    const verifyOtp = vi.fn().mockResolvedValue({ error: null })
    const onVerified = vi.fn()
    const result = await verifyRegistrationCode({
      verifyOtp,
      email: 'user@example.com',
      code: '12345678',
      onVerified,
    })

    expect(verifyOtp).toHaveBeenCalledWith({
      email: 'user@example.com',
      token: '12345678',
      type: 'signup',
    })
    expect(result).toEqual({ kind: 'verified' })
    expect(onVerified).toHaveBeenCalledWith('/onboarding')
  })
})

describe('resendRegistrationCode', () => {
  it('resends a signup code with the exact email', async () => {
    const resend = vi.fn().mockResolvedValue({ error: null })

    const result = await resendRegistrationCode({ resend, email: 'user@example.com' })

    expect(resend).toHaveBeenCalledWith({ type: 'signup', email: 'user@example.com' })
    expect(result).toEqual({ kind: 'resent' })
  })

  it('returns a resend error', async () => {
    const result = await resendRegistrationCode({
      resend: vi.fn().mockResolvedValue({ error: { message: 'rate limit' } }),
      email: 'user@example.com',
    })

    expect(result).toEqual({ kind: 'error', message: 'rate limit' })
  })
})
