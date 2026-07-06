import type { OnboardingAnswers } from '@/app/onboarding/types'

export interface ConfirmationFieldErrors {
  age?: string
  weight_kg?: string
  height_cm?: string
  gender?: string
}

function validBoundedNumber(value: string, min: number, max: number, integer = false): boolean {
  if (!value.trim()) return false
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed >= min && parsed <= max && (!integer || Number.isInteger(parsed))
}

export function validateConfirmationFields(answers: OnboardingAnswers): {
  valid: boolean
  errors: ConfirmationFieldErrors
} {
  const errors: ConfirmationFieldErrors = {}

  if (!validBoundedNumber(answers.age, 18, 100, true)) {
    errors.age = 'Introduce una edad entre 18 y 100 años.'
  }
  if (!validBoundedNumber(answers.weight_kg, 30, 300)) {
    errors.weight_kg = 'Introduce un peso entre 30 y 300 kg.'
  }
  if (!validBoundedNumber(answers.height_cm, 100, 250)) {
    errors.height_cm = 'Introduce una altura entre 100 y 250 cm.'
  }
  if (answers.gender === null) {
    errors.gender = 'Selecciona una opción.'
  }

  return { valid: Object.keys(errors).length === 0, errors }
}
