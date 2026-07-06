import { dateLocale, translate, type AppLanguage } from '@/lib/i18n'
import { getLocalDateString } from '@/lib/workouts/schedule'

function calendarDayNumber(date: Date, timeZone: string): number {
  const [year, month, day] = getLocalDateString(date, timeZone).split('-').map(Number)
  return Date.UTC(year, month - 1, day) / (24 * 60 * 60 * 1000)
}

export function formatDashboardRelativeDate(
  value: string | null,
  language: AppLanguage,
  timeZone: string,
  referenceInstant: string,
): string {
  if (!value) return translate(language, 'Fecha no disponible')
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return translate(language, 'Fecha no disponible')
  const reference = new Date(referenceInstant)

  if (Number.isFinite(reference.getTime())) {
    const difference = calendarDayNumber(reference, timeZone) - calendarDayNumber(date, timeZone)
    if (difference === 0) return translate(language, 'Hoy')
    if (difference === 1) return translate(language, 'Ayer')
  }

  return new Intl.DateTimeFormat(dateLocale(language), {
    day: 'numeric',
    month: 'short',
    timeZone,
  }).format(date)
}

export function formatDashboardDuration(
  value: number | null,
  language: AppLanguage,
): string | null {
  if (!value || !Number.isFinite(value) || value <= 0) return null
  return translate(language, '{minutes} min', { minutes: Math.round(value) })
}

export function formatDashboardLoad(value: number, language: AppLanguage): string {
  if (!Number.isFinite(value) || value < 0) return translate(language, 'Sin carga')
  if (value === 0) return translate(language, 'Peso corporal')
  const weight = new Intl.NumberFormat(dateLocale(language), { maximumFractionDigits: 1 }).format(value)
  return translate(language, '{weight} kg', { weight })
}

export function formatDashboardReps(value: number, language: AppLanguage): string | null {
  if (!Number.isFinite(value) || value <= 0) return null
  const count = Math.round(value)
  return translate(language, count === 1 ? '{count} repetición' : '{count} repeticiones', { count })
}
