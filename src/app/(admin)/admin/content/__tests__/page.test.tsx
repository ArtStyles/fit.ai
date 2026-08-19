import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it, vi } from 'vitest'
import { I18nProvider } from '@/components/i18n/I18nProvider'
import type { DashboardBannerData } from '@/lib/dashboard/banner'
import AdminContentPage from '../page'

const { getAdminDashboardBannerMock } = vi.hoisted(() => ({
  getAdminDashboardBannerMock: vi.fn(),
}))

vi.mock('react-dom', async importOriginal => ({
  ...await importOriginal<typeof import('react-dom')>(),
  useFormStatus: () => ({ pending: false }),
}))

vi.mock('@/app/actions/dashboardBanner', () => ({
  saveDashboardBanner: '/admin/content',
}))

vi.mock('@/lib/auth/admin', () => ({
  getAdminDashboardBanner: getAdminDashboardBannerMock,
}))

const bannerFixture: DashboardBannerData = {
  slot: 'dashboard-primary',
  kind: 'announcement',
  title: 'Aviso operativo',
  description: null,
  image_url: null,
  cta_label: null,
  cta_href: null,
  status: 'draft',
  starts_on: null,
  ends_on: null,
  updated_at: '2026-08-19T12:00:00.000Z',
}

async function renderPage() {
  return renderToStaticMarkup(
    <I18nProvider language="es" syncDocumentLanguage={false}>
      {await AdminContentPage()}
    </I18nProvider>,
  )
}

it('loads only banner data into the Content route and renders the real editor', async () => {
  getAdminDashboardBannerMock.mockResolvedValue({ enabled: true, banner: bannerFixture })

  const html = await renderPage()

  expect(html).toContain('Contenido')
  expect(html).toContain('Banner del dashboard')
  expect(html).toContain('Guardar banner')
  expect(html).not.toContain('Cuentas de usuario')
  expect(getAdminDashboardBannerMock).toHaveBeenCalledOnce()
})

it('passes the unavailable feature state to the real editor', async () => {
  getAdminDashboardBannerMock.mockResolvedValue({ enabled: false, banner: null })

  const html = await renderPage()

  expect(html).toContain('Contenido no disponible')
})

it('preserves the unconfigured banner empty state in the real editor', async () => {
  getAdminDashboardBannerMock.mockResolvedValue({ enabled: true, banner: null })

  const html = await renderPage()

  expect(html).toContain('Banner sin configurar')
})
