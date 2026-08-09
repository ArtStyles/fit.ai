import {
  buildPrescribedOccurrences,
  calculateTrainerAdherence,
  deriveOperationalAlerts,
  localCalendarDayStart,
  type OperationalAlert,
  type TrainerAdherence,
  type TrainerSessionEvidence,
} from './adherence'

type UnknownRecord = Record<string, unknown>

export type CoachClientSummary = {
  clientId: string
  fullName: string | null
  avatarUrl: string | null
  timeZone: string
  status: 'active'
  lastPrescribedSessionAt: string | null
  adherence: TrainerAdherence
  alerts: OperationalAlert[]
}

export type CoachClientsSummary = {
  counts: {
    pendingRequests: number
    activeClients: number
    pausedRelationships: number
  }
  clients: CoachClientSummary[]
}

const UNAVAILABLE = 'COACH_CLIENT_INSIGHTS_UNAVAILABLE'

function unavailable(): never {
  throw new Error(UNAVAILABLE)
}

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function requiredString(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) unavailable()
  return value
}

function nullableString(value: unknown): string | null {
  if (value === null || value === undefined) return null
  return requiredString(value)
}

function nonNegativeInteger(value: unknown): number {
  if (!Number.isInteger(value) || (value as number) < 0) unavailable()
  return value as number
}

function finiteNumberOrNull(value: unknown): number | null {
  if (value === null || value === undefined) return null
  if (typeof value !== 'number' || !Number.isFinite(value)) unavailable()
  return value
}

function dateString(value: unknown): string {
  const text = requiredString(value)
  if (Number.isNaN(new Date(text).getTime())) unavailable()
  return text
}

function dateOrNull(value: unknown): string | null {
  if (value === null || value === undefined) return null
  return dateString(value)
}

function parseCounts(value: unknown): CoachClientsSummary['counts'] {
  if (!isRecord(value)) unavailable()
  return {
    pendingRequests: nonNegativeInteger(value.pendingRequests),
    activeClients: nonNegativeInteger(value.activeClients),
    pausedRelationships: nonNegativeInteger(value.pausedRelationships),
  }
}

function parseAdherenceInput(value: unknown) {
  if (!isRecord(value) || !Array.isArray(value.versions) || !Array.isArray(value.sessions) || !Array.isArray(value.alertSessions)) unavailable()
  const versions = value.versions.map(version => {
    if (!isRecord(version) || !Array.isArray(version.workouts)) unavailable()
    return {
      id: requiredString(version.id),
      effectiveFrom: dateString(version.effectiveFrom),
      effectiveTo: dateOrNull(version.effectiveTo),
      workouts: version.workouts.map(workout => {
        if (!isRecord(workout)) unavailable()
        const isoDay = nonNegativeInteger(workout.isoDay)
        if (isoDay < 1 || isoDay > 7) unavailable()
        return { id: requiredString(workout.id), isoWeekday: isoDay }
      }),
    }
  })
  const parseSessions = (rows: unknown[]): TrainerSessionEvidence[] => rows.map(session => {
    if (!isRecord(session)) unavailable()
    return {
      id: requiredString(session.id),
      assignmentVersionId: nullableString(session.assignmentVersionId),
      workoutId: requiredString(session.workoutId),
      completedAt: dateString(session.completedAt),
      source: 'professional',
      prescribed: true,
      averageRpe: finiteNumberOrNull(session.averageRpe),
    }
  })
  const sessions = parseSessions(value.sessions)
  const alertSessions = parseSessions(value.alertSessions)
  return {
    rangeStart: dateString(value.rangeStart),
    rangeEnd: dateString(value.rangeEnd),
    versions,
    sessions,
    alertSessions,
  }
}

function parseClient(value: unknown, now: string): CoachClientSummary {
  if (!isRecord(value) || !isRecord(value.client)) unavailable()
  const client = value.client
  const clientId = requiredString(client.id)
  const timeZone = requiredString(client.timezone)
  const startedAt = dateString(value.startedAt)
  const adherenceInput = parseAdherenceInput(value.adherenceInput)
  const workouts = adherenceInput.versions.flatMap(version => version.workouts.map(workout => ({
    ...workout,
    assignmentVersionId: version.id,
  })))
  const occurrences = buildPrescribedOccurrences({
    versions: adherenceInput.versions,
    workouts,
    timeZone,
    rangeStart: adherenceInput.rangeStart,
    rangeEnd: adherenceInput.rangeEnd,
    now,
  })
  const adherence = calculateTrainerAdherence({
    occurrences,
    sessions: adherenceInput.sessions,
    timeZone,
    now,
  })
  return {
    clientId,
    fullName: nullableString(client.fullName),
    avatarUrl: nullableString(client.avatarUrl),
    timeZone,
    status: 'active',
    lastPrescribedSessionAt: dateOrNull(value.lastPrescribedSessionAt),
    adherence,
    alerts: deriveOperationalAlerts({
      adherence,
      sessions: adherenceInput.alertSessions,
      timeZone,
      now,
      relationshipStartedAt: startedAt,
    }),
  }
}

/** Converts the intentionally minimal, versioned summary RPC into UI-safe data. */
export function adaptCoachClientsSummary(payload: unknown, now: Date | string = new Date()): CoachClientsSummary {
  if (!isRecord(payload) || payload.schemaVersion !== 1 || !Array.isArray(payload.clients)) unavailable()
  const nowValue = now instanceof Date ? now.toISOString() : dateString(now)
  const counts = parseCounts(payload.counts)
  const clients = payload.clients.map(row => parseClient(row, nowValue))
  if (counts.activeClients !== clients.length) unavailable()

  return {
    counts,
    clients: clients.sort((left, right) =>
      right.alerts.length - left.alerts.length
      || (right.lastPrescribedSessionAt ?? '').localeCompare(left.lastPrescribedSessionAt ?? '')
      || left.clientId.localeCompare(right.clientId),
    ),
  }
}

/** Calls only the summary RPC; callers intentionally get a generic failure. */
export async function getCoachClientsSummary(
  supabase: { rpc: (name: string, args?: Record<string, never>) => PromiseLike<{ data: unknown; error: unknown }> },
): Promise<CoachClientsSummary> {
  try {
    const { data, error } = await supabase.rpc('get_coach_clients_summary')
    if (error) unavailable()
    return adaptCoachClientsSummary(data)
  } catch {
    unavailable()
  }
}

export type CoachOccurrenceStatus = 'completed' | 'missed' | 'pending'
export type CoachEvidenceStatus = 'completed' | 'incomplete'

export type CoachClientInsightOccurrence = {
  id: string
  scheduledDate: string
  workoutName: string
  status: CoachOccurrenceStatus
}

export type CoachClientExerciseEvidence = {
  id: string
  name: string
  setsCompleted: number | null
  repsCompleted: number[] | null
  weightsKg: number[] | null
  rpeValues: number[] | null
  durationSeconds: number | null
  notes: string | null
}

export type CoachClientSessionEvidence = {
  id: string
  completedAt: string
  workoutName: string
  durationMinutes: number | null
  notes: string | null
  status: CoachEvidenceStatus
  exerciseResults: CoachClientExerciseEvidence[]
}

export type CoachClientInsights = {
  client: Pick<CoachClientSummary, 'clientId' | 'fullName' | 'avatarUrl' | 'timeZone'>
  relationshipStartedAt: string
  adherence: TrainerAdherence
  occurrences: CoachClientInsightOccurrence[]
  alerts: OperationalAlert[]
  sessions: CoachClientSessionEvidence[]
}

function nullableText(value: unknown): string | null {
  if (value === null || value === undefined) return null
  if (typeof value !== 'string') unavailable()
  return value
}

function nullableNonNegativeInteger(value: unknown): number | null {
  if (value === null || value === undefined) return null
  return nonNegativeInteger(value)
}

function nullableFiniteNumberArray(value: unknown): number[] | null {
  if (value === null || value === undefined) return null
  if (!Array.isArray(value) || value.some(item => typeof item !== 'number' || !Number.isFinite(item))) unavailable()
  return value
}

function localDate(value: string, timeZone: string): string {
  try {
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) unavailable()
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date)
    const fields = Object.fromEntries(parts.map(part => [part.type, part.value]))
    if (!fields.year || !fields.month || !fields.day) unavailable()
    return `${fields.year}-${fields.month}-${fields.day}`
  } catch {
    unavailable()
  }
}

function shiftDate(date: string, days: number): string {
  const parsed = /^([0-9]{4})-([0-9]{2})-([0-9]{2})$/.exec(date)
  if (!parsed) unavailable()
  const next = new Date(Date.UTC(Number(parsed[1]), Number(parsed[2]) - 1, Number(parsed[3]) + days))
  return `${next.getUTCFullYear().toString().padStart(4, '0')}-${String(next.getUTCMonth() + 1).padStart(2, '0')}-${String(next.getUTCDate()).padStart(2, '0')}`
}

function parsedDetailRange(input: { timeZone: string; now: string; weeks?: 4 | 12; rangeStart?: string; rangeEnd?: string }) {
  const now = dateString(input.now)
  const rangeEnd = input.rangeEnd ?? localDate(now, input.timeZone)
  const rangeStart = input.rangeStart ?? shiftDate(rangeEnd, -((input.weeks ?? 4) * 7 - 1))
  if (!/^\d{4}-\d{2}-\d{2}$/.test(rangeStart) || !/^\d{4}-\d{2}-\d{2}$/.test(rangeEnd) || rangeStart > rangeEnd) unavailable()
  return { now, rangeStart, rangeEnd }
}

function parseDetailPayload(value: unknown) {
  if (!isRecord(value) || value.schemaVersion !== 1 || !isRecord(value.client) || !isRecord(value.relationship)
    || !Array.isArray(value.versions) || !Array.isArray(value.prescribedWorkouts) || !Array.isArray(value.sessions)) unavailable()
  const client = {
    clientId: requiredString(value.client.id),
    fullName: nullableText(value.client.fullName),
    avatarUrl: nullableText(value.client.avatarUrl),
    timeZone: requiredString(value.client.timezone),
  }
  const relationshipStartedAt = dateString(value.relationship.startedAt)
  const versions = value.versions.map(version => {
    if (!isRecord(version)) unavailable()
    return { id: requiredString(version.id), effectiveFrom: dateString(version.effectiveFrom), effectiveTo: dateOrNull(version.effectiveTo) }
  })
  const prescribedWorkouts = value.prescribedWorkouts.map(workout => {
    if (!isRecord(workout)) unavailable()
    const isoWeekday = nonNegativeInteger(workout.dayOfWeek)
    if (isoWeekday < 1 || isoWeekday > 7) unavailable()
    return { id: requiredString(workout.id), assignmentVersionId: requiredString(workout.assignmentVersionId), name: requiredString(workout.name), isoWeekday }
  })
  const sessions = value.sessions.map(session => {
    if (!isRecord(session) || !isRecord(session.workout) || !Array.isArray(session.exerciseResults)) unavailable()
    const exerciseResults = session.exerciseResults.map(result => {
      if (!isRecord(result)) unavailable()
      return {
        id: requiredString(result.exerciseId), name: requiredString(result.name), setsCompleted: nullableNonNegativeInteger(result.setsCompleted),
        repsCompleted: nullableFiniteNumberArray(result.repsCompleted), weightsKg: nullableFiniteNumberArray(result.weightsKg),
        rpeValues: nullableFiniteNumberArray(result.rpeValues), durationSeconds: nullableNonNegativeInteger(result.durationSeconds), notes: nullableText(result.notes),
      }
    })
    return {
      id: requiredString(session.id), assignmentVersionId: requiredString(session.assignmentVersionId), completedAt: dateString(session.completedAt),
      durationMinutes: nullableNonNegativeInteger(session.durationMinutes), notes: nullableText(session.notes),
      workoutId: requiredString(session.workout.id), workoutName: requiredString(session.workout.name), exerciseResults,
    }
  })
  return { client, relationshipStartedAt, versions, prescribedWorkouts, sessions }
}

function claimedOccurrenceIds(input: {
  occurrences: ReturnType<typeof buildPrescribedOccurrences>
  sessions: Array<{ id: string; assignmentVersionId: string; workoutId: string; completedAt: string }>
  timeZone: string
  now: string
}) {
  const claimed = new Set<string>()
  const now = new Date(input.now)
  for (const session of [...input.sessions].sort((left, right) => left.completedAt.localeCompare(right.completedAt) || left.id.localeCompare(right.id))) {
    if (new Date(session.completedAt) > now) continue
    const completedDate = localDate(session.completedAt, input.timeZone)
    const occurrence = input.occurrences.find(candidate => !claimed.has(candidate.id)
      && candidate.assignmentVersionId === session.assignmentVersionId && candidate.workoutId === session.workoutId
      && candidate.scheduledDate <= completedDate && completedDate <= candidate.graceEndsOn)
    if (occurrence) claimed.add(occurrence.id)
  }
  return claimed
}

function averageSessionRpe(exerciseResults: readonly CoachClientExerciseEvidence[]): number | null {
  const values = exerciseResults.flatMap(result => result.rpeValues ?? [])
  return values.length === 0 ? null : values.reduce((sum, value) => sum + value, 0) / values.length
}

/** Validates the versioned detail RPC and recalculates adherence in the client's time zone. */
export function adaptCoachClientInsights(
  payload: unknown,
  options: { now?: Date | string; weeks?: 4 | 12; rangeStart?: string; rangeEnd?: string } = {},
): CoachClientInsights {
  const parsed = parseDetailPayload(payload)
  const now = options.now instanceof Date ? options.now.toISOString() : (options.now ?? new Date().toISOString())
  const range = parsedDetailRange({ timeZone: parsed.client.timeZone, now, weeks: options.weeks, rangeStart: options.rangeStart, rangeEnd: options.rangeEnd })
  const rangeStart = localCalendarDayStart(range.rangeStart, parsed.client.timeZone)
  const rangeEnd = localCalendarDayStart(range.rangeEnd, parsed.client.timeZone)
  if (!rangeStart || !rangeEnd) unavailable()
  const occurrences = buildPrescribedOccurrences({
    versions: parsed.versions,
    workouts: parsed.prescribedWorkouts.map(workout => ({ id: workout.id, assignmentVersionId: workout.assignmentVersionId, isoWeekday: workout.isoWeekday })),
    timeZone: parsed.client.timeZone, rangeStart: rangeStart.toISOString(), rangeEnd: rangeEnd.toISOString(), now: range.now,
  })
  const adherenceSessions: TrainerSessionEvidence[] = parsed.sessions.map(session => ({
    id: session.id, assignmentVersionId: session.assignmentVersionId, workoutId: session.workoutId, completedAt: session.completedAt,
    source: 'professional', prescribed: true, averageRpe: averageSessionRpe(session.exerciseResults),
  }))
  const adherence = calculateTrainerAdherence({ occurrences, sessions: adherenceSessions, timeZone: parsed.client.timeZone, now: range.now })
  const claimed = claimedOccurrenceIds({ occurrences, sessions: parsed.sessions, timeZone: parsed.client.timeZone, now: range.now })
  const workoutNames = new Map(parsed.prescribedWorkouts.map(workout => [`${workout.assignmentVersionId}:${workout.id}`, workout.name]))
  const occurrenceDetail = occurrences.map(occurrence => ({
    id: occurrence.id, scheduledDate: occurrence.scheduledDate, workoutName: workoutNames.get(`${occurrence.assignmentVersionId}:${occurrence.workoutId}`) ?? 'Rutina prescrita',
    status: (claimed.has(occurrence.id) ? 'completed' : localDate(range.now, parsed.client.timeZone) > occurrence.graceEndsOn ? 'missed' : 'pending') as CoachOccurrenceStatus,
  }))
  const sessions = parsed.sessions.map(session => ({
    id: session.id, completedAt: session.completedAt, workoutName: session.workoutName, durationMinutes: session.durationMinutes, notes: session.notes,
    status: (session.exerciseResults.length === 0 || session.exerciseResults.some(result => result.setsCompleted === null) ? 'incomplete' : 'completed') as CoachEvidenceStatus,
    exerciseResults: session.exerciseResults,
  }))
  return {
    client: parsed.client, relationshipStartedAt: parsed.relationshipStartedAt, adherence, occurrences: occurrenceDetail,
    alerts: deriveOperationalAlerts({ adherence, sessions: adherenceSessions, timeZone: parsed.client.timeZone, now: range.now, relationshipStartedAt: parsed.relationshipStartedAt }), sessions,
  }
}

/** Calls only the consent-bound detail RPC; every failure is deliberately generic. */
export async function getCoachClientInsights(
  supabase: { rpc: (name: string, args: { p_client_id: string; p_from_date: string; p_to_date: string }) => PromiseLike<{ data: unknown; error: unknown }> },
  input: { clientId: string; fromDate: string; toDate: string; now?: Date | string; weeks?: 4 | 12 },
): Promise<CoachClientInsights> {
  try {
    const { data, error } = await supabase.rpc('get_coach_client_insights', { p_client_id: input.clientId, p_from_date: input.fromDate, p_to_date: input.toDate })
    if (error) unavailable()
    return adaptCoachClientInsights(data, { now: input.now, weeks: input.weeks })
  } catch {
    unavailable()
  }
}
