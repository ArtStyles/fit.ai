import type { createClient } from '@/lib/supabase/server'

export type SubscriptionTier = 'free' | 'pro'

export type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>

export type PlanCreatePolicy =
  | { allowed: true; tier: SubscriptionTier; planCount: number; replacingExisting: boolean }
  | { allowed: false; tier: SubscriptionTier; planCount: number; reason: string }

export async function getSubscriptionTier(
  supabase: SupabaseServerClient,
  userId: string,
): Promise<SubscriptionTier> {
  const { data } = await (supabase.from('profiles') as any)
    .select('subscription_tier')
    .eq('id', userId)
    .maybeSingle() as {
      data: { subscription_tier: SubscriptionTier | null } | null
    }

  return data?.subscription_tier === 'pro' ? 'pro' : 'free'
}

export async function getSavedPlanCount(
  supabase: SupabaseServerClient,
  userId: string,
): Promise<number> {
  const { count } = await (supabase.from('workout_plans') as any)
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId) as { count: number | null }

  return count ?? 0
}

export async function getPlanCreatePolicy(
  supabase: SupabaseServerClient,
  userId: string,
  options: { replaceExistingForFree?: boolean } = {},
): Promise<PlanCreatePolicy> {
  const [tier, planCount] = await Promise.all([
    getSubscriptionTier(supabase, userId),
    getSavedPlanCount(supabase, userId),
  ])

  if (tier === 'pro' || planCount === 0) {
    return { allowed: true, tier, planCount, replacingExisting: false }
  }

  if (options.replaceExistingForFree) {
    return { allowed: true, tier, planCount, replacingExisting: true }
  }

  return {
    allowed: false,
    tier,
    planCount,
    reason: 'Tu cuenta free solo permite guardar un plan. Reemplaza el plan actual o actualiza a Pro.',
  }
}

export async function removeOtherPlansForFreeUser(
  supabase: SupabaseServerClient,
  userId: string,
  keepPlanId: string,
): Promise<void> {
  const tier = await getSubscriptionTier(supabase, userId)
  if (tier !== 'free') return

  const { data: plans } = await (supabase.from('workout_plans') as any)
    .select('id')
    .eq('user_id', userId)
    .neq('id', keepPlanId) as { data: { id: string }[] | null }

  const planIds = (plans ?? []).map(plan => plan.id)
  if (planIds.length === 0) return

  await (supabase.from('workout_plans') as any)
    .delete()
    .eq('user_id', userId)
    .in('id', planIds)
}
