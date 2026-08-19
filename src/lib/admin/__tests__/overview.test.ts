import { expect, it } from 'vitest'
import type { DashboardBannerData } from '@/lib/dashboard/banner'
import type { AdminUserRecord } from '@/lib/auth/admin'
import type { AdminTrainerQueueItem } from '@/lib/auth/adminTrainers'
import { buildAdminOverview } from '../overview'

function user(overrides: Partial<AdminUserRecord> = {}): AdminUserRecord {
  return {
    id: 'user-1',
    email: 'user@example.test',
    fullName: null,
    username: null,
    avatarUrl: null,
    subscriptionTier: 'free',
    accountStatus: 'active',
    suspensionReason: null,
    suspendedUntil: null,
    createdAt: '2026-07-01T12:00:00.000Z',
    lastSignInAt: null,
    isOwner: false,
    ...overrides,
  }
}

function application(overrides: Partial<AdminTrainerQueueItem> = {}): AdminTrainerQueueItem {
  return {
    id: 'application-1',
    professionalName: 'Entrenadora Ejemplo',
    applicationDate: '2026-08-18T12:00:00.000Z',
    status: 'submitted',
    specialties: ['Fuerza'],
    applicationKind: 'initial',
    ...overrides,
  }
}

function banner(overrides: Partial<DashboardBannerData> = {}): DashboardBannerData {
  return {
    slot: 'dashboard-primary',
    kind: 'announcement',
    title: 'Aviso operativo',
    description: null,
    image_url: null,
    cta_label: null,
    cta_href: null,
    status: 'active',
    starts_on: null,
    ends_on: null,
    updated_at: '2026-08-16T12:00:00.000Z',
    ...overrides,
  }
}

it('derives real metrics with the configured calendar timezone', () => {
  const result = buildAdminOverview({
    users: {
      suspensionEnabled: true,
      users: [
        user({ id: 'u1', subscriptionTier: 'pro', createdAt: '2026-08-01T02:00:00.000Z' }),
        user({ id: 'u2', accountStatus: 'suspended', createdAt: '2026-07-31T20:00:00.000Z' }),
      ],
    },
    applications: [
      application({ id: 'a1', status: 'submitted' }),
      application({ id: 'a2', status: 'under_review' }),
      application({ id: 'a3', status: 'interview_required' }),
      application({ id: 'a4', status: 'approved' }),
    ],
    banner: { enabled: true, banner: banner() },
  }, { now: '2026-08-19T12:00:00.000Z', timeZone: 'America/Havana' })

  expect(result.metrics).toEqual({
    totalUsers: 2,
    proUsers: 1,
    suspendedUsers: 1,
    newUsersThisMonth: 0,
    totalApplications: 4,
    pendingApplications: 3,
  })
  expect(result.bannerEnabled).toBe(true)
})

it('uses null instead of zero when a source is unavailable', () => {
  const result = buildAdminOverview(
    { users: null, applications: null, banner: null },
    { now: '2026-08-19T12:00:00.000Z', timeZone: 'America/Havana' },
  )

  expect(result.metrics).toEqual({
    totalUsers: null,
    proUsers: null,
    suspendedUsers: null,
    newUsersThisMonth: null,
    totalApplications: null,
    pendingApplications: null,
  })
  expect(result.bannerEnabled).toBeNull()
  expect(result.activity).toEqual([])
})

it('sorts valid source activity newest first, uses stable ids, and caps it at five items', () => {
  const result = buildAdminOverview({
    users: {
      suspensionEnabled: false,
      users: [
        user({ id: 'u1', email: 'one@example.test', createdAt: '2026-08-10T12:00:00.000Z' }),
        user({ id: 'u2', email: 'two@example.test', createdAt: 'not-a-date' }),
        user({ id: 'u3', email: 'three@example.test', createdAt: '2026-08-14T12:00:00.000Z' }),
      ],
    },
    applications: [
      application({ id: 'a1', professionalName: 'Primera', applicationDate: '2026-08-18T12:00:00.000Z' }),
      application({ id: 'a2', professionalName: 'Segunda', applicationDate: '2026-08-17T12:00:00.000Z' }),
      application({ id: 'a3', professionalName: 'Tercera', applicationDate: '2026-08-15T12:00:00.000Z' }),
    ],
    banner: { enabled: true, banner: banner({ updated_at: '2026-08-16T12:00:00.000Z' }) },
  }, { now: '2026-08-19T12:00:00.000Z', timeZone: 'America/Havana' })

  expect(result.activity).toEqual([
    {
      id: 'application:a1',
      kind: 'trainer_application',
      label: 'Solicitud: Primera',
      occurredAt: '2026-08-18T12:00:00.000Z',
      href: '/admin/trainers',
    },
    {
      id: 'application:a2',
      kind: 'trainer_application',
      label: 'Solicitud: Segunda',
      occurredAt: '2026-08-17T12:00:00.000Z',
      href: '/admin/trainers',
    },
    {
      id: 'banner:dashboard-primary',
      kind: 'banner_updated',
      label: 'Banner actualizado: Aviso operativo',
      occurredAt: '2026-08-16T12:00:00.000Z',
      href: '/admin/content',
    },
    {
      id: 'application:a3',
      kind: 'trainer_application',
      label: 'Solicitud: Tercera',
      occurredAt: '2026-08-15T12:00:00.000Z',
      href: '/admin/trainers',
    },
    {
      id: 'user:u3',
      kind: 'user_created',
      label: 'Nueva cuenta: three@example.test',
      occurredAt: '2026-08-14T12:00:00.000Z',
      href: '/admin/users',
    },
  ])
})
