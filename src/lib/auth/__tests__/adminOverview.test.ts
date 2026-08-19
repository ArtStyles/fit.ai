import { beforeEach, expect, it, vi } from 'vitest'
import type { AdminOverviewClock } from '@/lib/admin/overview'
import type { AdminUsersData } from '@/lib/auth/admin'
import { getAdminOverviewData } from '../adminOverview'

const {
  requireAdminUserContextMock,
  loadAdminUsersMock,
  loadAdminTrainerApplicationsMock,
  loadAdminDashboardBannerMock,
} = vi.hoisted(() => ({
  requireAdminUserContextMock: vi.fn(),
  loadAdminUsersMock: vi.fn(),
  loadAdminTrainerApplicationsMock: vi.fn(),
  loadAdminDashboardBannerMock: vi.fn(),
}))

vi.mock('@/lib/auth/admin', () => ({
  requireAdminUserContext: requireAdminUserContextMock,
  loadAdminUsers: loadAdminUsersMock,
  loadAdminDashboardBanner: loadAdminDashboardBannerMock,
}))

vi.mock('@/lib/auth/adminTrainers', () => ({
  loadAdminTrainerApplications: loadAdminTrainerApplicationsMock,
}))

const clock: AdminOverviewClock = {
  now: '2026-08-19T12:00:00.000Z',
  timeZone: 'America/Havana',
}
const serviceMarker = { marker: 'service' }
const usersData: AdminUsersData = {
  suspensionEnabled: true,
  users: [{
    id: 'user-1',
    email: 'user@example.test',
    fullName: 'Usuario Ejemplo',
    username: 'usuario',
    avatarUrl: null,
    subscriptionTier: 'pro',
    accountStatus: 'active',
    suspensionReason: null,
    suspendedUntil: null,
    createdAt: '2026-08-10T12:00:00.000Z',
    lastSignInAt: null,
    isOwner: false,
  }],
}

beforeEach(() => {
  vi.clearAllMocks()
})

it('does not start source reads when authorization fails', async () => {
  requireAdminUserContextMock.mockRejectedValue(new Error('admin required'))

  await expect(getAdminOverviewData(clock)).rejects.toThrow('admin required')
  expect(loadAdminUsersMock).not.toHaveBeenCalled()
  expect(loadAdminTrainerApplicationsMock).not.toHaveBeenCalled()
  expect(loadAdminDashboardBannerMock).not.toHaveBeenCalled()
})

it('returns healthy sources when one authorized read fails', async () => {
  requireAdminUserContextMock.mockResolvedValue({
    service: serviceMarker,
    user: { id: 'admin' },
  })
  loadAdminUsersMock.mockResolvedValue(usersData)
  loadAdminTrainerApplicationsMock.mockRejectedValue(
    new Error('trainer source unavailable'),
  )
  loadAdminDashboardBannerMock.mockResolvedValue({ enabled: false, banner: null })

  const result = await getAdminOverviewData(clock)

  expect(loadAdminUsersMock).toHaveBeenCalledWith(serviceMarker)
  expect(loadAdminTrainerApplicationsMock).toHaveBeenCalledWith(serviceMarker)
  expect(loadAdminDashboardBannerMock).toHaveBeenCalledWith(serviceMarker)
  expect(result.metrics.totalUsers).toBe(1)
  expect(result.metrics.pendingApplications).toBeNull()
  expect(result.bannerEnabled).toBe(false)
})
