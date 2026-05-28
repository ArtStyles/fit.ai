const DEFAULT_APP_TIME_ZONE = 'America/Havana'

export const WORKOUT_ACCESS_POLICY = {
  missedWorkoutRecoveryDays: 0,
  advanceStartDays: 0,
} as const

type ZonedDateParts = {
  year: number
  month: number
  day: number
  hour: number
  minute: number
  second: number
}

function env(name: string): string | undefined {
  if (typeof process === 'undefined') return undefined
  return process.env[name]
}

export function getAppTimeZone(): string {
  const configured = env('NEXT_PUBLIC_APP_TIME_ZONE') ?? env('APP_TIME_ZONE')

  if (!configured) return DEFAULT_APP_TIME_ZONE

  try {
    new Intl.DateTimeFormat('en-US', { timeZone: configured }).format(new Date())
    return configured
  } catch {
    return DEFAULT_APP_TIME_ZONE
  }
}

function getZonedParts(date: Date, timeZone = getAppTimeZone()): ZonedDateParts {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date)

  const values = Object.fromEntries(parts.map(part => [part.type, part.value]))

  return {
    year: Number(values.year),
    month: Number(values.month),
    day: Number(values.day),
    hour: Number(values.hour),
    minute: Number(values.minute),
    second: Number(values.second),
  }
}

function addCalendarDays(
  parts: Pick<ZonedDateParts, 'year' | 'month' | 'day'>,
  days: number,
): Pick<ZonedDateParts, 'year' | 'month' | 'day'> {
  const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + days))

  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
  }
}

function getTimeZoneOffsetMs(date: Date, timeZone = getAppTimeZone()): number {
  const parts = getZonedParts(date, timeZone)
  const zonedAsUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  )

  return zonedAsUtc - date.getTime()
}

function zonedDateTimeToUtc(
  parts: ZonedDateParts,
  timeZone = getAppTimeZone(),
  milliseconds = 0,
): Date {
  const utcGuess = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
    milliseconds,
  )
  const firstPass = utcGuess - getTimeZoneOffsetMs(new Date(utcGuess), timeZone)
  const secondPass = utcGuess - getTimeZoneOffsetMs(new Date(firstPass), timeZone)

  return new Date(secondPass)
}

export function getIsoWeekday(date = new Date(), timeZone = getAppTimeZone()): number {
  const weekday = new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'short',
  }).format(date)

  return { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 }[weekday] ?? 1
}

export function getLocalDateString(date = new Date(), timeZone = getAppTimeZone()): string {
  const parts = getZonedParts(date, timeZone)
  const month = String(parts.month).padStart(2, '0')
  const day = String(parts.day).padStart(2, '0')

  return `${parts.year}-${month}-${day}`
}

export function getWeekMonday(date = new Date(), timeZone = getAppTimeZone()): Date {
  const parts = getZonedParts(date, timeZone)
  const monday = addCalendarDays(parts, -(getIsoWeekday(date, timeZone) - 1))

  return zonedDateTimeToUtc(
    { ...monday, hour: 0, minute: 0, second: 0 },
    timeZone,
  )
}

export function addDays(date: Date, days: number, timeZone = getAppTimeZone()): Date {
  const parts = getZonedParts(date, timeZone)
  const nextDate = addCalendarDays(parts, days)

  return zonedDateTimeToUtc(
    {
      ...nextDate,
      hour: parts.hour,
      minute: parts.minute,
      second: parts.second,
    },
    timeZone,
    date.getMilliseconds(),
  )
}

export function getLocalDayBounds(
  date = new Date(),
  timeZone = getAppTimeZone(),
): { start: Date; end: Date } {
  const parts = getZonedParts(date, timeZone)
  const nextDate = addCalendarDays(parts, 1)

  return {
    start: zonedDateTimeToUtc({ ...parts, hour: 0, minute: 0, second: 0 }, timeZone),
    end: zonedDateTimeToUtc({ ...nextDate, hour: 0, minute: 0, second: 0 }, timeZone),
  }
}

export function canStartWorkoutToday(
  workoutIsoDay: number | null,
  date = new Date(),
  timeZone = getAppTimeZone(),
): boolean {
  return workoutIsoDay === getIsoWeekday(date, timeZone)
}
