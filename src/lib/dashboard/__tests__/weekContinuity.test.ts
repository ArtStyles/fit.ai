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
