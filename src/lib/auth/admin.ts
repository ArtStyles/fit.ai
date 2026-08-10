import 'server-only'

import { redirect } from 'next/navigation'
import type { User } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { isOwnerAdminEmail } from '@/lib/auth/identity'
import type { DashboardBannerData } from '@/lib/dashboard/banner'
import { DASHBOARD_BANNER_SLOT } from '@/lib/dashboard/banner'
import { isTrainerMarketplacePilotGateEnabled } from '@/lib/features/trainerMarketplacePilot'

export type AdminUserRecord = {
  id: string
  email: string
  fullName: string | null
  username: string | null
  avatarUrl: string | null
  subscriptionTier: 'free' | 'pro'
  accountStatus: 'active' | 'suspended'
  suspensionReason: string | null
  suspendedUntil: string | null
  createdAt: string
  lastSignInAt: string | null
  isOwner: boolean
}

export type AdminUsersData = {
  users: AdminUserRecord[]
  suspensionEnabled: boolean
}

export type AdminDashboardBannerData = {
  banner: DashboardBannerData | null
  enabled: boolean
}

function isExactTrainerMarketplaceE2EAdmin(user: User): boolean {
  const metadata = user.user_metadata as Record<string, unknown> | undefined
  return isTrainerMarketplacePilotGateEnabled(process.env)
    && metadata?.e2e_run_id === process.env.E2E_RUN_ID
    && metadata?.trainer_relationship_role === 'admin'
}

export async function requireAdminUserContext() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login?error=auth_required')
  const service = createServiceClient()
  if (!isOwnerAdminEmail(user.email)) {
    if (!isExactTrainerMarketplaceE2EAdmin(user)) redirect('/dashboard')
    const { data: profile, error } = await service
      .from('profiles')
      .select('is_admin,account_status')
      .eq('id', user.id)
      .maybeSingle()
    if (error || profile?.is_admin !== true || profile.account_status !== 'active') redirect('/dashboard')
    return { user, service }
  }

  // Keep the owner invariant true even if the profile predates migration 029.
  await service
    .from('profiles')
    .update({ subscription_tier: 'pro' })
    .eq('id', user.id)

  // These columns are available after migration 029. Keeping this separate
  // preserves subscription administration while the migration is pending.
  await service
    .from('profiles')
    .update({
      is_admin: true,
      account_status: 'active',
      suspension_reason: null,
      suspended_at: null,
      suspended_until: null,
      suspended_by: null,
    })
    .eq('id', user.id)

  return { user, service }
}

export async function listAdminUsers(): Promise<AdminUsersData> {
  const { service } = await requireAdminUserContext()

  const [
    { data: authData, error: authError },
    { data: profiles, error: profileError },
    { data: accessProfiles, error: accessError },
  ] = await Promise.all([
    service.auth.admin.listUsers({ page: 1, perPage: 200 }),
    service
      .from('profiles')
      .select('id, full_name, username, avatar_url, subscription_tier'),
    service
      .from('profiles')
      .select('id, account_status, suspension_reason, suspended_until'),
  ])

  if (authError || profileError) {
    throw new Error(authError?.message ?? profileError?.message ?? 'No se pudieron cargar los usuarios.')
  }

  const profileById = new Map((profiles ?? []).map(profile => [profile.id, profile]))
  const accessById = new Map((accessProfiles ?? []).map(profile => [profile.id, profile]))

  const users = authData.users.map((user: User) => {
    const profile = profileById.get(user.id)
    const access = accessById.get(user.id)
    const isOwner = isOwnerAdminEmail(user.email)
    const suspensionActive = access?.account_status === 'suspended'
      && (!access.suspended_until || new Date(access.suspended_until).getTime() > Date.now())
    const accountStatus: AdminUserRecord['accountStatus'] = isOwner || !suspensionActive
      ? 'active'
      : 'suspended'

    return {
      id: user.id,
      email: user.email ?? 'Sin correo',
      fullName: profile?.full_name ?? null,
      username: profile?.username ?? null,
      avatarUrl: profile?.avatar_url ?? null,
      subscriptionTier: isOwner ? 'pro' : profile?.subscription_tier ?? 'free',
      accountStatus,
      suspensionReason: isOwner || !suspensionActive ? null : access?.suspension_reason ?? null,
      suspendedUntil: isOwner || !suspensionActive ? null : access?.suspended_until ?? null,
      createdAt: user.created_at,
      lastSignInAt: user.last_sign_in_at ?? null,
      isOwner,
    }
  })

  return { users, suspensionEnabled: !accessError }
}

export async function getAdminDashboardBanner(): Promise<AdminDashboardBannerData> {
  const { service } = await requireAdminUserContext()
  const { data, error } = await service
    .from('dashboard_banners')
    .select('slot, kind, title, description, image_url, cta_label, cta_href, status, starts_on, ends_on, updated_at')
    .eq('slot', DASHBOARD_BANNER_SLOT)
    .maybeSingle()

  return {
    banner: error ? null : data,
    enabled: !error,
  }
}
