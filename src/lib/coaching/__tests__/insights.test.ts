import { describe, expect, it } from 'vitest'
import { adaptCoachClientsSummary } from '../insights'

const NOW = '2026-08-10T12:00:00.000Z'

function payload(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: 1,
    counts: { pendingRequests: 2, activeClients: 2, pausedRelationships: 1 },
    clients: [
      {
        relationshipId: 'relationship-a',
        startedAt: '2026-07-01T10:00:00.000Z',
        client: { id: 'client-a', fullName: 'Actividad reciente', avatarUrl: null, timezone: 'America/Havana' },
        activeAssignmentVersionId: 'version-a',
        lastPrescribedSessionAt: '2026-08-04T10:00:00.000Z',
        adherenceInput: {
          rangeStart: '2026-08-03', rangeEnd: '2026-08-10',
          versions: [{ id: 'version-a', effectiveFrom: '2026-07-01T00:00:00.000Z', effectiveTo: null, workouts: [{ id: 'workout-a', isoDay: 1 }] }],
          sessions: [{ id: 'session-a', assignmentVersionId: 'version-a', workoutId: 'workout-a', completedAt: '2026-08-04T10:00:00.000Z', averageRpe: 7 }],
          alertSessions: [{ id: 'session-a', assignmentVersionId: 'version-a', workoutId: 'workout-a', completedAt: '2026-08-04T10:00:00.000Z', averageRpe: 7 }],
        },
      },
      {
        relationshipId: 'relationship-b',
        startedAt: '2026-06-01T10:00:00.000Z',
        client: { id: 'client-b', fullName: 'Requiere atención', avatarUrl: null, timezone: 'America/Havana' },
        activeAssignmentVersionId: 'version-b',
        lastPrescribedSessionAt: '2026-08-01T10:00:00.000Z',
        adherenceInput: {
          rangeStart: '2026-07-20', rangeEnd: '2026-08-10',
          versions: [{ id: 'version-b', effectiveFrom: '2026-06-01T00:00:00.000Z', effectiveTo: null, workouts: [{ id: 'workout-b', isoDay: 1 }] }],
          sessions: [
            { id: 'session-b1', assignmentVersionId: 'version-b', workoutId: 'workout-b', completedAt: '2026-07-20T10:00:00.000Z', averageRpe: 9 },
            { id: 'session-b2', assignmentVersionId: 'version-b', workoutId: 'workout-b', completedAt: '2026-07-27T10:00:00.000Z', averageRpe: 9 },
          ],
          alertSessions: [
            { id: 'session-b1', assignmentVersionId: 'version-b', workoutId: 'workout-b', completedAt: '2026-07-20T10:00:00.000Z', averageRpe: 9 },
            { id: 'session-b2', assignmentVersionId: 'version-b', workoutId: 'workout-b', completedAt: '2026-07-27T10:00:00.000Z', averageRpe: 9 },
          ],
        },
      },
    ],
    ...overrides,
  }
}

describe('adaptCoachClientsSummary', () => {
  it('rejects an unversioned or malformed summary rather than inventing client access', () => {
    expect(() => adaptCoachClientsSummary({ schemaVersion: 2, clients: [] }, NOW)).toThrow('COACH_CLIENT_INSIGHTS_UNAVAILABLE')
    expect(() => adaptCoachClientsSummary({ schemaVersion: 1, counts: {}, clients: [{ client: { id: 'x' } }] }, NOW)).toThrow('COACH_CLIENT_INSIGHTS_UNAVAILABLE')
  })

  it('calculates weekly adherence and deterministically puts operational alerts before recent activity', () => {
    const summary = adaptCoachClientsSummary(payload(), NOW)

    expect(summary.counts).toEqual({ pendingRequests: 2, activeClients: 2, pausedRelationships: 1 })
    expect(summary.clients.map(client => client.clientId)).toEqual(['client-b', 'client-a'])
    expect(summary.clients[0]).toMatchObject({
      status: 'active',
      adherence: { prescribed: 4, completed: 2, missed: 1, pending: 1, adherencePercent: 67 },
    })
    expect(summary.clients[0]?.alerts.map(alert => alert.code)).toEqual(['no_recent_prescribed_activity'])
  })

  it('keeps paused relationships as aggregate-only information without a client detail row', () => {
    const summary = adaptCoachClientsSummary(payload({
      counts: { pendingRequests: 0, activeClients: 0, pausedRelationships: 3 },
      clients: [],
    }), NOW)

    expect(summary.counts).toEqual({ pendingRequests: 0, activeClients: 0, pausedRelationships: 3 })
    expect(summary.clients).toEqual([])
    expect(JSON.stringify(summary)).not.toMatch(/email|phone|contact|notes|measurement/i)
  })

  it('uses the seven-day alert window without letting a prior-week session complete this week’s prescription', () => {
    const summary = adaptCoachClientsSummary(payload({
      counts: { pendingRequests: 0, activeClients: 1, pausedRelationships: 0 },
      clients: [{
        relationshipId: 'relationship-alert-window',
        startedAt: '2026-07-01T10:00:00.000Z',
        client: { id: 'client-alert-window', fullName: 'Actividad domingo', avatarUrl: null, timezone: 'America/Havana' },
        activeAssignmentVersionId: 'version-alert-window',
        lastPrescribedSessionAt: '2026-08-09T10:00:00.000Z',
        adherenceInput: {
          rangeStart: '2026-08-10T04:00:00.000Z', rangeEnd: '2026-08-10T04:00:00.000Z',
          versions: [{ id: 'version-alert-window', effectiveFrom: '2026-07-01T00:00:00.000Z', effectiveTo: null, workouts: [{ id: 'workout-alert-window', isoDay: 1 }] }],
          sessions: [],
          alertSessions: [{ id: 'prior-week-recovery', assignmentVersionId: 'version-alert-window', workoutId: 'workout-alert-window', completedAt: '2026-08-05T10:00:00.000Z', averageRpe: 7 }],
        },
      }],
    }), NOW)

    expect(summary.clients[0]?.adherence).toMatchObject({ prescribed: 1, completed: 0, pending: 1 })
    expect(summary.clients[0]?.alerts.map(alert => alert.code)).not.toContain('no_recent_prescribed_activity')
  })
  it('treats a summary DATE range as client-local calendar boundaries in a negative UTC offset', () => {
    const summary = adaptCoachClientsSummary(payload({
      counts: { pendingRequests: 0, activeClients: 1, pausedRelationships: 0 },
      clients: [{
        relationshipId: 'relationship-local-monday',
        startedAt: '2026-07-01T10:00:00.000Z',
        client: { id: 'client-local-monday', fullName: 'Lunes local', avatarUrl: null, timezone: 'America/Havana' },
        activeAssignmentVersionId: 'version-local-monday',
        lastPrescribedSessionAt: null,
        adherenceInput: {
          rangeStart: '2026-08-10', rangeEnd: '2026-08-10',
          versions: [{ id: 'version-local-monday', effectiveFrom: '2026-07-01T00:00:00.000Z', effectiveTo: null, workouts: [{ id: 'workout-local-monday', isoDay: 1 }] }],
          sessions: [], alertSessions: [],
        },
      }],
    }), NOW)

    expect(summary.clients[0]?.adherence).toMatchObject({ prescribed: 1, pending: 1 })
  })

  it('uses canonical prior-week claims for summary alerts and last prescribed activity', () => {
    const summary = adaptCoachClientsSummary(payload({
      counts: { pendingRequests: 0, activeClients: 1, pausedRelationships: 0 },
      clients: [{
        relationshipId: 'relationship-canonical-alerts',
        startedAt: '2026-07-01T10:00:00.000Z',
        client: { id: 'client-canonical-alerts', fullName: 'Alertas canónicas', avatarUrl: null, timezone: 'America/Havana' },
        activeAssignmentVersionId: 'version-canonical-alerts',
        lastPrescribedSessionAt: '2026-08-07T10:00:00.000Z',
        adherenceInput: {
          rangeStart: '2026-08-10', rangeEnd: '2026-08-10',
          versions: [{ id: 'version-canonical-alerts', effectiveFrom: '2026-07-01T00:00:00.000Z', effectiveTo: null, workouts: [{ id: 'workout-canonical-alerts', isoDay: 1 }] }],
          sessions: [],
          alertSessions: [
            { id: 'valid-recovery', assignmentVersionId: 'version-canonical-alerts', workoutId: 'workout-canonical-alerts', completedAt: '2026-08-05T10:00:00.000Z', averageRpe: 7 },
            { id: 'outside-grace-a', assignmentVersionId: 'version-canonical-alerts', workoutId: 'workout-canonical-alerts', completedAt: '2026-08-06T10:00:00.000Z', averageRpe: 9 },
            { id: 'outside-grace-b', assignmentVersionId: 'version-canonical-alerts', workoutId: 'workout-canonical-alerts', completedAt: '2026-08-07T10:00:00.000Z', averageRpe: 9 },
          ],
        },
      }],
    }), NOW)

    expect(summary.clients[0]?.alerts.map(alert => alert.code)).not.toContain('repeated_high_rpe')
    expect(summary.clients[0]?.alerts.map(alert => alert.code)).not.toContain('no_recent_prescribed_activity')
    expect(summary.clients[0]?.lastPrescribedSessionAt).toBe('2026-08-05T10:00:00.000Z')
  })
})
