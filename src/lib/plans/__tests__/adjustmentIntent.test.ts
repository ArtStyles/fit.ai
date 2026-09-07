import { describe, expect, it } from 'vitest'
import { validatePlanAdjustmentIntent } from '../adjustmentIntent'

const options = {
  currentDaysPerWeek: 4,
  currentSessionDurationMinutes: 60,
  availableEquipment: ['dumbbells', 'bench'],
  cardioPreferences: ['walking' as const],
  exercises: [{ id: 'exercise-1', name: 'Press de banca' }],
  currentWorkoutDays: [2, 4, 6],
}

describe('validatePlanAdjustmentIntent', () => {
  it.each([
    [
      { type: 'change_days', daysPerWeek: 3 },
      { type: 'change_days', daysPerWeek: 3, preferredWorkoutDays: [2, 4, 6] },
    ],
    [
      { type: 'change_duration', sessionDurationMinutes: 45 },
      { type: 'change_duration', sessionDurationMinutes: 45 },
    ],
    [
      { type: 'change_intensity', direction: 'easier' },
      { type: 'change_intensity', direction: 'easier' },
    ],
    [
      { type: 'equipment_unavailable', equipment: ['bench'] },
      { type: 'equipment_unavailable', equipment: ['bench'] },
    ],
    [
      { type: 'replace_exercise', exerciseId: 'exercise-1' },
      { type: 'replace_exercise', exerciseId: 'exercise-1' },
    ],
    [
      { type: 'change_cardio_preferences', cardioPreferences: ['cycling'] },
      { type: 'change_cardio_preferences', cardioPreferences: ['cycling'] },
    ],
  ])('accepts and normalizes a supported intent %#', (raw, expected) => {
    expect(validatePlanAdjustmentIntent(raw, options)).toEqual(expected)
  })

  it.each([
    { type: 'change_days', daysPerWeek: 7 },
    { type: 'change_days', daysPerWeek: 3.5 },
    { type: 'change_duration', sessionDurationMinutes: 50 },
    { type: 'change_intensity', direction: 'maximum' },
    { type: 'equipment_unavailable', equipment: ['barbell'] },
    { type: 'equipment_unavailable', equipment: [] },
    { type: 'replace_exercise', exerciseId: 'foreign-id' },
    { type: 'change_cardio_preferences', cardioPreferences: ['swimming'] },
    { type: 'change_cardio_preferences', cardioPreferences: [] },
    { type: 'health_change' },
  ])('rejects an unsupported or out-of-context intent %#', raw => {
    expect(validatePlanAdjustmentIntent(raw, options)).toBeNull()
  })

  it('deduplicates valid multi-select values', () => {
    expect(validatePlanAdjustmentIntent({
      type: 'equipment_unavailable',
      equipment: ['bench', 'bench'],
    }, options)).toEqual({
      type: 'equipment_unavailable',
      equipment: ['bench'],
    })
  })

  it('resolves quantity-only day changes against the active workout calendar', () => {
    expect(validatePlanAdjustmentIntent({ type: 'change_days', daysPerWeek: 2 }, options)).toEqual({
      type: 'change_days',
      daysPerWeek: 2,
      preferredWorkoutDays: [2, 4],
    })
  })

  it('accepts exact unique ISO weekdays and rejects duplicates or a mismatched count', () => {
    expect(validatePlanAdjustmentIntent({
      type: 'change_days', daysPerWeek: 2, preferredWorkoutDays: [3, 7],
    }, options)).toEqual({
      type: 'change_days', daysPerWeek: 2, preferredWorkoutDays: [3, 7],
    })
    expect(validatePlanAdjustmentIntent({
      type: 'change_days', daysPerWeek: 2, preferredWorkoutDays: [3, 3],
    }, options)).toBeNull()
    expect(validatePlanAdjustmentIntent({
      type: 'change_days', daysPerWeek: 2, preferredWorkoutDays: [3],
    }, options)).toBeNull()
  })

  it('rejects applying an intent when active workout weekdays changed after preview', () => {
    expect(validatePlanAdjustmentIntent({
      type: 'change_duration',
      sessionDurationMinutes: 45,
      expectedCurrentWorkoutDays: [2, 4, 6],
    }, { ...options, currentWorkoutDays: [1, 3, 5] })).toBeNull()
  })
})
