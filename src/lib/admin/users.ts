import type { AdminUserRecord } from '@/lib/auth/admin'

export type AdminUserFilterParams = {
  q?: string
  status?: string
  tier?: string
}

export type AdminUserFilters = {
  query: string
  status: 'all' | 'active' | 'suspended'
  tier: 'all' | 'free' | 'pro'
}

export function normalizeAdminUserFilters(params: AdminUserFilterParams): AdminUserFilters {
  const status = params.status === 'active' || params.status === 'suspended' ? params.status : 'all'
  const tier = params.tier === 'free' || params.tier === 'pro' ? params.tier : 'all'

  return { query: params.q?.trim() ?? '', status, tier }
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
