import type { createClient } from '@/lib/supabase/server'

export type SubscriptionTier = 'free' | 'pro'

export const FREE_PLAN_LIMIT = 2

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

  if (tier === 'pro') {
    return { allowed: true, tier, planCount, replacingExisting: false }
  }

  if (options.replaceExistingForFree && planCount > 0) {
    return { allowed: true, tier, planCount, replacingExisting: true }
  }

  if (planCount < FREE_PLAN_LIMIT) {
    return { allowed: true, tier, planCount, replacingExisting: false }
  }

  return {
    allowed: false,
    tier,
    planCount,
    reason: 'Tu cuenta free permite guardar hasta dos planes. Reemplaza uno de tus planes o actualiza a Pro.',
  }
}

type SavedPlan = { id: string; created_at: string }

export function getFreePlanIdsToRemove(
  plans: SavedPlan[],
  keepPlanId: string,
  replacedPlanId?: string | null,
): string[] {
  const hasReplacedPlan = Boolean(
    replacedPlanId
    && replacedPlanId !== keepPlanId
    && plans.some(plan => plan.id === replacedPlanId),
  )
  const removalCount = Math.max(hasReplacedPlan ? 1 : 0, plans.length - FREE_PLAN_LIMIT)
  if (removalCount === 0) return []

  return plans
    .filter(plan => plan.id !== keepPlanId)
    .sort((a, b) => {
      if (a.id === replacedPlanId) return -1
      if (b.id === replacedPlanId) return 1
      return new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    })
    .slice(0, removalCount)
    .map(plan => plan.id)
}

export async function pruneExcessPlansForFreeUser(
  supabase: SupabaseServerClient,
  userId: string,
  keepPlanId: string,
  replacedPlanId?: string | null,
): Promise<void> {
  const tier = await getSubscriptionTier(supabase, userId)
  if (tier !== 'free') return

  const { data: plans } = await (supabase.from('workout_plans') as any)
    .select('id, created_at')
    .eq('user_id', userId) as { data: SavedPlan[] | null }

  const planIds = getFreePlanIdsToRemove(plans ?? [], keepPlanId, replacedPlanId)
  if (planIds.length === 0) return

  await (supabase.from('workout_plans') as any)
    .delete()
    .eq('user_id', userId)
    .in('id', planIds)
}
