import 'server-only'

import { cache } from 'react'
import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import type { User } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { isSuspensionActive } from '@/lib/auth/access'
import { isOwnerAdminEmail } from '@/lib/auth/identity'

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>
type AppUser = Pick<User, 'id'> & { email?: string }

export type AppProfile = {
  onboarding_done: boolean
  full_name: string | null
  avatar_url: string | null
  timezone: string | null
  last_check_in_at: string | null
  username: string | null
  is_private: boolean
  subscription_tier: 'free' | 'pro'
  is_admin: boolean
  account_status: 'active' | 'suspended'
  suspension_reason: string | null
  suspended_at: string | null
  suspended_until: string | null
  language: 'es' | 'en'
}

type AppUserContext = {
  supabase: SupabaseServerClient
  user: AppUser | null
  profile: AppProfile | null
}

export const getAppUserContext = cache(async (): Promise<AppUserContext> => {
  const supabase = await createClient()
  const requestHeaders = headers()
  const headerUserId = requestHeaders.get('x-fitai-user-id')
  const headerEmail = requestHeaders.get('x-fitai-user-email') ?? undefined

  let user: AppUser | null = headerUserId
    ? { id: headerUserId, email: headerEmail }
    : null

  if (!user) {
    const { data } = await supabase.auth.getUser()
    user = data.user
  }

  if (!user) {
    return { supabase, user: null, profile: null }
  }

  const [{ data: baseProfile }, { data: accessProfile }] = await Promise.all([
    supabase
      .from('profiles')
      .select('onboarding_done, full_name, avatar_url, timezone, last_check_in_at, username, is_private, subscription_tier, language')
      .eq('id', user.id)
      .single(),
    supabase
      .from('profiles')
      .select('is_admin, account_status, suspension_reason, suspended_at, suspended_until')
      .eq('id', user.id)
      .maybeSingle(),
  ]) as unknown as [
    { data: Omit<AppProfile, 'is_admin' | 'account_status' | 'suspension_reason' | 'suspended_at' | 'suspended_until'> | null },
    { data: Pick<AppProfile, 'is_admin' | 'account_status' | 'suspension_reason' | 'suspended_at' | 'suspended_until'> | null },
  ]

  const owner = isOwnerAdminEmail(user.email)
  const profile: AppProfile | null = baseProfile
    ? {
        ...baseProfile,
        subscription_tier: owner ? 'pro' : baseProfile.subscription_tier,
        is_admin: owner || accessProfile?.is_admin || false,
        account_status: owner ? 'active' : accessProfile?.account_status ?? 'active',
        suspension_reason: owner ? null : accessProfile?.suspension_reason ?? null,
        suspended_at: owner ? null : accessProfile?.suspended_at ?? null,
        suspended_until: owner ? null : accessProfile?.suspended_until ?? null,
      }
    : null

  return { supabase, user, profile }
})

export async function requireAppUserContext() {
  const context = await getAppUserContext()

  if (!context.user) redirect('/login')
  if (isSuspensionActive(context.profile)) redirect('/suspended')
  if (!context.profile?.onboarding_done) redirect('/onboarding')

  return context as AppUserContext & {
    user: AppUser
    profile: AppProfile
  }
}
