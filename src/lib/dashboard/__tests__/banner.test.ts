import { describe, expect, it } from 'vitest'
import {
  isDashboardBannerVisible,
  normalizeDashboardBannerHref,
  validateDashboardBannerImage,
  type DashboardBannerData,
} from '../banner'

const banner: DashboardBannerData = {
  slot: 'dashboard-primary',
  kind: 'event',
  title: 'Reto de verano',
  description: null,
  image_url: null,
  cta_label: null,
  cta_href: null,
  status: 'active',
  starts_on: '2026-07-01',
  ends_on: '2026-07-31',
  updated_at: '2026-07-03T00:00:00.000Z',
}

describe('dashboard banner', () => {
  it('solo muestra un banner activo dentro de su rango de fechas', () => {
    expect(isDashboardBannerVisible(banner, '2026-07-03')).toBe(true)
    expect(isDashboardBannerVisible(banner, '2026-08-01')).toBe(false)
    expect(isDashboardBannerVisible({ ...banner, status: 'draft' }, '2026-07-03')).toBe(false)
  })

  it('acepta rutas internas y URLs HTTPS', () => {
    expect(normalizeDashboardBannerHref('/plan')).toBe('/plan')
    expect(normalizeDashboardBannerHref('https://fit.ai/evento')).toBe('https://fit.ai/evento')
    expect(normalizeDashboardBannerHref('javascript:alert(1)')).toBeNull()
    expect(normalizeDashboardBannerHref('//example.com')).toBeNull()
  })

  it('rechaza archivos que no sean imágenes permitidas', () => {
    expect(validateDashboardBannerImage('image/webp', 1024)).toEqual({ ok: true })
    expect(validateDashboardBannerImage('image/svg+xml', 1024).ok).toBe(false)
    expect(validateDashboardBannerImage('image/png', 9 * 1024 * 1024).ok).toBe(false)
  })
})

