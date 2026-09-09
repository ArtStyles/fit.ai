import { getAppStore } from './storage'
import { createClient } from './bridge-client'
import { redirect } from './router'
import { isSuspensionActive } from '@/lib/auth/access'
import type { AppProfile } from '@/lib/auth/server'

export async function getAppUserContext() {
  const state = await (await getAppStore()).read()
  const profile = state?.tables.profiles.find(row => row.id === state.accountId) as AppProfile | undefined
  const supabase = await createClient({ expectedAccountId: state?.accountId ?? null })
  return { supabase, user: state ? { id: state.accountId, email: state.email } : null, profile: profile ?? null }
}
export async function requireAppUserContext() {
  const context = await getAppUserContext()
  if (!context.user) redirect('/login')
  if (isSuspensionActive(context.profile)) redirect('/suspended')
  if (!context.profile?.onboarding_done) redirect('/onboarding')
  return { ...context, user: context.user!, profile: context.profile! }
}
