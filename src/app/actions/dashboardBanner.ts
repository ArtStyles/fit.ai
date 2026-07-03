'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { requireAdminUserContext } from '@/lib/auth/admin'
import {
  DASHBOARD_BANNER_BUCKET,
  DASHBOARD_BANNER_IMAGE_PATH,
  DASHBOARD_BANNER_KINDS,
  DASHBOARD_BANNER_SLOT,
  DASHBOARD_BANNER_STATUSES,
  normalizeDashboardBannerHref,
  validateDashboardBannerImage,
  type DashboardBannerKind,
  type DashboardBannerStatus,
} from '@/lib/dashboard/banner'

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

function optionalText(formData: FormData, key: string, maxLength: number): string | null {
  const value = String(formData.get(key) ?? '').trim()
  return value ? value.slice(0, maxLength) : null
}

export async function saveDashboardBanner(formData: FormData) {
  const title = String(formData.get('title') ?? '').trim()
  const description = optionalText(formData, 'description', 280)
  const ctaLabel = optionalText(formData, 'ctaLabel', 40)
  const rawCtaHref = String(formData.get('ctaHref') ?? '').trim()
  const ctaHref = normalizeDashboardBannerHref(rawCtaHref)
  const kind = String(formData.get('kind') ?? '') as DashboardBannerKind
  const status = String(formData.get('status') ?? '') as DashboardBannerStatus
  const startsOn = optionalText(formData, 'startsOn', 10)
  const endsOn = optionalText(formData, 'endsOn', 10)

  const invalidDates = (startsOn && !DATE_PATTERN.test(startsOn))
    || (endsOn && !DATE_PATTERN.test(endsOn))
    || (startsOn && endsOn && startsOn > endsOn)
  const invalidCta = Boolean(ctaLabel) !== Boolean(rawCtaHref) || Boolean(rawCtaHref && !ctaHref)

  if (
    title.length < 3
    || title.length > 100
    || !DASHBOARD_BANNER_KINDS.includes(kind)
    || !DASHBOARD_BANNER_STATUSES.includes(status)
    || invalidDates
    || invalidCta
  ) {
    redirect('/admin?error=admin_banner_invalid')
  }

  const { user, service } = await requireAdminUserContext()
  const { data: current } = await service
    .from('dashboard_banners')
    .select('image_url')
    .eq('slot', DASHBOARD_BANNER_SLOT)
    .maybeSingle()

  let imageUrl = current?.image_url ?? null
  const image = formData.get('image')
  const removeImage = formData.get('removeImage') === 'on'

  if (image instanceof File && image.size > 0) {
    const validation = validateDashboardBannerImage(image.type, image.size)
    if (!validation.ok) redirect('/admin?error=admin_banner_image')

    const { error: uploadError } = await service.storage
      .from(DASHBOARD_BANNER_BUCKET)
      .upload(DASHBOARD_BANNER_IMAGE_PATH, image, {
        contentType: image.type,
        cacheControl: '3600',
        upsert: true,
      })
    if (uploadError) redirect('/admin?error=admin_banner_update_failed')

    const publicUrl = service.storage
      .from(DASHBOARD_BANNER_BUCKET)
      .getPublicUrl(DASHBOARD_BANNER_IMAGE_PATH).data.publicUrl
    imageUrl = `${publicUrl}?v=${Date.now()}`
  } else if (removeImage) {
    imageUrl = null
  }

  const now = new Date().toISOString()
  const { error } = await service.from('dashboard_banners').upsert({
    slot: DASHBOARD_BANNER_SLOT,
    kind,
    title,
    description,
    image_url: imageUrl,
    cta_label: ctaLabel,
    cta_href: ctaHref,
    status,
    starts_on: startsOn,
    ends_on: endsOn,
    updated_by: user.id,
    updated_at: now,
  }, { onConflict: 'slot' })

  if (error) redirect('/admin?error=admin_banner_update_failed')

  if (removeImage && !(image instanceof File && image.size > 0)) {
    await service.storage.from(DASHBOARD_BANNER_BUCKET).remove([DASHBOARD_BANNER_IMAGE_PATH])
  }

  await service.from('admin_audit_logs').insert({
    admin_user_id: user.id,
    target_user_id: null,
    action: 'dashboard_banner_updated',
    metadata: { kind, status, starts_on: startsOn, ends_on: endsOn },
  })

  revalidatePath('/admin')
  revalidatePath('/dashboard')
  redirect('/admin?notice=admin_banner_saved')
}
