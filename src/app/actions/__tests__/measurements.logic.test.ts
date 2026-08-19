import { describe, expect, it } from 'vitest'
import { parseMeasurementPayload } from '../measurements.logic'

const ranges = {
  weight_kg: [30, 300],
  body_fat_percentage: [1, 75],
  muscle_mass_kg: [5, 200],
  chest_cm: [10, 300],
  waist_cm: [10, 300],
  hips_cm: [10, 300],
  arms_cm: [10, 300],
  legs_cm: [10, 300],
} as const

describe('parseMeasurementPayload', () => {
  it.each(Object.entries(ranges))(
    'accepts the inclusive limits for %s',
    (field, [minimum, maximum]) => {
      expect(parseMeasurementPayload({ [field]: minimum })).toEqual({
        ok: true,
        value: { [field]: minimum },
      })
      expect(parseMeasurementPayload({ [field]: maximum })).toEqual({
        ok: true,
        value: { [field]: maximum },
      })
    },
  )

  it.each([
    ['weight_kg', 29.9], ['weight_kg', 300.1],
    ['body_fat_percentage', 0.9], ['body_fat_percentage', 75.1],
    ['muscle_mass_kg', 4.9], ['muscle_mass_kg', 200.1],
    ['chest_cm', 9.9], ['chest_cm', 300.1],
    ['waist_cm', 9.9], ['waist_cm', 300.1],
    ['hips_cm', 9.9], ['hips_cm', 300.1],
    ['arms_cm', 9.9], ['arms_cm', 300.1],
    ['legs_cm', 9.9], ['legs_cm', 300.1],
  ])('rejects %s=%s outside the accepted range', (field, value) => {
    const result = parseMeasurementPayload({ [field]: value })

    expect(result).toMatchObject({
      ok: false,
      fieldErrors: { [field]: expect.any(String) },
    })
  })

  it.each(Object.keys(ranges))('rejects string coercion for %s', field => {
    const result = parseMeasurementPayload({ [field]: '72.5' })

    expect(result).toMatchObject({
      ok: false,
      fieldErrors: { [field]: expect.any(String) },
    })
  })

  it('rejects non-finite numeric values', () => {
    expect(parseMeasurementPayload({ weight_kg: Number.NaN })).toMatchObject({
      ok: false,
      fieldErrors: { weight_kg: expect.any(String) },
    })
    expect(parseMeasurementPayload({ weight_kg: Number.POSITIVE_INFINITY })).toMatchObject({
      ok: false,
      fieldErrors: { weight_kg: expect.any(String) },
    })
    expect(parseMeasurementPayload({ weight_kg: Number.NEGATIVE_INFINITY })).toMatchObject({
      ok: false,
      fieldErrors: { weight_kg: expect.any(String) },
    })
  })

  it('accepts notes-only payloads and trims them', () => {
    expect(parseMeasurementPayload({ notes: '  observación  ' })).toEqual({
      ok: true,
      value: { notes: 'observación' },
    })
  })

  it('accepts a trimmed note at 500 characters and rejects a longer note', () => {
    expect(parseMeasurementPayload({ notes: `  ${'x'.repeat(500)}  ` })).toEqual({
      ok: true,
      value: { notes: 'x'.repeat(500) },
    })
    expect(parseMeasurementPayload({ notes: 'x'.repeat(501) })).toMatchObject({
      ok: false,
      fieldErrors: { notes: expect.any(String) },
    })
  })

  it('preserves explicit nulls when another value keeps the payload non-empty', () => {
    expect(parseMeasurementPayload({ weight_kg: null, notes: 'registro corregido' })).toEqual({
      ok: true,
      value: { weight_kg: null, notes: 'registro corregido' },
    })
    expect(parseMeasurementPayload({ notes: '', waist_cm: 80 })).toEqual({
      ok: true,
      value: { waist_cm: 80, notes: null },
    })
  })

  it.each([
    {},
    { weight_kg: null },
    { notes: '' },
    { notes: '   ' },
    { weight_kg: undefined, notes: undefined },
  ])('rejects an empty normalized payload %#', payload => {
    expect(parseMeasurementPayload(payload)).toMatchObject({
      ok: false,
      error: expect.any(String),
    })
  })
})
