import { describe, expect, it } from 'vitest'
import { buildWeekContinuity } from '../weekContinuity'

const planBWorkout = {
  id: '22222222-2222-4222-8222-222222222222',
  name: 'Plan B Full Body',
  focus: 'Full body',
  day_of_week: 1,
}

const planASnapshot = {
  version: 1 as const,
  workout: {
    id: '11111111-1111-4111-8111-111111111111',
    name: 'Plan A Legs',
    focus: 'Legs',
    dayOfWeek: 1,
  },
  plan: {
    id: '33333333-3333-4333-8333-333333333333',
    familyId: '44444444-4444-4444-8444-444444444444',
    name: 'Plan A',
    weekNumber: 1,
  },
  exercises: [],
}

const dates = [{ isoDay: 1, dateStr: '2026-07-06' }]

describe('buildWeekContinuity', () => {
  it('projects effective dates while retaining completion evidence on the actual training date', () => {
    const occurrence = { workout_id: planBWorkout.id, source_date: '2026-07-06', target_date: '2026-07-07' }
    const log = { id: 'moved-log', workout_id: planBWorkout.id, completed_at: '2026-07-08T12:00:00Z', duration_minutes: 35, session_context_snapshot: null, occurrence_source_date: '2026-07-06' }
    const days = buildWeekContinuity({
      activeWorkouts: [planBWorkout], weekLogs: [log],
      dates: [{ isoDay: 1, dateStr: '2026-07-06' }, { isoDay: 2, dateStr: '2026-07-07' }, { isoDay: 3, dateStr: '2026-07-08' }],
      today: '2026-07-08', timeZone: 'UTC',
      localSchedule: { overrides: [occurrence], logs: [log], authorizations: [] },
    })
    expect(days[0].scheduledWorkout).toBeNull()
    expect(days[0].completionOnAnotherDate?.logId).toBe('moved-log')
    expect(days[0].hasTrainingEvidence).toBe(false)
    expect(days[1].scheduledWorkout?.id).toBe(planBWorkout.id)
    expect(days[1].canStartScheduledWorkout).toBe(false)
    expect(days[1].completedEvidence).toBeNull()
    expect(days[1].completionOnAnotherDate?.logId).toBe('moved-log')
    expect(days[2].completedEvidence?.logId).toBe('moved-log')
  })
  it('marks the original Wednesday when completed Thursday without counting training twice', () => {
    const workout = { ...planBWorkout, name: 'Lunes', day_of_week: 3 }
    const log = { id: 'recovered', workout_id: workout.id, completed_at: '2026-09-11T02:00:00Z', duration_minutes: 35, session_context_snapshot: null }
    const days = buildWeekContinuity({
      activeWorkouts: [workout], weekLogs: [log],
      dates: [{ isoDay: 3, dateStr: '2026-09-09' }, { isoDay: 4, dateStr: '2026-09-10' }], today: '2026-09-10',
      localSchedule: { overrides: [], logs: [{ ...log, occurrence_source_date: '2026-09-09' }], authorizations: [] },
    })
    expect(days[0]).toMatchObject({ hasTrainingEvidence: false, canStartScheduledWorkout: false, isScheduledWorkoutCompleted: true,
      completionOnAnotherDate: { logId: 'recovered', sourceDate: '2026-09-09', completedDate: '2026-09-10' } })
    expect(days[1].completedEvidence).toMatchObject({ logId: 'recovered', sourceDate: '2026-09-09', isFromActivePlan: true })
    expect(days.filter(day => day.hasTrainingEvidence)).toHaveLength(1)
  })
  it('recovers legacy identity from the frozen snapshot, not a renamed or rearranged workout', () => {
    const snapshot = { ...planASnapshot, workout: { ...planASnapshot.workout, id: planBWorkout.id, dayOfWeek: 3 } }
    const [wednesday, thursday] = buildWeekContinuity({
      activeWorkouts: [{ ...planBWorkout, name: 'Martes', day_of_week: 2 }],
      weekLogs: [{ id: 'legacy', workout_id: planBWorkout.id, completed_at: '2026-09-10T16:00:00Z', duration_minutes: 5, session_context_snapshot: snapshot }],
      dates: [{ isoDay: 3, dateStr: '2026-09-09' }, { isoDay: 4, dateStr: '2026-09-10' }], today: '2026-09-10',
    })
    expect(wednesday.completionOnAnotherDate?.logId).toBe('legacy')
    expect(thursday.hasTrainingEvidence).toBe(true)
  })
  it('uses the consumed authorization for a legacy log even across the week boundary', () => {
    const log = { id: 'legacy-lease', client_session_id: 'client-1', workout_id: planBWorkout.id, completed_at: '2026-09-14T16:00:00Z', duration_minutes: 5, session_context_snapshot: null }
    const [sunday] = buildWeekContinuity({
      activeWorkouts: [planBWorkout], weekLogs: [log],
      dates: [{ isoDay: 7, dateStr: '2026-09-13' }], today: '2026-09-14',
      localSchedule: { overrides: [], logs: [log], authorizations: [{ workout_id: planBWorkout.id, client_session_id: 'client-1',
        policy_date: '2026-09-14', policy_timezone: 'America/Havana', workout_window_start: '2026-09-13T04:00:00Z', expires_at: '2026-09-15T04:00:00Z', consumed_at: log.completed_at }] },
    })
    expect(sunday.completionOnAnotherDate?.logId).toBe('legacy-lease')
    expect(sunday.hasTrainingEvidence).toBe(false)
  })
  it('does not guess an original date from a workout name or a mutable weekly schedule', () => {
    const [wednesday] = buildWeekContinuity({
      activeWorkouts: [{ ...planBWorkout, name: 'miércoles', day_of_week: 3 }],
      weekLogs: [{ id: 'unknown', workout_id: planBWorkout.id, completed_at: '2026-09-10T16:00:00Z', duration_minutes: 5, session_context_snapshot: null }],
      dates: [{ isoDay: 3, dateStr: '2026-09-09' }], today: '2026-09-10',
    })
    expect(wednesday.completionOnAnotherDate).toBeNull()
  })
  it('keeps a different real completion alongside the recovered original-day reference', () => {
    const days = buildWeekContinuity({
      activeWorkouts: [planBWorkout],
      weekLogs: [
        { id: 'actual', workout_id: null, completed_at: '2026-07-06T16:00:00Z', duration_minutes: 5, session_context_snapshot: null },
        { id: 'later', workout_id: planBWorkout.id, occurrence_source_date: '2026-07-06', completed_at: '2026-07-07T16:00:00Z', duration_minutes: 5, session_context_snapshot: null },
      ], dates, today: '2026-07-07',
    })
    expect(days[0].completedEvidence?.logId).toBe('actual')
    expect(days[0].completionOnAnotherDate?.logId).toBe('later')
  })
  it.each(['stamped', 'legacy'])('does not complete another occurrence after the same workout changes weekday (%s)', source => {
    const log = { id: 'recovered', workout_id: planBWorkout.id,
      ...(source === 'stamped' ? { occurrence_source_date: '2026-09-09' } : {}),
      completed_at: '2026-09-10T16:00:00Z', duration_minutes: 5,
      session_context_snapshot: { ...planASnapshot, workout: { ...planASnapshot.workout, id: planBWorkout.id, dayOfWeek: 3 } } }
    const [thursday] = buildWeekContinuity({
      activeWorkouts: [{ ...planBWorkout, day_of_week: 4 }], weekLogs: [log],
      localSchedule: { overrides: [], logs: [log], authorizations: [] },
      dates: [{ isoDay: 4, dateStr: '2026-09-10' }], today: '2026-09-10',
    })
    expect(thursday.isScheduledWorkoutCompleted).toBe(false)
    expect(thursday.hasTrainingEvidence).toBe(true)
    expect(thursday.canStartScheduledWorkout).toBe(false)
  })
  it('keeps prior-plan evidence on its real date without completing the active workout', () => {
    const [day] = buildWeekContinuity({
      activeWorkouts: [planBWorkout],
      weekLogs: [{
        id: 'log-a',
        workout_id: planASnapshot.workout.id,
        completed_at: '2026-07-06T14:00:00.000Z',
        duration_minutes: 53,
        session_context_snapshot: planASnapshot,
      }],
      dates,
      today: '2026-07-06',
      timeZone: 'America/Havana',
      fallbackWorkoutName: 'Workout',
    })

    expect(day.completedEvidence).toMatchObject({
      workoutName: 'Plan A Legs',
      durationMinutes: 53,
      source: 'snapshot',
    })
    expect(day.scheduledWorkout?.name).toBe('Plan B Full Body')
    expect(day.isScheduledWorkoutCompleted).toBe(false)
    expect(day.hasTrainingEvidence).toBe(true)
    expect(day.canStartScheduledWorkout).toBe(false)
  })

  it('marks an active workout completed only when its own log is the evidence', () => {
    const [day] = buildWeekContinuity({
      activeWorkouts: [planBWorkout],
      weekLogs: [{
        id: 'log-b',
        workout_id: planBWorkout.id,
        completed_at: '2026-07-06T14:00:00.000Z',
        duration_minutes: 42,
        session_context_snapshot: null,
        workout: { name: 'Plan B Full Body', focus: 'Full body' },
      }],
      dates,
      today: '2026-07-06',
      timeZone: 'America/Havana',
      fallbackWorkoutName: 'Workout',
    })

    expect(day.isScheduledWorkoutCompleted).toBe(true)
    expect(day.hasTrainingEvidence).toBe(true)
    expect(day.canStartScheduledWorkout).toBe(false)
  })

  it('keeps detached logs in the weekly evidence with the translated fallback', () => {
    const [day] = buildWeekContinuity({
      activeWorkouts: [],
      weekLogs: [{
        id: 'orphan-log',
        workout_id: null,
        completed_at: '2026-07-06T14:00:00.000Z',
        duration_minutes: 31,
        session_context_snapshot: null,
      }],
      dates,
      today: '2026-07-06',
      timeZone: 'America/Havana',
      fallbackWorkoutName: 'Entrenamiento',
    })

    expect(day.completedEvidence).toMatchObject({
      logId: 'orphan-log',
      workoutName: 'Entrenamiento',
      source: 'fallback',
    })
    expect(day.hasTrainingEvidence).toBe(true)
  })

  it('uses a live legacy workout relation when no snapshot is available', () => {
    const [day] = buildWeekContinuity({
      activeWorkouts: [],
      weekLogs: [{
        id: 'legacy-log',
        workout_id: '55555555-5555-4555-8555-555555555555',
        completed_at: '2026-07-06T14:00:00.000Z',
        duration_minutes: 31,
        session_context_snapshot: null,
        workout: [{ name: 'Legacy Back Day', focus: 'Back' }],
      }],
      dates,
      today: '2026-07-06',
      timeZone: 'America/Havana',
      fallbackWorkoutName: 'Entrenamiento',
    })

    expect(day.completedEvidence).toMatchObject({
      workoutName: 'Legacy Back Day',
      focus: 'Back',
      source: 'workout',
    })
  })

  it('selects the same newest evidence regardless of input order and breaks timestamp ties by id', () => {
    const logs = [
      {
        id: 'log-a',
        workout_id: null,
        completed_at: '2026-07-06T15:00:00.000Z',
        duration_minutes: 31,
        session_context_snapshot: null,
      },
      {
        id: 'log-z',
        workout_id: null,
        completed_at: '2026-07-06T15:00:00.000Z',
        duration_minutes: 32,
        session_context_snapshot: null,
      },
    ]
    const input = {
      activeWorkouts: [],
      dates,
      today: '2026-07-06',
      timeZone: 'America/Havana',
      fallbackWorkoutName: 'Entrenamiento',
    }

    const [forward] = buildWeekContinuity({ ...input, weekLogs: logs })
    const [reversed] = buildWeekContinuity({ ...input, weekLogs: [...logs].reverse() })

    expect(forward.completedEvidence?.logId).toBe('log-z')
    expect(reversed.completedEvidence?.logId).toBe('log-z')
  })

  it('prioritizes an exact scheduled-workout log over newer prior-plan evidence', () => {
    const [day] = buildWeekContinuity({
      activeWorkouts: [planBWorkout],
      weekLogs: [
        {
          id: 'prior-plan-newer',
          workout_id: planASnapshot.workout.id,
          completed_at: '2026-07-06T16:00:00.000Z',
          duration_minutes: 53,
          session_context_snapshot: planASnapshot,
        },
        {
          id: 'plan-b-earlier',
          workout_id: planBWorkout.id,
          completed_at: '2026-07-06T14:00:00.000Z',
          duration_minutes: 42,
          session_context_snapshot: null,
          workout: { name: 'Plan B Full Body', focus: 'Full body' },
        },
      ],
      dates,
      today: '2026-07-06',
      timeZone: 'America/Havana',
      fallbackWorkoutName: 'Workout',
    })

    expect(day.isScheduledWorkoutCompleted).toBe(true)
    expect(day.completedEvidence).toMatchObject({
      logId: 'plan-b-earlier',
      workoutName: 'Plan B Full Body',
    })
  })

  it('places evidence on the user-local date across a UTC day boundary', () => {
    const [sunday, monday] = buildWeekContinuity({
      activeWorkouts: [planBWorkout],
      weekLogs: [{
        id: 'late-sunday-log',
        workout_id: null,
        completed_at: '2026-07-06T03:30:00.000Z',
        duration_minutes: 31,
        session_context_snapshot: null,
      }],
      dates: [
        { isoDay: 7, dateStr: '2026-07-05' },
        { isoDay: 1, dateStr: '2026-07-06' },
      ],
      today: '2026-07-06',
      timeZone: 'America/Havana',
      fallbackWorkoutName: 'Entrenamiento',
    })

    expect(sunday.completedEvidence?.logId).toBe('late-sunday-log')
    expect(sunday.hasTrainingEvidence).toBe(true)
    expect(monday.completedEvidence).toBeNull()
    expect(monday.canStartScheduledWorkout).toBe(true)
  })
})
