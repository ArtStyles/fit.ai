import 'server-only'

import { createClient } from '@supabase/supabase-js'
import { createServiceClient } from '@/lib/supabase/service'

type SuspensionInput = {
  accessToken: string
  targetUserId: string
  reason: string
}

type ReinstateInput = {
  accessToken: string
  targetUserId: string
}

async function requireAuthenticatedAdmin(accessToken: string) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !anonKey || !accessToken) throw new Error('ADMIN_AUTH_REQUIRED')

  const authenticated = createClient(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const { data: identity, error: identityError } = await authenticated.auth.getUser(accessToken)
  if (identityError || !identity.user) throw new Error('ADMIN_AUTH_REQUIRED')

  const service = createServiceClient()
  const { data: profile, error: profileError } = await service
    .from('profiles')
    .select('is_admin,account_status')
    .eq('id', identity.user.id)
    .maybeSingle()
  if (profileError || profile?.is_admin !== true || profile.account_status !== 'active') {
    throw new Error('ADMIN_AUTH_REQUIRED')
  }
  return { adminId: identity.user.id, service }
}

export async function suspendTrainerThroughAuthenticatedAdmin(input: SuspensionInput): Promise<{
  accountSuspended: boolean
}> {
  const { adminId, service } = await requireAuthenticatedAdmin(input.accessToken)

  const { data, error } = await (service.rpc as any)('suspend_account_and_professional', {
    p_user_id: input.targetUserId,
    p_admin_id: adminId,
    p_reason: input.reason,
    p_until: null,
  })
  if (error) throw new Error('ADMIN_SUSPENSION_FAILED')
  const row = Array.isArray(data) ? data[0] : data
  return { accountSuspended: row?.account_suspended === true }
}

export async function reinstateTrainerThroughAuthenticatedAdmin(input: ReinstateInput): Promise<{
  accountReactivated: boolean
  profileReinstated: boolean
}> {
  const { adminId, service } = await requireAuthenticatedAdmin(input.accessToken)
  const { data, error } = await (service.rpc as any)('reactivate_and_reinstate_trainer', {
    p_user_id: input.targetUserId,
    p_admin_id: adminId,
  })
  if (error) throw new Error('ADMIN_REINSTATEMENT_FAILED')
  const row = Array.isArray(data) ? data[0] : data
  return {
    accountReactivated: row?.account_reactivated === true,
    profileReinstated: row?.profile_reinstated === true,
  }
}
