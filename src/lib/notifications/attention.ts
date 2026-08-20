export function buildPlanUpdateNoticeKey(planId: string, updatedAt: string): string {
  return `plan-update:${planId}:${updatedAt}`
}
