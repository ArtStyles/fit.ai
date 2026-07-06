import { describe, expect, it } from 'vitest'
import { defaultAnswers, type OnboardingAnswers } from '@/app/onboarding/types'
import { validateConfirmationFields } from '../confirmationValidation'

const valid: OnboardingAnswers = {
  ...defaultAnswers,
  age: '30',
  weight_kg: '68',
  height_cm: '170',
  gender: 'female',
}

describe('confirmation numeric validation', () => {
  it.each([
    ['18', '30', '100'],
    ['100', '300', '250'],
  ])('accepts inclusive boundaries age=%s weight=%s height=%s', (age, weight_kg, height_cm) => {
    expect(validateConfirmationFields({ ...valid, age, weight_kg, height_cm })).toEqual({ valid: true, errors: {} })
  })

  it('associates localized errors with blank fields', () => {
    expect(validateConfirmationFields({ ...valid, age: '', weight_kg: '', height_cm: '', gender: null })).toEqual({
      valid: false,
      errors: {
        age: 'Introduce una edad entre 18 y 100 años.',
        weight_kg: 'Introduce un peso entre 30 y 300 kg.',
        height_cm: 'Introduce una altura entre 100 y 250 cm.',
        gender: 'Selecciona una opción.',
      },
    })
  })

  it.each([
    ['age', 'NaN'],
    ['age', 'Infinity'],
    ['age', '17'],
    ['age', '101'],
    ['weight_kg', 'NaN'],
    ['weight_kg', 'Infinity'],
    ['weight_kg', '29.9'],
    ['weight_kg', '300.1'],
    ['height_cm', 'NaN'],
    ['height_cm', 'Infinity'],
    ['height_cm', '99.9'],
    ['height_cm', '250.1'],
  ] as const)('rejects invalid %s value %s', (field, value) => {
    const result = validateConfirmationFields({ ...valid, [field]: value })
    expect(result.valid).toBe(false)
    expect(result.errors[field]).toBeTruthy()
  })

  it('requires age to be a whole number', () => {
    const result = validateConfirmationFields({ ...valid, age: '30.5' })
    expect(result.valid).toBe(false)
    expect(result.errors.age).toBeTruthy()
  })
})
