import { describe, expect, it } from 'vitest'
import { adaptCoachClientsSummary } from '../insights'

const now = '2026-08-26T12:00:00.000Z'
const sessions = ['2026-08-10', '2026-08-24'].map((date, index) => ({
  id: `completed-${index}`,
  assignmentVersionId: 'retained-version',
  workoutId: 'monday-workout',
  completedAt: `${date}T12:00:00.000Z`,
  averageRpe: 7,
}))

function summary(versions: unknown[], evidence = sessions) {
  return adaptCoachClientsSummary({
    schemaVersion: 1,
    counts: { pendingRequests: 0, activeClients: 1, pausedRelationships: 0 },
    clients: [{
      relationshipId: 'relationship',
      startedAt: '2026-08-01T00:00:00.000Z',
      client: { id: 'client', fullName: 'Cliente', avatarUrl: null, timezone: 'UTC' },
      activeAssignmentVersionId: versions.length ? 'retained-version' : null,
      lastProfessionalEvidenceAt: evidence.at(-1)?.completedAt ?? null,
      adherenceInput: {
        rangeStart: '2026-08-03', rangeEnd: '2026-08-26', versions,
        sessions: evidence, alertSessions: evidence,
      },
    }],
  }, now).clients[0]
}

describe('direct assignment selection windows consumed by coach summaries', () => {
  it('does not count a retained routine that has never been selected as missed training', () => {
    expect(summary([], []).adherence).toEqual({
      prescribed: 0, completed: 0, missed: 0, pending: 0, adherencePercent: 0,
    })
  })

  it('accepts repeated windows of one immutable version without duplicating workouts or counting unselected Mondays', () => {
    // Received before August 3; first selected August 4, changed away August 11,
    // then selected again August 18. The immutable prescription remains the same.
    const client = summary([
      {
        id: 'retained-version', effectiveFrom: '2026-08-04T00:00:00.000Z',
        effectiveTo: '2026-08-11T00:00:00.000Z',
        workouts: [{ id: 'monday-workout', isoDay: 1 }],
      },
      {
        id: 'retained-version', effectiveFrom: '2026-08-18T00:00:00.000Z',
        effectiveTo: null, workouts: [],
      },
    ])
    expect(client.adherence).toEqual({
      prescribed: 2, completed: 2, missed: 0, pending: 0, adherencePercent: 100,
    })
    expect(client.lastProfessionalEvidenceAt).toBe('2026-08-24T12:00:00.000Z')
  })
})
