export type AccountAccessProfile = {
  account_status: 'active' | 'suspended'
  suspended_until: string | null
}

export function isSuspensionActive(profile: AccountAccessProfile | null): boolean {
  if (profile?.account_status !== 'suspended') return false
  if (!profile.suspended_until) return true
  return new Date(profile.suspended_until).getTime() > Date.now()
}
