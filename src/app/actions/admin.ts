'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import type { Json } from '@/types/database'
import { requireAdminUserContext } from '@/lib/auth/admin'
import { isOwnerAdminEmail } from '@/lib/auth/identity'

const ADMIN_USERS_PATH = '/admin/users'
const adminUsersFeedback = (key: 'notice' | 'error', value: string) => (
  `${ADMIN_USERS_PATH}?${key}=${value}`
)
const USER_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const ALLOWED_DURATIONS = new Set(['7', '30', 'indefinite'])

function readTargetId(formData: FormData): string {
  const targetUserId = String(formData.get('targetUserId') ?? '')
  if (!USER_ID_PATTERN.test(targetUserId)) redirect(adminUsersFeedback('error', 'admin_invalid_user'))
  return targetUserId
}

async function getMutableTarget(targetUserId: string) {
  const context = await requireAdminUserContext()
  const { data, error } = await context.service.auth.admin.getUserById(targetUserId)

  if (error || !data.user) redirect(adminUsersFeedback('error', 'admin_invalid_user'))
  if (isOwnerAdminEmail(data.user.email)) redirect(adminUsersFeedback('error', 'admin_owner_protected'))

  return { ...context, target: data.user }
}

async function writeAudit({
  service,
  adminUserId,
  targetUserId,
  action,
  reason = null,
  metadata = {},
}: {
  service: Awaited<ReturnType<typeof requireAdminUserContext>>['service']
  adminUserId: string
  targetUserId: string
  action: string
  reason?: string | null
  metadata?: Json
}) {
  await service.from('admin_audit_logs').insert({
    admin_user_id: adminUserId,
    target_user_id: targetUserId,
    action,
    reason,
    metadata,
  })
}

export async function setUserSubscription(formData: FormData) {
  const targetUserId = readTargetId(formData)
  const tier = String(formData.get('tier') ?? '')
  if (tier !== 'free' && tier !== 'pro') {
    redirect(adminUsersFeedback('error', 'admin_invalid_action'))
  }

  const { user, service } = await getMutableTarget(targetUserId)
  const { error } = await (service.rpc as any)('set_subscription_tier_atomic', {
    p_user_id: targetUserId,
    p_subscription_tier: tier,
  })
  if (error?.message?.includes('PLAN_DOWNGRADE_FAMILY_LIMIT')) {
    redirect(adminUsersFeedback('error', 'admin_plan_downgrade_family_limit'))
  }
  if (error?.message?.includes('PLAN_TIER_LOCK_BUSY_RETRY')) {
    redirect(adminUsersFeedback('error', 'admin_plan_tier_busy'))
  }
  if (error) redirect(adminUsersFeedback('error', 'admin_update_failed'))

  await writeAudit({
    service,
    adminUserId: user.id,
    targetUserId,
    action: tier === 'pro' ? 'subscription_granted' : 'subscription_cancelled',
    metadata: { tier },
  })

  revalidatePath(ADMIN_USERS_PATH)
  revalidatePath('/admin')
  redirect(adminUsersFeedback(
    'notice',
    tier === 'pro' ? 'admin_pro_granted' : 'admin_subscription_cancelled',
  ))
}

export async function suspendUser(formData: FormData) {
  const targetUserId = readTargetId(formData)
  const reason = String(formData.get('reason') ?? '').trim().slice(0, 500)
  const duration = String(formData.get('duration') ?? '')

  if (reason.length < 4 || !ALLOWED_DURATIONS.has(duration)) {
    redirect(adminUsersFeedback('error', 'admin_suspension_fields'))
  }

  const { user, service } = await getMutableTarget(targetUserId)
  const suspendedUntil = duration === 'indefinite'
    ? null
    : new Date(Date.now() + Number(duration) * 24 * 60 * 60 * 1000).toISOString()

  const { error } = await (service.rpc as any)('suspend_account_and_professional', {
    p_user_id: targetUserId,
    p_admin_id: user.id,
    p_reason: reason,
    p_until: suspendedUntil,
  })

  if (error) redirect(adminUsersFeedback('error', 'admin_update_failed'))

  revalidatePath(ADMIN_USERS_PATH)
  revalidatePath('/admin')
  redirect(adminUsersFeedback('notice', 'admin_user_suspended'))
}

export async function reactivateUser(formData: FormData) {
  const targetUserId = readTargetId(formData)
  const { user, service } = await getMutableTarget(targetUserId)

  const { error } = await service.from('profiles').update({
    account_status: 'active',
    suspension_reason: null,
    suspended_at: null,
    suspended_until: null,
    suspended_by: null,
  }).eq('id', targetUserId)

  if (error) redirect(adminUsersFeedback('error', 'admin_update_failed'))

  await writeAudit({
    service,
    adminUserId: user.id,
    targetUserId,
    action: 'account_reactivated',
  })

  revalidatePath(ADMIN_USERS_PATH)
  revalidatePath('/admin')
  redirect(adminUsersFeedback('notice', 'admin_user_reactivated'))
}
