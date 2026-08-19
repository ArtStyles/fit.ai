import type { AdminUserRecord } from '@/lib/auth/admin'

export type AdminUserFilterParams = {
  q?: string | string[]
  status?: string | string[]
  tier?: string | string[]
}

export type AdminUserFilters = {
  query: string
  status: 'all' | 'active' | 'suspended'
  tier: 'all' | 'free' | 'pro'
}

const ADMIN_USER_QUERY_MAX_LENGTH = 100

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value
}

export function normalizeAdminUserFilters(params: AdminUserFilterParams): AdminUserFilters {
  const statusValue = firstParam(params.status)
  const tierValue = firstParam(params.tier)
  const queryValue = firstParam(params.q)
  const status = statusValue === 'active' || statusValue === 'suspended' ? statusValue : 'all'
  const tier = tierValue === 'free' || tierValue === 'pro' ? tierValue : 'all'

  return {
    query: queryValue?.trim().slice(0, ADMIN_USER_QUERY_MAX_LENGTH) ?? '',
    status,
    tier,
  }
}

export function filterAdminUsers(
  users: AdminUserRecord[],
  filters: AdminUserFilters,
): AdminUserRecord[] {
  const query = filters.query.toLocaleLowerCase('es')

  return users.filter(user => {
    const matchesQuery = !query || [user.email, user.fullName, user.username]
      .some(value => value?.toLocaleLowerCase('es').includes(query))
    const matchesStatus = filters.status === 'all' || user.accountStatus === filters.status
    const matchesTier = filters.tier === 'all' || user.subscriptionTier === filters.tier

    return matchesQuery && matchesStatus && matchesTier
  })
}
