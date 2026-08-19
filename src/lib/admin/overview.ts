import type { AdminDashboardBannerData, AdminUsersData } from '@/lib/auth/admin'
import type { AdminTrainerQueueItem } from '@/lib/auth/adminTrainers'

export const ADMIN_TRAINER_ATTENTION_STATUSES = [
  'submitted',
  'under_review',
  'interview_required',
] as const

export type AdminOverviewSources = {
  users: AdminUsersData | null
  applications: AdminTrainerQueueItem[] | null
  banner: AdminDashboardBannerData | null
}

export type AdminOverviewClock = { now: string; timeZone: string }

export type AdminActivityItem = {
  id: string
  kind: 'user_created' | 'trainer_application' | 'banner_updated'
  label: string
  occurredAt: string
  href: '/admin/users' | '/admin/trainers' | '/admin/content'
}

export type AdminOverviewData = {
  metrics: {
    totalUsers: number | null
    proUsers: number | null
    suspendedUsers: number | null
    newUsersThisMonth: number | null
    totalApplications: number | null
    pendingApplications: number | null
  }
  activity: AdminActivityItem[]
  bannerEnabled: boolean | null
}

function monthKey(value: string, timeZone: string): string | null {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null

  const parts = new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: '2-digit',
    timeZone,
  }).formatToParts(date)
  const year = parts.find(part => part.type === 'year')?.value
  const month = parts.find(part => part.type === 'month')?.value
  return year && month ? `${year}-${month}` : null
}

export function buildAdminOverview(
  { users, applications, banner }: AdminOverviewSources,
  clock: AdminOverviewClock,
): AdminOverviewData {
  const currentMonth = monthKey(clock.now, clock.timeZone)
  const attentionStatuses = new Set<AdminTrainerQueueItem['status']>(
    ADMIN_TRAINER_ATTENTION_STATUSES,
  )
  const activity: AdminActivityItem[] = [
    ...(users?.users ?? []).map(user => ({
      id: `user:${user.id}`,
      kind: 'user_created' as const,
      label: `Nueva cuenta: ${user.email}`,
      occurredAt: user.createdAt,
      href: '/admin/users' as const,
    })),
    ...(applications ?? []).map(application => ({
      id: `application:${application.id}`,
      kind: 'trainer_application' as const,
      label: `Solicitud: ${application.professionalName}`,
      occurredAt: application.applicationDate,
      href: '/admin/trainers' as const,
    })),
    ...(banner?.banner ? [{
      id: `banner:${banner.banner.slot}`,
      kind: 'banner_updated' as const,
      label: `Banner actualizado: ${banner.banner.title}`,
      occurredAt: banner.banner.updated_at,
      href: '/admin/content' as const,
    }] : []),
  ]
    .filter(item => Number.isFinite(Date.parse(item.occurredAt)))
    .sort((left, right) => Date.parse(right.occurredAt) - Date.parse(left.occurredAt))
    .slice(0, 5)

  return {
    metrics: {
      totalUsers: users ? users.users.length : null,
      proUsers: users
        ? users.users.filter(user => user.subscriptionTier === 'pro').length
        : null,
      suspendedUsers: users?.suspensionEnabled
        ? users.users.filter(user => user.accountStatus === 'suspended').length
        : null,
      newUsersThisMonth: users && currentMonth
        ? users.users.filter(user => monthKey(user.createdAt, clock.timeZone) === currentMonth).length
        : null,
      totalApplications: applications ? applications.length : null,
      pendingApplications: applications
        ? applications.filter(application => attentionStatuses.has(application.status)).length
        : null,
    },
    activity,
    bannerEnabled: banner?.enabled ?? null,
  }
}
