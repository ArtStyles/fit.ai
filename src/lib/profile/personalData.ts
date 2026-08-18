export const PERSONAL_DATA_GENDERS = [
  { value: 'male', label: 'Masculino' },
  { value: 'female', label: 'Femenino' },
  { value: 'other', label: 'Otro' },
  { value: 'prefer_not_to_say', label: 'Prefiero no decir' },
] as const

export type PersonalDataGender = typeof PERSONAL_DATA_GENDERS[number]['value']

export type PersonalDataValue = {
  heightCm: number | null
  dateOfBirth: string | null
  gender: PersonalDataGender | null
}

export type PersonalDataFieldErrors = Partial<Record<
  'heightCm' | 'dateOfBirth' | 'gender',
  string
>>

export type PersonalDataParseResult =
  | { ok: true; value: PersonalDataValue }
  | { ok: false; formError: string; fieldErrors: PersonalDataFieldErrors }

export type PersonalDataActionState = {
  ok: boolean
  message: string | null
  formError: string | null
  fieldErrors: PersonalDataFieldErrors
}

export const INITIAL_PERSONAL_DATA_STATE: PersonalDataActionState = {
  ok: false,
  message: null,
  formError: null,
  fieldErrors: {},
}

const HEIGHT_PATTERN = /^(?:\d+(?:\.\d+)?|\.\d+)$/
const ISO_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/
const PERSONAL_DATA_GENDER_VALUES = new Set<string>(
  PERSONAL_DATA_GENDERS.map(({ value }) => value),
)

function optionalString(formData: FormData, field: string): string | null | undefined {
  const raw = formData.get(field)
  if (raw === null) return null
  if (typeof raw !== 'string') return undefined
  const value = raw.trim()
  return value.length > 0 ? value : null
}

function exactIsoDateParts(value: string) {
  const match = ISO_DATE_PATTERN.exec(value)
  if (!match) return null

  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const date = new Date(Date.UTC(year, month - 1, day))

  if (
    date.getUTCFullYear() !== year
    || date.getUTCMonth() !== month - 1
    || date.getUTCDate() !== day
  ) return null

  return { year, month, day }
}

function ageAt(
  birth: { year: number; month: number; day: number },
  now: Date,
): number {
  let age = now.getUTCFullYear() - birth.year
  const birthdayHasOccurred = now.getUTCMonth() + 1 > birth.month
    || (now.getUTCMonth() + 1 === birth.month && now.getUTCDate() >= birth.day)
  if (!birthdayHasOccurred) age -= 1
  return age
}

export function parsePersonalDataForm(
  formData: FormData,
  now: Date = new Date(),
): PersonalDataParseResult {
  const fieldErrors: PersonalDataFieldErrors = {}
  const rawHeight = optionalString(formData, 'heightCm')
  const rawDateOfBirth = optionalString(formData, 'dateOfBirth')
  const rawGender = optionalString(formData, 'gender')

  let heightCm: number | null = null
  if (rawHeight === undefined || (rawHeight !== null && !HEIGHT_PATTERN.test(rawHeight))) {
    fieldErrors.heightCm = 'La altura debe estar entre 100 y 250 cm.'
  } else if (rawHeight !== null) {
    heightCm = Number(rawHeight)
    if (!Number.isFinite(heightCm) || heightCm < 100 || heightCm > 250) {
      fieldErrors.heightCm = 'La altura debe estar entre 100 y 250 cm.'
    }
  }

  let dateOfBirth: string | null = null
  if (rawDateOfBirth === undefined) {
    fieldErrors.dateOfBirth = 'La fecha debe ser válida y corresponder a una edad entre 18 y 100 años.'
  } else if (rawDateOfBirth !== null) {
    const birth = exactIsoDateParts(rawDateOfBirth)
    const age = birth && Number.isFinite(now.getTime()) ? ageAt(birth, now) : null
    if (age === null || age < 18 || age > 100) {
      fieldErrors.dateOfBirth = 'La fecha debe ser válida y corresponder a una edad entre 18 y 100 años.'
    } else {
      dateOfBirth = rawDateOfBirth
    }
  }

  let gender: PersonalDataGender | null = null
  if (rawGender === undefined || (rawGender !== null && !PERSONAL_DATA_GENDER_VALUES.has(rawGender))) {
    fieldErrors.gender = 'Selecciona un género válido.'
  } else if (rawGender !== null) {
    gender = rawGender as PersonalDataGender
  }

  if (Object.keys(fieldErrors).length > 0) {
    return { ok: false, formError: 'Revisa los campos indicados.', fieldErrors }
  }

  return { ok: true, value: { heightCm, dateOfBirth, gender } }
}
