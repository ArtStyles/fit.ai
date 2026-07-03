import { describe, expect, it } from 'vitest'
import { isOwnerAdminEmail } from '@/lib/auth/identity'
import { isSuspensionActive } from '@/lib/auth/access'
import type { AppProfile } from '@/lib/auth/server'

function profile(overrides: Partial<AppProfile> = {}): AppProfile {
  return {
    onboarding_done: true,
    full_name: 'Usuario',
    avatar_url: null,
    timezone: null,
    last_check_in_at: null,
    username: null,
    is_private: false,
    subscription_tier: 'free',
    is_admin: false,
    account_status: 'active',
    suspension_reason: null,
    suspended_at: null,
    suspended_until: null,
    language: 'es',
    ...overrides,
  }
}

describe('admin owner identity', () => {
  it('recognizes the owner email without case or surrounding-space sensitivity', () => {
    expect(isOwnerAdminEmail('  FeJames07@GMAIL.com ')).toBe(true)
  })

  it('does not grant admin access to adjacent addresses', () => {
    expect(isOwnerAdminEmail('fejames07+admin@gmail.com')).toBe(false)
    expect(isOwnerAdminEmail('other@gmail.com')).toBe(false)
    expect(isOwnerAdminEmail(undefined)).toBe(false)
  })
})

describe('account suspension', () => {
  it('blocks an indefinite suspension', () => {
    expect(isSuspensionActive(profile({ account_status: 'suspended' }))).toBe(true)
  })

  it('blocks a suspension whose expiry is in the future', () => {
    expect(isSuspensionActive(profile({
      account_status: 'suspended',
      suspended_until: new Date(Date.now() + 60_000).toISOString(),
    }))).toBe(true)
  })

  it('allows access after a timed suspension expires', () => {
    expect(isSuspensionActive(profile({
      account_status: 'suspended',
      suspended_until: new Date(Date.now() - 60_000).toISOString(),
    }))).toBe(false)
  })
})
