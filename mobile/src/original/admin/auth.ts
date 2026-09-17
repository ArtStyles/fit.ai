import { mobileApi } from '../mobile-api'
import type { AdminDashboardBannerData, AdminUsersData } from '@/lib/auth/admin'

export type { AdminDashboardBannerData, AdminUsersData, AdminUserRecord } from '@/lib/auth/admin'

export type AdminShellData = { adminLabel: string; pendingTrainerCount?: number }

// Administrative data is intentionally request-scoped. It is never written
// into the offline account store or reused after an account switch.
export function getAdminShellData() {
  return mobileApi<AdminShellData>('/api/mobile/admin', { operation: 'shell' })
}
export function listAdminUsers() {
  return mobileApi<AdminUsersData>('/api/mobile/admin', { operation: 'users' })
}
export function getAdminDashboardBanner() {
  return mobileApi<AdminDashboardBannerData>('/api/mobile/admin', { operation: 'banner' })
}
