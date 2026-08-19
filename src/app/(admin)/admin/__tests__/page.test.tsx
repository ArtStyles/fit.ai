import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it, vi } from 'vitest'

const { getAdminOverviewDataMock } = vi.hoisted(() => ({
  getAdminOverviewDataMock: vi.fn(),
}))

vi.mock('next/navigation', () => ({ usePathname: () => '/admin' }))
vi.mock('@/lib/auth/adminOverview', () => ({ getAdminOverviewData: getAdminOverviewDataMock }))
vi.mock('@/lib/auth/server', () => ({
  requireAppUserContext: async () => ({ profile: { timezone: 'America/Havana' } }),
}))
vi.mock('@/lib/workouts/schedule', () => ({ resolveUserTimeZone: () => 'America/Havana' }))

import AdminPage from '../page'

it('loads the focused overview without feature editors', async () => {
  getAdminOverviewDataMock.mockResolvedValue({
    metrics: {
      totalUsers: 12,
      proUsers: 4,
      suspendedUsers: 1,
      newUsersThisMonth: 2,
      totalApplications: 7,
      pendingApplications: 3,
    },
    activity: [{
      id: 'application:1',
      kind: 'trainer_application',
      label: 'Solicitud: Ada Entrenadora',
      occurredAt: '2026-08-19T14:00:00.000Z',
      href: '/admin/trainers',
    }],
    bannerEnabled: true,
  })
  const html = renderToStaticMarkup(await AdminPage())

  expect(html).toContain('Estado general de la plataforma')
  expect(html).toContain('Actividad reciente')
  expect(html).toContain('Solicitud: Ada Entrenadora')
  expect(html).not.toContain('Buscar por correo, nombre o usuario')
  expect(html).not.toContain('Guardar banner')
  expect(getAdminOverviewDataMock).toHaveBeenCalledWith(expect.objectContaining({
    timeZone: 'America/Havana',
    now: expect.any(String),
  }))
})
