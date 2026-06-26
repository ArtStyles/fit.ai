import 'server-only'

import { cache } from 'react'
import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import type { User } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'

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

  const { data: profile } = await supabase
    .from('profiles')
    .select('onboarding_done, full_name, avatar_url, timezone, last_check_in_at, username, is_private')
    .eq('id', user.id)
    .single() as unknown as { data: AppProfile | null }

  return { supabase, user, profile }
})

export async function requireAppUserContext() {
  const context = await getAppUserContext()

  if (!context.user) redirect('/login')
  if (!context.profile?.onboarding_done) redirect('/onboarding')

  return context as AppUserContext & {
    user: AppUser
    profile: AppProfile
  }
}
