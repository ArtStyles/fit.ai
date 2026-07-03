export const DASHBOARD_BANNER_SLOT = 'dashboard-primary'
export const DASHBOARD_BANNER_BUCKET = 'dashboard-banners'
export const DASHBOARD_BANNER_IMAGE_PATH = 'primary/banner'
export const MAX_DASHBOARD_BANNER_IMAGE_BYTES = 8 * 1024 * 1024

export const DASHBOARD_BANNER_KINDS = ['announcement', 'event', 'promotion', 'info'] as const
export const DASHBOARD_BANNER_STATUSES = ['draft', 'active', 'paused'] as const

export type DashboardBannerKind = (typeof DASHBOARD_BANNER_KINDS)[number]
export type DashboardBannerStatus = (typeof DASHBOARD_BANNER_STATUSES)[number]

export type DashboardBannerData = {
  slot: string
  kind: DashboardBannerKind
  title: string
  description: string | null
  image_url: string | null
  cta_label: string | null
  cta_href: string | null
  status: DashboardBannerStatus
  starts_on: string | null
  ends_on: string | null
  updated_at: string
}

export type BannerImageValidation = { ok: true } | { ok: false; error: string }

export function validateDashboardBannerImage(type: string, size: number): BannerImageValidation {
  const allowedTypes = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/avif'])
  if (!allowedTypes.has(type)) return { ok: false, error: 'Usa una imagen JPG, PNG, WebP o AVIF.' }
  if (size <= 0) return { ok: false, error: 'La imagen está vacía.' }
  if (size > MAX_DASHBOARD_BANNER_IMAGE_BYTES) {
    return { ok: false, error: 'La imagen supera el tamaño máximo de 8 MB.' }
  }
  return { ok: true }
}

export function normalizeDashboardBannerHref(value: string): string | null {
  const href = value.trim()
  if (!href) return null
  if (href.startsWith('/') && !href.startsWith('//')) return href

  try {
    const url = new URL(href)
    return url.protocol === 'https:' ? url.toString() : null
  } catch {
    return null
  }
}

export function isDashboardBannerVisible(
  banner: DashboardBannerData | null,
  today = new Date().toISOString().slice(0, 10),
): banner is DashboardBannerData {
  if (!banner || banner.status !== 'active') return false
  if (banner.starts_on && banner.starts_on > today) return false
  if (banner.ends_on && banner.ends_on < today) return false
  return true
}

