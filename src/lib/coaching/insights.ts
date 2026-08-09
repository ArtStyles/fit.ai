import {
  buildPrescribedOccurrences,
  calculateTrainerAdherence,
  deriveOperationalAlerts,
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
