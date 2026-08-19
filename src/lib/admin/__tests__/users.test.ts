import { expect, it } from 'vitest'
import type { AdminUserRecord } from '@/lib/auth/admin'
import { filterAdminUsers, normalizeAdminUserFilters } from '../users'

const users: AdminUserRecord[] = [
  {
    id: 'ana-pro',
    email: 'ana@example.test',
    fullName: 'Ana Pérez',
    username: 'ana',
    avatarUrl: null,
    subscriptionTier: 'pro',
    accountStatus: 'active',
    suspensionReason: null,
    suspendedUntil: null,
    createdAt: '2026-08-01T12:00:00.000Z',
    lastSignInAt: '2026-08-18T12:00:00.000Z',
    isOwner: false,
  },
  {
    id: 'bea-free',
    email: 'bea@example.test',
    fullName: 'Beatriz Ruiz',
    username: 'bea',
    avatarUrl: null,
    subscriptionTier: 'free',
    accountStatus: 'suspended',
    suspensionReason: 'Revisión manual',
    suspendedUntil: null,
    createdAt: '2026-07-01T12:00:00.000Z',
    lastSignInAt: null,
    isOwner: false,
  },
]

it('normalizes unknown query parameters and combines all approved filters', () => {
  expect(normalizeAdminUserFilters({ q: '  Ana ', status: 'unknown', tier: 'pro' })).toEqual({
    query: 'Ana', status: 'all', tier: 'pro',
  })

  expect(filterAdminUsers(users, { query: 'ana', status: 'active', tier: 'pro' }).map(user => user.id))
    .toEqual(['ana-pro'])
})

it('uses the first repeated parameter and bounds the normalized search query', () => {
  expect(normalizeAdminUserFilters({
    q: ['  primera  ', 'segunda'],
    status: ['suspended', 'active'],
    tier: ['pro', 'free'],
  })).toEqual({
    query: 'primera',
    status: 'suspended',
    tier: 'pro',
  })

  expect(normalizeAdminUserFilters({
    q: '1234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890EXTRA',
  })).toEqual({
    query: '1234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890',
    status: 'all',
    tier: 'all',
  })
})
