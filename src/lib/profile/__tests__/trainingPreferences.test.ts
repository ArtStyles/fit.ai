import { describe, expect, it } from 'vitest'
import {
  EQUIPMENT_OPTIONS,
  parseTrainingSettingsForm,
} from '../trainingPreferences'

function validForm(overrides: Record<string, string | string[]> = {}) {
  const form = new FormData()
  const values: Record<string, string | string[]> = {
    primaryGoal: 'build_muscle',
    fitnessLevel: 'intermediate',
    daysPerWeek: '3',
    sessionDurationMinutes: '60',
    gymType: 'home_basic',
    preferredWorkoutDays: ['1', '3', '5'],
    availableEquipment: ['dumbbells', 'resistance_bands'],
    injuries: '',
    ...overrides,
  }
  for (const [key, raw] of Object.entries(values)) {
    for (const value of Array.isArray(raw) ? raw : [raw]) form.append(key, value)
  }
  return form
}

describe('parseTrainingSettingsForm', () => {
  it('normalizes a valid payload', () => {
    expect(parseTrainingSettingsForm(validForm())).toEqual({
      ok: true,
      value: {
        primaryGoal: 'build_muscle',
        fitnessLevel: 'intermediate',
        daysPerWeek: 3,
        sessionDurationMinutes: 60,
        gymType: 'home_basic',
        preferredWorkoutDays: [1, 3, 5],
        availableEquipment: ['dumbbells', 'resistance_bands'],
        injuries: null,
      },
    })
  })

  it.each(['20', '45.5', '120'])('rejects unsupported duration %s', duration => {
    const result = parseTrainingSettingsForm(validForm({ sessionDurationMinutes: duration }))
    expect(result).toMatchObject({ ok: false, fieldErrors: { sessionDurationMinutes: expect.any(String) } })
  })

  it.each(['2e0', '0x2', '02'])('rejects coercible frequency token %s', frequency => {
    const result = parseTrainingSettingsForm(validForm({
      daysPerWeek: frequency,
      preferredWorkoutDays: ['1', '3'],
    }))
    expect(result).toMatchObject({ ok: false, fieldErrors: { daysPerWeek: expect.any(String) } })
  })

  it.each(['6e1', '0x3c', '060'])('rejects coercible duration token %s', duration => {
    const result = parseTrainingSettingsForm(validForm({ sessionDurationMinutes: duration }))
    expect(result).toMatchObject({ ok: false, fieldErrors: { sessionDurationMinutes: expect.any(String) } })
  })

  it('rejects a coercible ISO day token', () => {
    const result = parseTrainingSettingsForm(validForm({ preferredWorkoutDays: ['01', '3', '5'] }))
    expect(result).toMatchObject({ ok: false, fieldErrors: { preferredWorkoutDays: expect.any(String) } })
  })

  it('requires the selected-day count to equal frequency after deduplication', () => {
    const result = parseTrainingSettingsForm(validForm({ preferredWorkoutDays: ['1', '1', '5'] }))
    expect(result).toMatchObject({ ok: false, fieldErrors: { preferredWorkoutDays: expect.any(String) } })
  })

  it('clears equipment for bodyweight training', () => {
    const result = parseTrainingSettingsForm(validForm({
      gymType: 'home_no_equipment',
      availableEquipment: ['barbell'],
    }))
    expect(result).toMatchObject({ ok: true, value: { availableEquipment: [] } })
  })

  it('rejects unknown equipment and overlong injury notes', () => {
    expect(parseTrainingSettingsForm(validForm({ availableEquipment: ['unknown'] })).ok).toBe(false)
    expect(parseTrainingSettingsForm(validForm({ injuries: 'x'.repeat(1001) })).ok).toBe(false)
  })
})

it('keeps the exact eight engine-supported equipment values', () => {
  expect(EQUIPMENT_OPTIONS.map(option => option.value)).toEqual([
    'dumbbells', 'barbell', 'bench', 'kettlebell',
    'resistance_bands', 'cable_machine', 'pull_up_bar', 'trx',
  ])
})
