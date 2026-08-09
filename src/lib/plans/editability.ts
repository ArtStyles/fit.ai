export type PlanCapabilities = {
  canEdit: boolean
  canAdjustWithAi: boolean
  canRegenerate: boolean
  canRetire: boolean
  canShare: boolean
  canActivate: boolean
}

type PlanEditabilityInput = {
  prescriptionLocked?: boolean | null
  prescription_locked?: boolean | null
}

export function getPlanCapabilities(plan: PlanEditabilityInput): PlanCapabilities {
  const prescriptionLocked = plan.prescriptionLocked ?? plan.prescription_locked ?? false
  if (prescriptionLocked) {
    return {
      canEdit: false,
      canAdjustWithAi: false,
      canRegenerate: false,
      canRetire: false,
      canShare: false,
      canActivate: false,
    }
  }

  return {
    canEdit: true,
    canAdjustWithAi: true,
    canRegenerate: true,
    canRetire: true,
    canShare: true,
    canActivate: true,
  }
}

type QueryableSupabase = {
  from: (table: 'workout_plans') => any
}

/** Server-only authorization barrier. UI capability flags are never trusted. */
export async function requireEditableOwnedPlan(
  supabase: QueryableSupabase,
  userId: string,
  planId: string,
): Promise<{ id: string; prescription_locked: boolean }> {
  const { data, error } = await supabase
    .from('workout_plans')
    .select('id, prescription_locked')
    .eq('id', planId)
    .eq('user_id', userId)
    .maybeSingle()

  if (error || !data || !getPlanCapabilities(data).canEdit) {
    throw new Error('PLAN_PRESCRIPTION_LOCKED')
  }

  return data as { id: string; prescription_locked: boolean }
}
