import type { CardioModality, PlanAdjustmentIntent } from '@/lib/training-engine'

export const CARDIO_MODALITIES = [
  'walking',
  'running',
  'cycling',
  'elliptical',
  'rowing',
  'stairs',
  'jump_rope',
] as const satisfies readonly CardioModality[]

export interface PlanAdjustmentOptions {
  currentDaysPerWeek: number
  currentSessionDurationMinutes: number
  availableEquipment: string[]
  cardioPreferences: CardioModality[]
  exercises: Array<{ id: string; name: string }>
}

function uniqueStrings(values: unknown[]): string[] {
  return Array.from(new Set(values.filter((value): value is string => typeof value === 'string')))
}

export function validatePlanAdjustmentIntent(
  raw: unknown,
  options: PlanAdjustmentOptions,
): PlanAdjustmentIntent | null {
  if (!raw || typeof raw !== 'object') return null
  const value = raw as Record<string, unknown>

  if (
    value.type === 'change_days'
    && Number.isInteger(value.daysPerWeek)
    && Number(value.daysPerWeek) >= 2
    && Number(value.daysPerWeek) <= 6
  ) {
    return { type: 'change_days', daysPerWeek: Number(value.daysPerWeek) }
  }

  if (
    value.type === 'change_duration'
    && [30, 45, 60, 90].includes(Number(value.sessionDurationMinutes))
  ) {
    return {
      type: 'change_duration',
      sessionDurationMinutes: Number(value.sessionDurationMinutes) as 30 | 45 | 60 | 90,
    }
  }

  if (
    value.type === 'change_intensity'
    && (value.direction === 'easier' || value.direction === 'harder')
  ) {
    return { type: 'change_intensity', direction: value.direction }
  }

  if (value.type === 'equipment_unavailable' && Array.isArray(value.equipment)) {
    const allowed = new Set(options.availableEquipment)
    if (
      value.equipment.length === 0
      || !value.equipment.every(item => typeof item === 'string' && allowed.has(item))
    ) {
      return null
    }
    return {
      type: 'equipment_unavailable',
      equipment: uniqueStrings(value.equipment),
    }
  }

  if (
    value.type === 'replace_exercise'
    && typeof value.exerciseId === 'string'
    && options.exercises.some(exercise => exercise.id === value.exerciseId)
  ) {
    return { type: 'replace_exercise', exerciseId: value.exerciseId }
  }

  if (value.type === 'change_cardio_preferences' && Array.isArray(value.cardioPreferences)) {
    const allowed = new Set<string>(CARDIO_MODALITIES)
    if (
      value.cardioPreferences.length === 0
      || !value.cardioPreferences.every(item => typeof item === 'string' && allowed.has(item))
    ) {
      return null
    }
    return {
      type: 'change_cardio_preferences',
      cardioPreferences: uniqueStrings(value.cardioPreferences) as CardioModality[],
    }
  }

  return null
}
