import 'server-only'

import { buildAdminOverview } from '@/lib/admin/overview'
import type { AdminOverviewClock, AdminOverviewData } from '@/lib/admin/overview'
import {
  loadAdminDashboardBanner,
  loadAdminUsers,
  requireAdminUserContext,
} from '@/lib/auth/admin'
import { loadAdminTrainerApplications } from '@/lib/auth/adminTrainers'

export async function getAdminOverviewData(
  clock: AdminOverviewClock,
): Promise<AdminOverviewData> {
  const { service } = await requireAdminUserContext()
  const [users, applications, banner] = await Promise.allSettled([
    loadAdminUsers(service),
    loadAdminTrainerApplications(service),
    loadAdminDashboardBanner(service),
  ])

  return buildAdminOverview({
    users: users.status === 'fulfilled' ? users.value : null,
    applications: applications.status === 'fulfilled' ? applications.value : null,
    banner: banner.status === 'fulfilled' ? banner.value : null,
  }, clock)
}
