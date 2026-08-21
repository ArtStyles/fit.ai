export type TrainerApplicationOption = {
  value: string
  label: string
}

export const TRAINER_SPECIALTY_OPTIONS: readonly TrainerApplicationOption[] = [
  { value: 'Fuerza', label: 'Fuerza' },
  { value: 'Hipertrofia', label: 'Hipertrofia' },
  { value: 'Pérdida de grasa', label: 'Pérdida de grasa' },
  { value: 'Resistencia', label: 'Resistencia' },
  { value: 'Movilidad', label: 'Movilidad' },
  { value: 'Calistenia', label: 'Calistenia' },
  { value: 'Entrenamiento funcional', label: 'Entrenamiento funcional' },
  { value: 'Principiantes', label: 'Principiantes' },
  { value: 'Adultos mayores', label: 'Adultos mayores' },
  { value: 'Rendimiento deportivo', label: 'Rendimiento deportivo' },
]

export const TRAINER_LANGUAGE_OPTIONS: readonly TrainerApplicationOption[] = [
  { value: 'Español', label: 'Español' },
  { value: 'Inglés', label: 'Inglés' },
  { value: 'Francés', label: 'Francés' },
  { value: 'Portugués', label: 'Portugués' },
  { value: 'Alemán', label: 'Alemán' },
  { value: 'Italiano', label: 'Italiano' },
]

const TRAINER_TIMEZONE_VALUES = [
  'UTC',
  'Pacific/Honolulu',
  'America/Anchorage',
  'America/Los_Angeles',
  'America/Denver',
  'America/Chicago',
  'America/New_York',
  'America/Toronto',
  'America/Havana',
  'America/Mexico_City',
  'America/Panama',
  'America/Bogota',
  'America/Lima',
  'America/Caracas',
  'America/Santo_Domingo',
  'America/Puerto_Rico',
  'America/Santiago',
  'America/Argentina/Buenos_Aires',
  'America/Sao_Paulo',
  'Atlantic/Azores',
  'Europe/London',
  'Europe/Madrid',
  'Europe/Paris',
  'Europe/Berlin',
  'Africa/Casablanca',
  'Africa/Lagos',
  'Africa/Johannesburg',
  'Asia/Dubai',
  'Asia/Kolkata',
  'Asia/Bangkok',
  'Asia/Shanghai',
  'Asia/Tokyo',
  'Australia/Sydney',
  'Pacific/Auckland',
  'Pacific/Chatham',
] as const

const TIMEZONE_REGION_LABELS: Record<string, string> = {
  Africa: 'África',
  America: 'América',
  Asia: 'Asia',
  Atlantic: 'Atlántico',
  Australia: 'Australia',
  Europe: 'Europa',
  Pacific: 'Pacífico',
}

function timezoneLabel(value: string): string {
  if (value === 'UTC') return 'UTC'
  const [region, ...locationParts] = value.split('/')
  const location = locationParts.reverse().join(' / ').replaceAll('_', ' ')
  const regionLabel = TIMEZONE_REGION_LABELS[region] ?? region
  return location ? `${location} — ${regionLabel}` : value
}

export function optionsWithCurrentValues(
  options: readonly TrainerApplicationOption[],
  currentValues: readonly string[],
): TrainerApplicationOption[] {
  const merged = [...options]
  const known = new Set(options.map(option => option.value))
  for (const value of currentValues) {
    const normalized = value.trim()
    if (!normalized || known.has(normalized)) continue
    known.add(normalized)
    merged.push({ value: normalized, label: `${normalized} (guardado)` })
  }
  return merged
}

export function trainerTimezoneOptions(currentTimezone: string): TrainerApplicationOption[] {
  return optionsWithCurrentValues(
    TRAINER_TIMEZONE_VALUES.map(value => ({ value, label: timezoneLabel(value) })),
    [currentTimezone],
  )
}
