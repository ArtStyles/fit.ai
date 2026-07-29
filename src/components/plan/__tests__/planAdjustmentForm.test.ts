import { describe, expect, it } from 'vitest'
import { buildPlanAdjustmentIntent } from '../planAdjustmentForm'

describe('buildPlanAdjustmentIntent', () => {
  it.each([
    [
      { category: 'days', daysPerWeek: 4 },
      { type: 'change_days', daysPerWeek: 4 },
    ],
    [
      { category: 'duration', minutes: 45 },
      { type: 'change_duration', sessionDurationMinutes: 45 },
    ],
    [
      { category: 'intensity', direction: 'easier' },
      { type: 'change_intensity', direction: 'easier' },
    ],
    [
      { category: 'equipment', equipment: ['bench'] },
      { type: 'equipment_unavailable', equipment: ['bench'] },
    ],
    [
      { category: 'cardio', cardioPreferences: ['cycling'] },
      { type: 'change_cardio_preferences', cardioPreferences: ['cycling'] },
    ],
    [
      { category: 'exercise', exerciseId: 'exercise-1' },
      { type: 'replace_exercise', exerciseId: 'exercise-1' },
    ],
  ] as const)('builds the selected structured intent %#', (draft, expected) => {
    expect(buildPlanAdjustmentIntent(draft)).toEqual(expected)
  })

  it('requires at least one unavailable equipment item', () => {
    expect(buildPlanAdjustmentIntent({
      category: 'equipment',
      equipment: [],
    })).toBeNull()
  })

  it('requires at least one cardio modality', () => {
    expect(buildPlanAdjustmentIntent({
      category: 'cardio',
      cardioPreferences: [],
    })).toBeNull()
  })

  it('requires an exercise selection', () => {
    expect(buildPlanAdjustmentIntent({
      category: 'exercise',
      exerciseId: '',
    })).toBeNull()
  })
})
