import { describe, expect, it } from 'vitest'
import {
  buildPlanAdjustmentIntent,
  buildPlanAdjustmentSummary,
} from '../planAdjustmentForm'

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

describe('buildPlanAdjustmentSummary', () => {
  it('formats deterministic preview counts in the active language', () => {
    expect(buildPlanAdjustmentSummary({
      daysBefore: 4,
      daysAfter: 3,
      exercisesAddedCount: 2,
      exercisesRemovedCount: 1,
      changedPrescriptionCount: 5,
      warnings: ['Engine warning'],
    }, 'en')).toEqual([
      'Weekly days: 4 → 3',
      '2 exercises added',
      '1 exercise replaced or removed',
      '5 prescriptions adjusted',
      'Engine warning',
    ])
  })

  it('returns a localized no-structural-change message', () => {
    expect(buildPlanAdjustmentSummary({
      daysBefore: 4,
      daysAfter: 4,
      exercisesAddedCount: 0,
      exercisesRemovedCount: 0,
      changedPrescriptionCount: 0,
      warnings: [],
    }, 'en')).toEqual([
      'The plan was recalculated and validated without major structural changes.',
    ])
  })
})
