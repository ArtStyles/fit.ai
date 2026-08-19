import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it, vi } from 'vitest'
import type { AdminOverviewData } from '@/lib/admin/overview'

vi.mock('next/navigation', () => ({ usePathname: () => '/admin' }))

import { AdminActivityList } from '../AdminActivityList'
import { AdminOverview } from '../AdminOverview'

it('distinguishes unavailable metrics from zero and renders real task links', () => {
  const data: AdminOverviewData = {
    metrics: {
      totalUsers: null,
      proUsers: 0,
      suspendedUsers: 0,
      newUsersThisMonth: null,
      totalApplications: 7,
      pendingApplications: 3,
    },
    activity: [],
    bannerEnabled: true,
  }
  const html = renderToStaticMarkup(
    <AdminOverview data={data} timeZone="America/Havana" />,
  )

  expect(html).toContain('No disponible')
  expect(html).toContain('Usuarios Pro')
  expect(html).toContain('>0<')
  expect(html).toContain('href="/admin/trainers"')
  expect(html).toContain('3 expedientes requieren atención')
  const links = html.match(/<a\b[^>]*>/g) ?? []
  expect(links.length).toBeGreaterThan(0)
  expect(links.every(link => link.includes('min-h-11'))).toBe(true)
})

it('renders an explicit empty state when no activity exists', () => {
  const html = renderToStaticMarkup(
    <AdminActivityList items={[]} timeZone="America/Havana" />,
  )

  expect(html).toContain('No hay actividad reciente disponible')
})
