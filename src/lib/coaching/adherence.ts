/**
 * Pure, client-time-zone-aware adherence helpers. Version windows are treated
 * as [effectiveFrom, effectiveTo): the start is inclusive and the end is
 * exclusive. An occurrence belongs to the version active at the start of its
 * local calendar day, which makes a mid-day revision deterministic.
 */

export type InstantInput = Date | string

export type AssignmentVersionWindow = {
  id: string
  effectiveFrom: InstantInput
  effectiveTo: InstantInput | null
}

export type PrescribedWorkout = {
  id: string
  assignmentVersionId: string
  isoWeekday: number
}

export type PrescribedOccurrence = {
  id: string
  assignmentVersionId: string
  workoutId: string
  /** YYYY-MM-DD in the client's IANA time zone. */
  scheduledDate: string
  /** The final local calendar date on which this occurrence may be recovered. */
  graceEndsOn: string
}

export type TrainerSessionEvidence = {
  id: string
  assignmentVersionId: string | null
  workoutId: string
  completedAt: InstantInput
  source: 'professional' | 'personal'
  averageRpe?: number | null
  /** Set false for an explicitly identified professional extra. */
  prescribed?: boolean
}

export type TrainerAdherence = {
  prescribed: number
  completed: number
  missed: number
  pending: number
  adherencePercent: number
}

export type ClosedTrainerAdherence = Omit<TrainerAdherence, 'pending'>

export type OperationalAlert = {
  code: 'no_recent_prescribed_activity' | 'low_adherence' | 'repeated_high_rpe'
  message: string
}

type DateParts = { year: number; month: number; day: number; hour: number; minute: number; second: number }

const RECOVERY_DAYS = 2
const DAY_MS = 24 * 60 * 60 * 1000

function validTimeZone(timeZone: string): string {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone }).format()
    return timeZone
  } catch {
    throw new RangeError('INVALID_TIME_ZONE')
  }
}

function asDate(value: InstantInput): Date | null {
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

function partsAt(date: Date, timeZone: string): DateParts {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date)
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]))
  return {
    year: Number(values.year), month: Number(values.month), day: Number(values.day),
    hour: Number(values.hour), minute: Number(values.minute), second: Number(values.second),
  }
}

function localDateAt(value: InstantInput, timeZone: string): string | null {
  const date = asDate(value)
  if (!date) return null
  const parts = partsAt(date, timeZone)
  return `${parts.year.toString().padStart(4, '0')}-${parts.month.toString().padStart(2, '0')}-${parts.day.toString().padStart(2, '0')}`
}

function dateOnlyParts(value: string): Pick<DateParts, 'year' | 'month' | 'day'> | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return null
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const probe = new Date(Date.UTC(year, month - 1, day))
  if (probe.getUTCFullYear() !== year || probe.getUTCMonth() !== month - 1 || probe.getUTCDate() !== day) return null
  return { year, month, day }
}

function addCalendarDays(date: string, days: number): string {
  const parts = dateOnlyParts(date)
  if (!parts) return date
  const next = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + days))
  return `${next.getUTCFullYear().toString().padStart(4, '0')}-${String(next.getUTCMonth() + 1).padStart(2, '0')}-${String(next.getUTCDate()).padStart(2, '0')}`
}

function isoWeekday(date: string): number {
  const parts = dateOnlyParts(date)
  if (!parts) return 0
  const weekday = new Date(Date.UTC(parts.year, parts.month - 1, parts.day)).getUTCDay()
  return weekday === 0 ? 7 : weekday
}

function offsetMilliseconds(date: Date, timeZone: string): number {
  const parts = partsAt(date, timeZone)
  return Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second) - date.getTime()
}

export function localCalendarDayStart(date: string, timeZone: string): Date | null {
  const parts = dateOnlyParts(date)
  if (!parts) return null
  const guess = Date.UTC(parts.year, parts.month - 1, parts.day)
  const first = new Date(guess - offsetMilliseconds(new Date(guess), timeZone))
  return new Date(guess - offsetMilliseconds(first, timeZone))
}

function instantForWindow(value: InstantInput, timeZone: string): Date | null {
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return localCalendarDayStart(value, timeZone)
  return asDate(value)
}

function versionForLocalDay(
  localDate: string,
  versions: readonly AssignmentVersionWindow[],
  timeZone: string,
): AssignmentVersionWindow | null {
  const dayStart = localCalendarDayStart(localDate, timeZone)
  if (!dayStart) return null
  const candidates = versions.filter(version => {
    const from = instantForWindow(version.effectiveFrom, timeZone)
    const until = version.effectiveTo === null ? null : instantForWindow(version.effectiveTo, timeZone)
    return from !== null && from <= dayStart && (until === null || dayStart < until)
  })

  return candidates.sort((left, right) => {
    const leftFrom = instantForWindow(left.effectiveFrom, timeZone)?.getTime() ?? 0
    const rightFrom = instantForWindow(right.effectiveFrom, timeZone)?.getTime() ?? 0
    return rightFrom - leftFrom || left.id.localeCompare(right.id)
  })[0] ?? null
}

export function buildPrescribedOccurrences(input: {
  versions: readonly AssignmentVersionWindow[]
  workouts: readonly PrescribedWorkout[]
  timeZone: string
  rangeStart: InstantInput
  rangeEnd: InstantInput
  now: InstantInput
  relationshipEndedAt?: InstantInput | null
}): PrescribedOccurrence[] {
  const timeZone = validTimeZone(input.timeZone)
  const rangeStart = localDateAt(input.rangeStart, timeZone)
  const rangeEnd = localDateAt(input.rangeEnd, timeZone)
  const today = localDateAt(input.now, timeZone)
  const relationshipEndedAt = input.relationshipEndedAt === undefined || input.relationshipEndedAt === null
    ? null
    : asDate(input.relationshipEndedAt)
  if (!rangeStart || !rangeEnd || !today || rangeStart > rangeEnd) return []

  const lastDate = [rangeEnd, today].sort()[0]
  const occurrences: PrescribedOccurrence[] = []
  for (let date = rangeStart; date <= lastDate; date = addCalendarDays(date, 1)) {
    const dayStart = localCalendarDayStart(date, timeZone)
    if (!dayStart || (relationshipEndedAt !== null && dayStart >= relationshipEndedAt)) continue
    const version = versionForLocalDay(date, input.versions, timeZone)
    if (!version) continue
    for (const workout of input.workouts) {
      if (workout.assignmentVersionId !== version.id || workout.isoWeekday !== isoWeekday(date)) continue
      occurrences.push({
        id: `${version.id}:${workout.id}:${date}`,
        assignmentVersionId: version.id,
        workoutId: workout.id,
        scheduledDate: date,
        graceEndsOn: addCalendarDays(date, RECOVERY_DAYS),
      })
    }
  }

  return occurrences.sort((left, right) =>
    left.scheduledDate.localeCompare(right.scheduledDate)
    || left.assignmentVersionId.localeCompare(right.assignmentVersionId)
    || left.workoutId.localeCompare(right.workoutId),
  )
}

function adherencePercent(completed: number, missed: number): number {
  const closed = completed + missed
  return closed === 0 ? 0 : Math.round((completed / closed) * 100)
}

function isClosedSummary(input: unknown): input is { prescribed: number; completed: number } {
  return typeof input === 'object' && input !== null && 'prescribed' in input && 'completed' in input && !('occurrences' in input)
}

/** Canonically assigns at most one professional session to each occurrence. */
export function matchTrainerSessionsToOccurrences(input: {
  occurrences: readonly PrescribedOccurrence[]
  sessions: readonly TrainerSessionEvidence[]
  timeZone: string
  now: InstantInput
}): ReadonlyMap<string, string> {
  const timeZone = validTimeZone(input.timeZone)
  const now = asDate(input.now)
  const matches = new Map<string, string>()
  if (!now) return matches
  const claimedOccurrenceIds = new Set<string>()
  const orderedOccurrences = [...input.occurrences].sort((left, right) =>
    left.scheduledDate.localeCompare(right.scheduledDate)
    || left.graceEndsOn.localeCompare(right.graceEndsOn)
    || left.id.localeCompare(right.id),
  )
  const orderedSessions = [...input.sessions].sort((left, right) => {
    const leftAt = asDate(left.completedAt)?.getTime() ?? Number.POSITIVE_INFINITY
    const rightAt = asDate(right.completedAt)?.getTime() ?? Number.POSITIVE_INFINITY
    return leftAt - rightAt || left.id.localeCompare(right.id)
  })

  for (const session of orderedSessions) {
    if (session.source !== 'professional' || session.prescribed === false || !session.assignmentVersionId) continue
    const completedAt = asDate(session.completedAt)
    if (!completedAt || completedAt > now) continue
    const completedDate = localDateAt(session.completedAt, timeZone)
    if (!completedDate) continue
    const occurrence = orderedOccurrences.find(candidate =>
      !claimedOccurrenceIds.has(candidate.id)
      && candidate.assignmentVersionId === session.assignmentVersionId
      && candidate.workoutId === session.workoutId
      && candidate.scheduledDate <= completedDate
      && completedDate <= candidate.graceEndsOn,
    )
    if (!occurrence) continue
    claimedOccurrenceIds.add(occurrence.id)
    matches.set(session.id, occurrence.id)
  }

  return matches
}

export function calculateTrainerAdherence(input: { prescribed: number; completed: number }): ClosedTrainerAdherence
export function calculateTrainerAdherence(input: {
  occurrences: readonly PrescribedOccurrence[]
  sessions: readonly TrainerSessionEvidence[]
  timeZone: string
  now: InstantInput
}): TrainerAdherence
export function calculateTrainerAdherence(input: {
  prescribed: number
  completed: number
} | {
  occurrences: readonly PrescribedOccurrence[]
  sessions: readonly TrainerSessionEvidence[]
  timeZone: string
  now: InstantInput
}): ClosedTrainerAdherence | TrainerAdherence {
  if (isClosedSummary(input)) {
    const prescribed = Math.max(0, Math.floor(input.prescribed))
    const completed = Math.min(prescribed, Math.max(0, Math.floor(input.completed)))
    const missed = prescribed - completed
    return { prescribed, completed, missed, adherencePercent: adherencePercent(completed, missed) }
  }

  const timeZone = validTimeZone(input.timeZone)
  const nowDate = localDateAt(input.now, timeZone)
  if (!nowDate) return { prescribed: input.occurrences.length, completed: 0, missed: 0, pending: input.occurrences.length, adherencePercent: 0 }
  const now = asDate(input.now)
  if (!now) return { prescribed: input.occurrences.length, completed: 0, missed: 0, pending: input.occurrences.length, adherencePercent: 0 }
  const claimedOccurrenceIds = new Set(matchTrainerSessionsToOccurrences(input).values())

  let completed = 0
  let missed = 0
  let pending = 0
  for (const occurrence of input.occurrences) {
    if (claimedOccurrenceIds.has(occurrence.id)) completed += 1
    else if (nowDate > occurrence.graceEndsOn) missed += 1
    else pending += 1
  }
  return {
    prescribed: input.occurrences.length,
    completed,
    missed,
    pending,
    adherencePercent: adherencePercent(completed, missed),
  }
}

export function deriveOperationalAlerts(input: {
  adherence: TrainerAdherence
  sessions: readonly TrainerSessionEvidence[]
  timeZone: string
  now: InstantInput
  relationshipStartedAt?: InstantInput | null
}): OperationalAlert[] {
  const timeZone = validTimeZone(input.timeZone)
  const now = asDate(input.now)
  if (!now) return []
  const prescribedSessions = input.sessions
    .filter(session => {
      const completedAt = asDate(session.completedAt)
      return session.source === 'professional'
        && session.prescribed !== false
        && completedAt !== null
        && completedAt <= now
    })
    .sort((left, right) => (asDate(left.completedAt)?.getTime() ?? 0) - (asDate(right.completedAt)?.getTime() ?? 0) || left.id.localeCompare(right.id))
  const alerts: OperationalAlert[] = []
  const latest = prescribedSessions.at(-1)
  const latestDate = latest ? localDateAt(latest.completedAt, timeZone) : null
  const nowDate = localDateAt(now, timeZone)
  const startedDate = input.relationshipStartedAt ? localDateAt(input.relationshipStartedAt, timeZone) : null
  const daysSinceLatest = latestDate && nowDate
    ? Math.round((Date.parse(`${nowDate}T00:00:00.000Z`) - Date.parse(`${latestDate}T00:00:00.000Z`)) / DAY_MS)
    : null
  const noActivityForSevenDays = (daysSinceLatest !== null && daysSinceLatest >= 7)
    || (!latestDate && startedDate !== null && nowDate !== null
      && Math.round((Date.parse(`${nowDate}T00:00:00.000Z`) - Date.parse(`${startedDate}T00:00:00.000Z`)) / DAY_MS) >= 7)
  if (noActivityForSevenDays) {
    alerts.push({ code: 'no_recent_prescribed_activity', message: 'No hay actividad prescrita registrada en los últimos 7 días.' })
  }
  if (input.adherence.completed + input.adherence.missed >= 2 && input.adherence.adherencePercent < 50) {
    alerts.push({ code: 'low_adherence', message: 'La adherencia reciente está por debajo del 50%.' })
  }
  let previousHigh = false
  for (const session of prescribedSessions) {
    const high = typeof session.averageRpe === 'number' && Number.isFinite(session.averageRpe) && session.averageRpe >= 9
    if (high && previousHigh) {
      alerts.push({ code: 'repeated_high_rpe', message: 'Dos sesiones consecutivas registran un RPE medio alto.' })
      break
    }
    previousHigh = high
  }
  return alerts
}
