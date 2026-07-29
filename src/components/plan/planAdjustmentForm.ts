import type { CardioModality, PlanAdjustmentIntent } from '@/lib/training-engine'

export type PlanAdjustmentCategory =
  | 'days'
  | 'duration'
  | 'intensity'
  | 'equipment'
  | 'cardio'
  | 'exercise'

export type PlanAdjustmentDraft =
  | { category: 'days'; daysPerWeek: number }
  | { category: 'duration'; minutes: 30 | 45 | 60 | 90 }
  | { category: 'intensity'; direction: 'easier' | 'harder' }
  | { category: 'equipment'; equipment: readonly string[] }
  | { category: 'cardio'; cardioPreferences: readonly CardioModality[] }
  | { category: 'exercise'; exerciseId: string }

export function buildPlanAdjustmentIntent(
  draft: PlanAdjustmentDraft,
): PlanAdjustmentIntent | null {
  switch (draft.category) {
    case 'days':
      return { type: 'change_days', daysPerWeek: draft.daysPerWeek }
    case 'duration':
      return { type: 'change_duration', sessionDurationMinutes: draft.minutes }
    case 'intensity':
      return { type: 'change_intensity', direction: draft.direction }
    case 'equipment':
      return draft.equipment.length > 0
        ? { type: 'equipment_unavailable', equipment: [...draft.equipment] }
        : null
    case 'cardio':
      return draft.cardioPreferences.length > 0
        ? {
            type: 'change_cardio_preferences',
            cardioPreferences: [...draft.cardioPreferences],
          }
        : null
    case 'exercise':
      return draft.exerciseId
        ? { type: 'replace_exercise', exerciseId: draft.exerciseId }
        : null
  }
}
