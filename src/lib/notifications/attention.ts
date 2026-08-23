export function buildPlanUpdateNoticeKey(planId: string, updatedAt: string): string {
  return `plan-update:${planId}:${updatedAt}`
}

export function buildPromoNoticeKey(slot: string, updatedAt: string): string {
  return `promo:${slot}:${updatedAt}`
}

export function buildCheckInNoticeKey(lastCheckInAt: string | null): string {
  return `check-in:${lastCheckInAt ?? 'never'}`
}
