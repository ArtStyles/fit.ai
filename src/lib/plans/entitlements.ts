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
  const { data, error } = await (supabase.from('profiles') as any)
    .select('subscription_tier')
    .eq('id', userId)
    .maybeSingle() as {
      data: { subscription_tier: SubscriptionTier | null } | null
      error: { message?: string } | null
    }

  if (error) throw new Error(error.message ?? 'No se pudo consultar la suscripción.')
  return data?.subscription_tier === 'pro' ? 'pro' : 'free'
}

export async function getSavedPlanCount(
  supabase: SupabaseServerClient,
  userId: string,
): Promise<number> {
  const { count, error } = await (supabase.from('workout_plans') as any)
    .select('family_id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .is('superseded_at', null)
    .is('retired_at', null) as { count: number | null; error: { message?: string } | null }

  if (error) throw new Error(error.message ?? 'No se pudo consultar la biblioteca de planes.')
  return count ?? 0
}

async function hasReplaceableFamily(
  supabase: SupabaseServerClient,
  userId: string,
  familyId: string,
): Promise<boolean> {
  const { count, error } = await (supabase.from('workout_plans') as any)
    .select('family_id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('family_id', familyId)
    .is('superseded_at', null)
    .is('retired_at', null) as { count: number | null; error: { message?: string } | null }

  if (error) throw new Error(error.message ?? 'No se pudo validar la familia del plan.')
  return (count ?? 0) > 0
}

export async function getPlanCreatePolicy(
  supabase: SupabaseServerClient,
  userId: string,
  options: { replacingFamilyId?: string | null } = {},
): Promise<PlanCreatePolicy> {
  const [tier, planCount] = await Promise.all([
    getSubscriptionTier(supabase, userId),
    getSavedPlanCount(supabase, userId),
  ])

  if (tier === 'pro') {
    return { allowed: true, tier, planCount, replacingExisting: false }
  }

  const replacingExisting = options.replacingFamilyId
    ? await hasReplaceableFamily(supabase, userId, options.replacingFamilyId)
    : false

  if (replacingExisting || planCount < FREE_PLAN_LIMIT) {
    return { allowed: true, tier, planCount, replacingExisting }
  }

  return {
    allowed: false,
    tier,
    planCount,
    reason: 'Tu cuenta free permite guardar hasta dos planes. Reemplaza uno de tus planes o actualiza a Pro.',
  }
}
