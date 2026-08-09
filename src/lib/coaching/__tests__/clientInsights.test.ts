import { describe, expect, it } from 'vitest'
import { adaptCoachClientInsights } from '../insights'

const payload = {
  schemaVersion: 1,
  client: { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', fullName: 'Ada Cliente', avatarUrl: null, timezone: 'America/Havana' },
  relationship: { id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', startedAt: '2026-07-01T12:00:00.000Z', activeScopes: ['training_profile'] },
  versions: [{ id: 'version-a', assignmentId: 'assignment-a', versionNumber: 1, status: 'active', effectiveFrom: '2026-08-01T00:00:00.000Z', effectiveTo: null, changeSummary: null }],
  prescribedWorkouts: [{ assignmentVersionId: 'version-a', id: 'workout-a', name: 'Fuerza A', dayOfWeek: 1, orderInPlan: 1, exercises: [] }],
  sessions: [{
    id: 'session-a', assignmentVersionId: 'version-a', completedAt: '2026-08-03T15:00:00.000Z', durationMinutes: 45, moodRating: null, notes: '<script>no ejecutar</script>',
    workout: { id: 'workout-a', name: 'Fuerza A' },
    exerciseResults: [{ exerciseId: 'exercise-a', name: 'Sentadilla', setsCompleted: 3, repsCompleted: [8, 8, 7], weightsKg: [60, 60, 60], rpeValues: [8, 8, 9], durationSeconds: 180, notes: 'Última serie difícil' }],
  }],
  measurements: null,
}

describe('adaptCoachClientInsights', () => {
  it('derives client-time-zone prescribed adherence from the versioned RPC evidence', () => {
    const detail = adaptCoachClientInsights(payload, {
      rangeStart: '2026-08-03', rangeEnd: '2026-08-10', now: '2026-08-10T12:00:00.000Z',
    })

    expect(detail.adherence).toEqual({ prescribed: 2, completed: 1, missed: 0, pending: 1, adherencePercent: 100 })
    expect(detail.occurrences).toEqual(expect.arrayContaining([
      expect.objectContaining({ scheduledDate: '2026-08-03', workoutName: 'Fuerza A', status: 'completed' }),
      expect.objectContaining({ scheduledDate: '2026-08-10', workoutName: 'Fuerza A', status: 'pending' }),
    ]))
    expect(detail.sessions[0]).toMatchObject({ workoutName: 'Fuerza A', durationMinutes: 45, notes: '<script>no ejecutar</script>' })
  })

  it('rejects an incompatible or incomplete detail payload with the generic error', () => {
    expect(() => adaptCoachClientInsights({ ...payload, schemaVersion: 2 })).toThrow('COACH_CLIENT_INSIGHTS_UNAVAILABLE')
    expect(() => adaptCoachClientInsights({ ...payload, sessions: [{ ...payload.sessions[0], workout: { id: 'workout-a' } }] })).toThrow('COACH_CLIENT_INSIGHTS_UNAVAILABLE')
  })

  it('derives the existing non-clinical high-RPE alert from two consecutive evidence sessions', () => {
    const detail = adaptCoachClientInsights({
      ...payload,
      sessions: [
        { ...payload.sessions[0], exerciseResults: [{ ...payload.sessions[0].exerciseResults[0], rpeValues: [9, 9, 9] }] },
        { ...payload.sessions[0], id: 'session-b', completedAt: '2026-08-10T15:00:00.000Z', exerciseResults: [{ ...payload.sessions[0].exerciseResults[0], rpeValues: [9, 9, 9] }] },
      ],
    }, { rangeStart: '2026-08-03', rangeEnd: '2026-08-10', now: '2026-08-11T12:00:00.000Z' })

    expect(detail.alerts).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'repeated_high_rpe' }),
    ]))
  })
})
