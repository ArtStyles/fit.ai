export const TRAINING_GOALS = [
  { value: 'lose_weight', label: 'Perder peso' },
  { value: 'build_muscle', label: 'Ganar músculo' },
  { value: 'gain_strength', label: 'Ganar fuerza' },
  { value: 'stay_active', label: 'Mantenerse activo' },
  { value: 'improve_endurance', label: 'Mejorar resistencia' },
  { value: 'other', label: 'Otro' },
] as const

export const FITNESS_LEVELS = [
  { value: 'beginner', label: 'Principiante' },
  { value: 'intermediate', label: 'Intermedio' },
  { value: 'advanced', label: 'Avanzado' },
] as const

export const GYM_TYPES = [
  { value: 'home_no_equipment', label: 'Casa sin equipo' },
  { value: 'home_basic', label: 'Casa con equipo básico' },
  { value: 'full_gym', label: 'Gimnasio completo' },
] as const

export const TRAINING_FREQUENCIES = [2, 3, 4, 5, 6] as const
export const SESSION_DURATIONS = [30, 45, 60, 90] as const
export const WEEK_DAYS = [
  { value: 1, shortLabel: 'L', label: 'Lunes' },
  { value: 2, shortLabel: 'M', label: 'Martes' },
  { value: 3, shortLabel: 'X', label: 'Miércoles' },
  { value: 4, shortLabel: 'J', label: 'Jueves' },
  { value: 5, shortLabel: 'V', label: 'Viernes' },
  { value: 6, shortLabel: 'S', label: 'Sábado' },
  { value: 7, shortLabel: 'D', label: 'Domingo' },
] as const

export const EQUIPMENT_OPTIONS = [
  { value: 'dumbbells', label: 'Mancuernas' },
  { value: 'barbell', label: 'Barra' },
  { value: 'bench', label: 'Banco' },
  { value: 'kettlebell', label: 'Kettlebell' },
  { value: 'resistance_bands', label: 'Bandas' },
  { value: 'cable_machine', label: 'Polea o cable' },
  { value: 'pull_up_bar', label: 'Barra de dominadas' },
  { value: 'trx', label: 'TRX' },
] as const

export type TrainingSettingsValue = {
  primaryGoal: typeof TRAINING_GOALS[number]['value']
  fitnessLevel: typeof FITNESS_LEVELS[number]['value']
  daysPerWeek: typeof TRAINING_FREQUENCIES[number]
  sessionDurationMinutes: typeof SESSION_DURATIONS[number]
  gymType: typeof GYM_TYPES[number]['value']
  preferredWorkoutDays: number[]
  availableEquipment: Array<typeof EQUIPMENT_OPTIONS[number]['value']>
  injuries: string | null
}

export type TrainingSettingsFieldErrors = Partial<Record<
  'primaryGoal' | 'fitnessLevel' | 'daysPerWeek' |
  'sessionDurationMinutes' | 'gymType' |
  'preferredWorkoutDays' | 'availableEquipment' | 'injuries',
  string
>>

export type TrainingSettingsParseResult =
  | { ok: true; value: TrainingSettingsValue }
  | { ok: false; fieldErrors: TrainingSettingsFieldErrors; formError: string }

function includes<T extends string | number>(options: readonly T[], value: unknown): value is T {
  return options.includes(value as T)
}

function values<T extends { value: string }>(options: readonly T[]) {
  return options.map(option => option.value)
}

function getText(formData: FormData, name: string): string | null {
  const value = formData.get(name)
  return typeof value === 'string' ? value.trim() : null
}

function getTexts(formData: FormData, name: string): string[] | null {
  const entries = formData.getAll(name)
  return entries.every((entry): entry is string => typeof entry === 'string')
    ? entries.map(entry => entry.trim())
    : null
}

const TRAINING_FREQUENCY_TOKENS = TRAINING_FREQUENCIES.map(String)
const SESSION_DURATION_TOKENS = SESSION_DURATIONS.map(String)
const WEEK_DAY_TOKENS = WEEK_DAYS.map(option => String(option.value))

export function parseTrainingSettingsForm(formData: FormData): TrainingSettingsParseResult {
  const fieldErrors: TrainingSettingsFieldErrors = {}

  const primaryGoal = getText(formData, 'primaryGoal')
  if (!includes(values(TRAINING_GOALS), primaryGoal)) fieldErrors.primaryGoal = 'Selecciona un objetivo válido.'

  const fitnessLevel = getText(formData, 'fitnessLevel')
  if (!includes(values(FITNESS_LEVELS), fitnessLevel)) fieldErrors.fitnessLevel = 'Selecciona un nivel válido.'

  const daysPerWeekText = getText(formData, 'daysPerWeek')
  const daysPerWeek = includes(TRAINING_FREQUENCY_TOKENS, daysPerWeekText)
    ? Number(daysPerWeekText)
    : null
  if (daysPerWeek === null) {
    fieldErrors.daysPerWeek = 'Selecciona entre 2 y 6 días por semana.'
  }

  const sessionDurationText = getText(formData, 'sessionDurationMinutes')
  const sessionDurationMinutes = includes(SESSION_DURATION_TOKENS, sessionDurationText)
    ? Number(sessionDurationText)
    : null
  if (sessionDurationMinutes === null) {
    fieldErrors.sessionDurationMinutes = 'Selecciona una duración de sesión válida.'
  }

  const gymType = getText(formData, 'gymType')
  if (!includes(values(GYM_TYPES), gymType)) fieldErrors.gymType = 'Selecciona un lugar de entrenamiento válido.'

  const rawPreferredWorkoutDays = getTexts(formData, 'preferredWorkoutDays')
  const hasValidWorkoutDayTokens = rawPreferredWorkoutDays !== null &&
    rawPreferredWorkoutDays.every(day => includes(WEEK_DAY_TOKENS, day))
  const preferredWorkoutDays = !hasValidWorkoutDayTokens
    ? []
    : Array.from(new Set(rawPreferredWorkoutDays.map(day => Number(day)))).sort((a, b) => a - b)
  if (
    !hasValidWorkoutDayTokens ||
    preferredWorkoutDays.length !== daysPerWeek
  ) {
    fieldErrors.preferredWorkoutDays = 'Selecciona días únicos que coincidan con tu frecuencia semanal.'
  }

  const rawEquipment = getTexts(formData, 'availableEquipment')
  const availableEquipment = rawEquipment === null ? [] : rawEquipment
  if (rawEquipment === null || availableEquipment.some(item => !includes(values(EQUIPMENT_OPTIONS), item))) {
    fieldErrors.availableEquipment = 'Selecciona equipo válido.'
  }

  const injuries = getText(formData, 'injuries')
  if (injuries === null || injuries.length > 1000) fieldErrors.injuries = 'Describe tus lesiones en un máximo de 1000 caracteres.'

  if (Object.keys(fieldErrors).length > 0) {
    return { ok: false, fieldErrors, formError: 'Revisa los campos indicados.' }
  }

  return {
    ok: true,
    value: {
      primaryGoal: primaryGoal as TrainingSettingsValue['primaryGoal'],
      fitnessLevel: fitnessLevel as TrainingSettingsValue['fitnessLevel'],
      daysPerWeek: daysPerWeek as TrainingSettingsValue['daysPerWeek'],
      sessionDurationMinutes: sessionDurationMinutes as TrainingSettingsValue['sessionDurationMinutes'],
      gymType: gymType as TrainingSettingsValue['gymType'],
      preferredWorkoutDays,
      availableEquipment: (gymType === 'home_no_equipment' ? [] : availableEquipment) as TrainingSettingsValue['availableEquipment'],
      injuries: injuries || null,
    },
  }
}
