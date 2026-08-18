import { describe, expect, it } from 'vitest'
import { parsePersonalDataForm } from '../personalData'

const NOW = new Date('2026-08-16T12:00:00.000Z')

function personalDataForm(overrides: Record<string, string> = {}) {
  const formData = new FormData()
  const values = {
    heightCm: '',
    dateOfBirth: '',
    gender: '',
    ...overrides,
  }

  for (const [key, value] of Object.entries(values)) formData.set(key, value)
  return formData
}

describe('parsePersonalDataForm', () => {
  it('accepts a completely empty optional profile as explicit null values', () => {
    expect(parsePersonalDataForm(personalDataForm(), NOW)).toEqual({
      ok: true,
      value: { heightCm: null, dateOfBirth: null, gender: null },
    })
  })

  it('normalizes valid personal data', () => {
    expect(parsePersonalDataForm(personalDataForm({
      heightCm: ' 175.5 ',
      dateOfBirth: '1996-01-01',
      gender: 'prefer_not_to_say',
    }), NOW)).toEqual({
      ok: true,
      value: {
        heightCm: 175.5,
        dateOfBirth: '1996-01-01',
        gender: 'prefer_not_to_say',
      },
    })
  })

  it.each([
    ['heightCm', '99.9'],
    ['heightCm', '250.1'],
    ['heightCm', 'Infinity'],
    ['heightCm', '175cm'],
    ['gender', 'unsupported'],
    ['dateOfBirth', '2010-08-17'],
    ['dateOfBirth', '1925-08-15'],
    ['dateOfBirth', '2023-02-29'],
    ['dateOfBirth', '1996-1-1'],
  ])('rejects invalid %s=%s', (field, value) => {
    const result = parsePersonalDataForm(personalDataForm({ [field]: value }), NOW)

    expect(result).toMatchObject({
      ok: false,
      formError: 'Revisa los campos indicados.',
      fieldErrors: { [field]: expect.any(String) },
    })
  })

  it('accepts the inclusive height and age boundaries at the supplied clock', () => {
    expect(parsePersonalDataForm(personalDataForm({
      heightCm: '100',
      dateOfBirth: '2008-08-16',
      gender: 'male',
    }), NOW).ok).toBe(true)
    expect(parsePersonalDataForm(personalDataForm({
      heightCm: '250',
      dateOfBirth: '1925-08-17',
      gender: 'female',
    }), NOW).ok).toBe(true)
  })

  it('uses whether the birthday has occurred when calculating age', () => {
    expect(parsePersonalDataForm(personalDataForm({ dateOfBirth: '2008-08-17' }), NOW).ok).toBe(false)
    expect(parsePersonalDataForm(personalDataForm({ dateOfBirth: '1925-08-16' }), NOW).ok).toBe(false)
  })
})
