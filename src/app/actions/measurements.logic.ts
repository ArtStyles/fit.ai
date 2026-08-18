import type { LogMeasurementPayload } from './measurements'

export const MEASUREMENT_RANGES = {
  weight_kg: [30, 300],
  body_fat_percentage: [1, 75],
  muscle_mass_kg: [5, 200],
  chest_cm: [10, 300],
  waist_cm: [10, 300],
  hips_cm: [10, 300],
  arms_cm: [10, 300],
  legs_cm: [10, 300],
} as const

type NumericMeasurementField = keyof typeof MEASUREMENT_RANGES

export type MeasurementField = NumericMeasurementField | 'notes'
export type MeasurementFieldErrors = Partial<Record<MeasurementField, string>>
export type MeasurementPayloadParseResult =
  | { ok: true; value: LogMeasurementPayload }
  | { ok: false; error: string; fieldErrors: MeasurementFieldErrors }

const INVALID_PAYLOAD_ERROR = 'Revisa los campos de la medida.'
const EMPTY_PAYLOAD_ERROR = 'Introduce al menos un valor.'

export function parseMeasurementPayload(input: unknown): MeasurementPayloadParseResult {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    return { ok: false, error: INVALID_PAYLOAD_ERROR, fieldErrors: {} }
  }

  const raw = input as Record<string, unknown>
  const value: LogMeasurementPayload = {}
  const fieldErrors: MeasurementFieldErrors = {}

  for (const field of Object.keys(MEASUREMENT_RANGES) as NumericMeasurementField[]) {
    const candidate = raw[field]
    if (candidate === undefined) continue
    if (candidate === null) {
      value[field] = null
      continue
    }

    const [minimum, maximum] = MEASUREMENT_RANGES[field]
    if (
      typeof candidate !== 'number'
      || !Number.isFinite(candidate)
      || candidate < minimum
      || candidate > maximum
    ) {
      fieldErrors[field] = `Debe ser un número entre ${minimum} y ${maximum}.`
      continue
    }

    value[field] = candidate
  }

  if (raw.notes !== undefined) {
    if (raw.notes === null) {
      value.notes = null
    } else if (typeof raw.notes !== 'string') {
      fieldErrors.notes = 'Las notas deben ser texto.'
    } else {
      const notes = raw.notes.trim()
      if (notes.length > 500) {
        fieldErrors.notes = 'Las notas no pueden superar 500 caracteres.'
      } else {
        value.notes = notes || null
      }
    }
  }

  if (Object.keys(fieldErrors).length > 0) {
    return { ok: false, error: INVALID_PAYLOAD_ERROR, fieldErrors }
  }

  const hasContent = Object.values(value).some(candidate => candidate !== null && candidate !== undefined)
  if (!hasContent) {
    return { ok: false, error: EMPTY_PAYLOAD_ERROR, fieldErrors: {} }
  }

  return { ok: true, value }
}
