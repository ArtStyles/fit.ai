import { describe, expect, it } from 'vitest'
import {
  buildPrescribedOccurrences,
  calculateTrainerAdherence,
  deriveOperationalAlerts,
  type PrescribedOccurrence,
} from '../adherence'

const utc = 'UTC'

describe('buildPrescribedOccurrences', () => {
  it('builds only the prescribed ISO weekdays in a partial week', () => {
    const occurrences = buildPrescribedOccurrences({
      versions: [{ id: 'v1', effectiveFrom: '2026-05-01T00:00:00.000Z', effectiveTo: null }],
      workouts: [
        { id: 'monday', assignmentVersionId: 'v1', isoWeekday: 1 },
        { id: 'wednesday', assignmentVersionId: 'v1', isoWeekday: 3 },
        { id: 'sunday', assignmentVersionId: 'v1', isoWeekday: 7 },
      ],
      timeZone: utc,
      rangeStart: '2026-05-06T00:00:00.000Z',
      rangeEnd: '2026-05-10T23:59:59.000Z',
      now: '2026-05-10T12:00:00.000Z',
    })

    expect(occurrences.map(({ scheduledDate, workoutId }) => [scheduledDate, workoutId])).toEqual([
      ['2026-05-06', 'wednesday'],
      ['2026-05-10', 'sunday'],
    ])
  })

  it('uses ISO weekdays one through seven without shifting them', () => {
    const occurrences = buildPrescribedOccurrences({
      versions: [{ id: 'v1', effectiveFrom: '2026-05-01T00:00:00.000Z', effectiveTo: null }],
      workouts: Array.from({ length: 7 }, (_, index) => ({
        id: `day-${index + 1}`,
        assignmentVersionId: 'v1',
        isoWeekday: index + 1,
      })),
      timeZone: utc,
      rangeStart: '2026-05-04T00:00:00.000Z',
      rangeEnd: '2026-05-10T23:59:59.000Z',
      now: '2026-05-10T12:00:00.000Z',
    })

    expect(occurrences.map(({ scheduledDate, workoutId }) => [scheduledDate, workoutId])).toEqual([
      ['2026-05-04', 'day-1'], ['2026-05-05', 'day-2'], ['2026-05-06', 'day-3'],
      ['2026-05-07', 'day-4'], ['2026-05-08', 'day-5'], ['2026-05-09', 'day-6'],
      ['2026-05-10', 'day-7'],
    ])
  })

  it('chooses one version at the local day start across a midweek change', () => {
    const occurrences = buildPrescribedOccurrences({
      versions: [
        { id: 'v1', effectiveFrom: '2026-03-01T00:00:00.000Z', effectiveTo: '2026-03-11T12:00:00.000Z' },
        { id: 'v2', effectiveFrom: '2026-03-11T12:00:00.000Z', effectiveTo: null },
      ],
      workouts: [
        { id: 'old-wednesday', assignmentVersionId: 'v1', isoWeekday: 3 },
        { id: 'new-wednesday', assignmentVersionId: 'v2', isoWeekday: 3 },
        { id: 'new-friday', assignmentVersionId: 'v2', isoWeekday: 5 },
      ],
      timeZone: 'America/New_York',
      rangeStart: '2026-03-09T00:00:00.000Z',
      rangeEnd: '2026-03-15T23:59:59.000Z',
      now: '2026-03-15T12:00:00.000Z',
    })

    expect(occurrences.map(({ scheduledDate, workoutId, assignmentVersionId }) => [scheduledDate, workoutId, assignmentVersionId])).toEqual([
      ['2026-03-11', 'old-wednesday', 'v1'],
      ['2026-03-13', 'new-friday', 'v2'],
    ])
  })

  it('uses calendar-day grace across DST without adding or losing a day', () => {
    const occurrences = buildPrescribedOccurrences({
      versions: [{ id: 'v1', effectiveFrom: '2026-03-01T00:00:00.000Z', effectiveTo: null }],
      workouts: [{ id: 'sunday', assignmentVersionId: 'v1', isoWeekday: 7 }],
      timeZone: 'America/New_York',
      rangeStart: '2026-03-07T12:00:00.000Z',
      rangeEnd: '2026-03-10T23:59:59.000Z',
      now: '2026-03-10T12:00:00.000Z',
    })

    expect(occurrences).toMatchObject([
      { scheduledDate: '2026-03-08', graceEndsOn: '2026-03-10' },
    ])
  })

  it('excludes future dates and dates after the relationship ended', () => {
    const occurrences = buildPrescribedOccurrences({
      versions: [{ id: 'v1', effectiveFrom: '2026-10-01T00:00:00.000Z', effectiveTo: null }],
      workouts: [
        { id: 'monday', assignmentVersionId: 'v1', isoWeekday: 1 },
        { id: 'wednesday', assignmentVersionId: 'v1', isoWeekday: 3 },
        { id: 'friday', assignmentVersionId: 'v1', isoWeekday: 5 },
      ],
      timeZone: utc,
      rangeStart: '2026-10-05T00:00:00.000Z',
      rangeEnd: '2026-10-18T23:59:59.000Z',
      relationshipEndedAt: '2026-10-08T00:00:00.000Z',
      now: '2026-10-18T12:00:00.000Z',
    })

    expect(occurrences.map(({ scheduledDate, workoutId }) => [scheduledDate, workoutId])).toEqual([
      ['2026-10-05', 'monday'],
      ['2026-10-07', 'wednesday'],
    ])
  })
})

describe('calculateTrainerAdherence', () => {
  const prescribed: PrescribedOccurrence[] = [
    { id: 'one', assignmentVersionId: 'v1', workoutId: 'w1', scheduledDate: '2026-05-04', graceEndsOn: '2026-05-06' },
    { id: 'two', assignmentVersionId: 'v1', workoutId: 'w2', scheduledDate: '2026-05-06', graceEndsOn: '2026-05-08' },
    { id: 'three', assignmentVersionId: 'v1', workoutId: 'w3', scheduledDate: '2026-05-08', graceEndsOn: '2026-05-10' },
    { id: 'four', assignmentVersionId: 'v2', workoutId: 'w4', scheduledDate: '2026-05-11', graceEndsOn: '2026-05-13' },
  ]

  it('counts one matching professional session and leaves the grace occurrence pending', () => {
    const adherence = calculateTrainerAdherence({
      occurrences: prescribed,
      timeZone: utc,
      now: '2026-05-12T12:00:00.000Z',
      sessions: [
        { id: 'completed', assignmentVersionId: 'v1', workoutId: 'w1', completedAt: '2026-05-04T10:00:00.000Z', source: 'professional' },
        { id: 'duplicate', assignmentVersionId: 'v1', workoutId: 'w1', completedAt: '2026-05-05T10:00:00.000Z', source: 'professional' },
        { id: 'personal', assignmentVersionId: 'v1', workoutId: 'w2', completedAt: '2026-05-06T10:00:00.000Z', source: 'personal' },
        { id: 'wrong-version', assignmentVersionId: 'v2', workoutId: 'w2', completedAt: '2026-05-06T10:00:00.000Z', source: 'professional' },
        { id: 'late', assignmentVersionId: 'v1', workoutId: 'w3', completedAt: '2026-05-12T10:00:00.000Z', source: 'professional' },
      ],
    })

    expect(adherence).toEqual({
      prescribed: 4,
      completed: 1,
      missed: 2,
      pending: 1,
      adherencePercent: 33,
    })
  })

  it('keeps the simple closed-occurrence summary compatible with the professional metric', () => {
    expect(calculateTrainerAdherence({ prescribed: 4, completed: 3 })).toEqual({
      prescribed: 4,
      completed: 3,
      missed: 1,
      adherencePercent: 75,
    })
  })
})

describe('deriveOperationalAlerts', () => {
  it('emits only operational alerts for stale activity, low adherence and repeated high RPE', () => {
    const alerts = deriveOperationalAlerts({
      adherence: { prescribed: 3, completed: 1, missed: 2, pending: 0, adherencePercent: 33 },
      timeZone: utc,
      now: '2026-05-20T12:00:00.000Z',
      sessions: [
        { id: 'old', assignmentVersionId: 'v1', workoutId: 'w1', completedAt: '2026-05-10T10:00:00.000Z', source: 'professional', averageRpe: 9.2 },
        { id: 'new', assignmentVersionId: 'v1', workoutId: 'w2', completedAt: '2026-05-11T10:00:00.000Z', source: 'professional', averageRpe: 9.4 },
        { id: 'personal-recent', assignmentVersionId: null, workoutId: 'personal', completedAt: '2026-05-19T10:00:00.000Z', source: 'personal', averageRpe: 5 },
      ],
    })

    expect(alerts.map(alert => alert.code)).toEqual([
      'no_recent_prescribed_activity',
      'low_adherence',
      'repeated_high_rpe',
    ])
    expect(alerts.map(alert => alert.message).join(' ')).not.toMatch(/diagn[oó]stic|lesi[oó]n|tratamiento|m[eé]dic/i)
  })

  it('does not raise a low-adherence alert before two closed occurrences', () => {
    expect(deriveOperationalAlerts({
      adherence: { prescribed: 1, completed: 0, missed: 1, pending: 0, adherencePercent: 0 },
      timeZone: utc,
      now: '2026-05-20T12:00:00.000Z',
      sessions: [],
    }).map(alert => alert.code)).not.toContain('low_adherence')
  })
})
