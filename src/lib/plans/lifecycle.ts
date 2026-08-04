export type PlanGenerationMode = 'initial' | 'weekly_regeneration' | 'plan_adjustment'

export interface ActivePlanLineage {
  id: string
  familyId: string
}

export interface PlanGenerationLifecycle {
  createsNewFamily: boolean
  expectedParentPlanId: string | null
  replacingFamilyId: string | null
}

export function resolvePlanGenerationLifecycle(
  mode: PlanGenerationMode,
  activePlan: ActivePlanLineage | null,
): PlanGenerationLifecycle {
  if (mode === 'initial') {
    return {
      createsNewFamily: true,
      expectedParentPlanId: null,
      replacingFamilyId: null,
    }
  }

  if (!activePlan) throw new Error('ACTIVE_PLAN_REQUIRED')

  return {
    createsNewFamily: false,
    expectedParentPlanId: activePlan.id,
    replacingFamilyId: activePlan.familyId,
  }
}
