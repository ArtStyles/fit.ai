import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { defaultAnswers, type OnboardingAnswers } from '@/app/onboarding/types'
import { dateOfBirthFromAge, parseDecimalAge } from '@/lib/profile/age'
import { validateConfirmationFields } from '../confirmationValidation'

const confirmationAnswers: OnboardingAnswers = {
  ...defaultAnswers,
  age: '30',
  weight_kg: '68',
  height_cm: '170',
  gender: 'female',
}

describe('shared age conversion contract', () => {
  it.each([
    ['18', 18, '2008-01-01'],
    ['90', 90, '1936-01-01'],
    ['100', 100, '1926-01-01'],
  ])('accepts decimal integer age %s consistently', (raw, age, birthDate) => {
    expect(parseDecimalAge(raw)).toBe(age)
    expect(dateOfBirthFromAge(raw, 2026)).toBe(birthDate)
    expect(validateConfirmationFields({ ...confirmationAnswers, age: raw }).valid).toBe(true)
  })

  it.each(['', ' ', '9e1', '30.5', 'abc', '17', '101', 'Infinity'])('rejects malformed or out-of-range age %j consistently', raw => {
    expect(parseDecimalAge(raw)).toBeNull()
    expect(() => dateOfBirthFromAge(raw, 2026)).toThrow('Edad inválida')
    expect(validateConfirmationFields({ ...confirmationAnswers, age: raw }).valid).toBe(false)
  })

  it('uses the shared birth-date conversion at the save boundary', () => {
    const actions = readFileSync(new URL('../../../app/onboarding/actions.ts', import.meta.url), 'utf8')
    expect(actions).toContain("import { dateOfBirthFromAge } from '@/lib/profile/age'")
    expect(actions).toContain('dateOfBirthFromAge(answers.age)')
    expect(actions).not.toContain('parseInt(answers.age')
  })
})
