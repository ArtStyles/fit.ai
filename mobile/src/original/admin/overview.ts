import type { AdminOverviewClock, AdminOverviewData } from '@/lib/admin/overview'
import { mobileApi } from '../mobile-api'

export function getAdminOverviewData(clock: AdminOverviewClock) {
  return mobileApi<AdminOverviewData>('/api/mobile/admin', { operation: 'overview', timeZone: clock.timeZone })
}
