import { buildMonthGrid } from '@/lib/calendar/aggregate'
import { addCivilDays, civilWeekday, isCivilDate } from '@/lib/workouts/occurrences'

export function datePickerCells(date: string, max: string) {
  const [year, month] = date.split('-').map(Number)
  return buildMonthGrid(year, month, max)
}

export function shiftDateMonth(date: string, months: number): string {
  const value = new Date(`${date}T12:00:00Z`)
  const originalDay = value.getUTCDate()
  value.setUTCDate(1)
  value.setUTCMonth(value.getUTCMonth() + months)
  const last = new Date(value)
  last.setUTCMonth(last.getUTCMonth() + 1)
  last.setUTCDate(0)
  value.setUTCDate(Math.min(originalDay, last.getUTCDate()))
  const result = value.toISOString().slice(0, 10)
  return isCivilDate(result) ? result : date
}

export function moveDateFocus(date: string, key: string, max: string, shift = false): string | null {
  let next: string
  switch (key) {
    case 'ArrowLeft': next = addCivilDays(date, -1); break
    case 'ArrowRight': next = addCivilDays(date, 1); break
    case 'ArrowUp': next = addCivilDays(date, -7); break
    case 'ArrowDown': next = addCivilDays(date, 7); break
    case 'Home': next = addCivilDays(date, 1 - civilWeekday(date)); break
    case 'End': next = addCivilDays(date, 7 - civilWeekday(date)); break
    case 'PageUp': next = shiftDateMonth(date, shift ? -12 : -1); break
    case 'PageDown': next = shiftDateMonth(date, shift ? 12 : 1); break
    default: return null
  }
  return next > max ? max : next
}
