import { describe, expect, it } from 'vitest'
import {
  buildDashboardViewModel,
  dashboardNoticePlacement,
  selectDashboardNotice,
  type DashboardViewModelInput,
} from '../dashboardViewModel'

const workout = {
  id: 'workout-1',
  name: 'Fuerza total',
  focus: 'Fuerza',
  day_of_week: 1,
  order_in_plan: 1,
  estimated_duration_minutes: 45,
  exercise_count: 6,
  progression_suggestion_count: 2,
}

const nextWorkout = { ...workout, id: 'workout-2', name: 'Piernas', day_of_week: 3 }

function weekDay(
  isoDay: number,
  scheduledWorkout: typeof workout | null,
  hasTrainingEvidence = false,
) {
  return {
    isoDay,
    dateStr: `2026-07-${String(5 + isoDay).padStart(2, '0')}`,
    scheduledWorkout,
    completedEvidence: hasTrainingEvidence ? {
      logId: `log-${isoDay}`,
      workoutId: scheduledWorkout?.id ?? null,
      workoutName: scheduledWorkout?.name ?? 'Entrenamiento',
      focus: scheduledWorkout?.focus ?? null,
      durationMinutes: 45,
      completedAt: `2026-07-${String(5 + isoDay).padStart(2, '0')}T12:00:00.000Z`,
      source: scheduledWorkout ? 'workout' as const : 'fallback' as const,
    } : null,
    isScheduledWorkoutCompleted: hasTrainingEvidence && Boolean(scheduledWorkout),
    hasTrainingEvidence,
    canStartScheduledWorkout: Boolean(scheduledWorkout) && !hasTrainingEvidence,
    isToday: isoDay === 1,
    isRecoverable: false,
  }
}

function input(overrides: Partial<DashboardViewModelInput> = {}): DashboardViewModelInput {
  return {
    needsPlan: false,
    checkInDue: false,
    aiNotes: null,
    promo: null,
    todayWorkout: workout,
    isCompletedToday: false,
    hasSessionToday: false,
    nextWorkout,
    nextWorkoutIsoDay: 3,
    recoverableWorkout: null,
    recoverableIsoDay: null,
    weekDays: [],
    sessionsThisWeek: 1,
    scheduledThisWeek: 3,
    streak: 4,
    weekVolumeKg: 1240,
    volumeSeries: [100, 140, 180],
    hasCompletedSessions: true,
    dailyBriefMessage: 'Prioriza la tecnica y deja dos repeticiones en reserva.',
    latestSession: null,
    topRecord: null,
    activeAdjustmentCount: 0,
    timeZone: 'America/Havana',
    referenceInstant: '2026-07-06T12:00:00.000Z',
    ...overrides,
  }
}

describe('dashboard notice priority', () => {
  it('shows blocking plan generation before promotional content', () => {
    expect(selectDashboardNotice({ needsPlan: true, checkInDue: true, aiNotes: 'ready', promo: { title: 'Promo' } }))
      .toMatchObject({ kind: 'needs-plan' })
  })

  it('shows at most one non-blocking notice', () => {
    expect(selectDashboardNotice({ needsPlan: false, checkInDue: true, aiNotes: 'ready', promo: { title: 'Promo' } }))
      .toMatchObject({ kind: 'check-in' })
  })

  it('uses AI notes before a promotional notice', () => {
    expect(selectDashboardNotice({ needsPlan: false, checkInDue: false, aiNotes: 'ready', promo: { title: 'Promo' } }))
      .toEqual({ kind: 'ai-notes', text: 'ready' })
  })

  it('uses a promotion only when no higher-priority notice exists', () => {
    expect(selectDashboardNotice({ needsPlan: false, checkInDue: false, aiNotes: null, promo: { title: 'Promo' } }))
      .toEqual({ kind: 'promo', title: 'Promo' })
  })

  it('returns null when there is nothing actionable to announce', () => {
    expect(selectDashboardNotice({ needsPlan: false, checkInDue: false, aiNotes: null, promo: null }))
      .toBeNull()
  })
})

describe('dashboard view model', () => {
  it('builds a chronological week without inventing readiness data', () => {
    const viewModel = buildDashboardViewModel(input({
      weekDays: [
        { ...weekDay(1, workout, true), isToday: false },
        weekDay(2, null),
        { ...weekDay(3, nextWorkout, false), isToday: true },
      ],
    }))

    expect(viewModel.weekly.timeline.map(item => item.tone)).toEqual([
      'completed',
      'rest',
      'active',
    ])
    expect(viewModel).not.toHaveProperty('readinessScore')
  })

  it.each([
    ['needs-plan', 'primary'],
    ['check-in', 'inline'],
    ['ai-notes', 'hub'],
    ['promo', 'hub'],
  ] as const)('places %s notices in %s', (kind, placement) => {
    expect(dashboardNoticePlacement(kind)).toBe(placement)
  })

  it('makes an available workout today\'s primary action', () => {
    expect(buildDashboardViewModel(input()).today).toMatchObject({
      state: 'available',
      workout,
      href: '/session/workout-1',
    })
  })

  it('marks today complete without offering the session again', () => {
    expect(buildDashboardViewModel(input({ isCompletedToday: true, hasSessionToday: true })).today).toMatchObject({
      state: 'completed',
      workout,
      href: null,
      nextWorkout,
      nextWorkoutIsoDay: 3,
    })
  })

  it('locks today when a different or recoverable workout was completed today', () => {
    const priorPlanEvidence = {
      logId: 'plan-a-log',
      workoutId: 'plan-a-workout',
      workoutName: 'Plan A Legs',
      focus: 'Legs',
      durationMinutes: 53,
      completedAt: '2026-07-06T12:00:00.000Z',
      source: 'snapshot' as const,
    }
    const viewModel = buildDashboardViewModel(input({
      isCompletedToday: false,
      hasSessionToday: true,
      recoverableWorkout: workout,
      recoverableIsoDay: 1,
      weekDays: [{
        ...weekDay(1, workout, true),
        completedEvidence: priorPlanEvidence,
        isScheduledWorkoutCompleted: false,
      }],
    }))

    expect(viewModel.today).toMatchObject({
      state: 'completed-for-today',
      workout,
      href: null,
      nextWorkout,
      nextWorkoutIsoDay: 3,
      completedEvidence: priorPlanEvidence,
    })
    expect(viewModel.recommendation).not.toMatchObject({ kind: 'recover-session' })
  })

  it('keeps today available when no workout was completed today', () => {
    expect(buildDashboardViewModel(input({ isCompletedToday: false, hasSessionToday: false })).today)
      .toMatchObject({ state: 'available', href: '/session/workout-1' })
  })

  it('locks after a different completion even when there is no next scheduled day', () => {
    expect(buildDashboardViewModel(input({
      isCompletedToday: false,
      hasSessionToday: true,
      nextWorkout: null,
      nextWorkoutIsoDay: null,
    })).today).toMatchObject({
      state: 'completed-for-today',
      href: null,
      nextWorkout: null,
      nextWorkoutIsoDay: null,
    })
  })

  it('explains a rest day and identifies the next scheduled day', () => {
    expect(buildDashboardViewModel(input({ todayWorkout: null })).today).toMatchObject({
      state: 'rest',
      workout: null,
      nextWorkout,
      nextWorkoutIsoDay: 3,
    })
  })

  it('handles a rest schedule with no upcoming workout', () => {
    expect(buildDashboardViewModel(input({ todayWorkout: null, nextWorkout: null, nextWorkoutIsoDay: null })).today)
      .toMatchObject({ state: 'rest', nextWorkout: null, nextWorkoutIsoDay: null })
  })

  it('derives compact weekly status from supplied schedule data', () => {
    const weekDays = [{
      isoDay: 1,
      dateStr: '2026-07-06',
      scheduledWorkout: workout,
      completedEvidence: {
        logId: 'log-1',
        workoutId: workout.id,
        workoutName: workout.name,
        focus: workout.focus,
        durationMinutes: 45,
        completedAt: '2026-07-06T12:00:00.000Z',
        source: 'workout' as const,
      },
      isScheduledWorkoutCompleted: true,
      hasTrainingEvidence: true,
      canStartScheduledWorkout: false,
      isToday: true,
      isRecoverable: false,
    }]
    expect(buildDashboardViewModel(input({ weekDays })).weekly).toEqual({
      days: weekDays,
      timeline: [{ ...weekDays[0], tone: 'completed', position: 'today' }],
      completed: 1,
      scheduled: 1,
    })
  })

  it('counts prior-plan evidence without completing the different scheduled workout', () => {
    const weekly = buildDashboardViewModel(input({
      weekDays: [{
        ...weekDay(1, workout, true),
        completedEvidence: {
          logId: 'plan-a-log',
          workoutId: 'plan-a-workout',
          workoutName: 'Plan A Legs',
          focus: 'Legs',
          durationMinutes: 53,
          completedAt: '2026-07-06T12:00:00.000Z',
          source: 'snapshot',
        },
        isScheduledWorkoutCompleted: false,
      }],
      sessionsThisWeek: 4,
      scheduledThisWeek: 4,
    })).weekly

    expect(weekly).toMatchObject({ completed: 1, scheduled: 1 })
    expect(weekly.days[0]).toMatchObject({
      scheduledWorkout: workout,
      completedEvidence: { workoutName: 'Plan A Legs' },
      isScheduledWorkoutCompleted: false,
      hasTrainingEvidence: true,
      canStartScheduledWorkout: false,
    })
  })

  it('counts duplicate logs represented by one completed day only once', () => {
    const weekly = buildDashboardViewModel(input({
      weekDays: [weekDay(1, workout, true)],
      sessionsThisWeek: 2,
    })).weekly

    expect(weekly.completed).toBe(1)
  })

  it('does not schedule workouts with null weekdays', () => {
    const weekly = buildDashboardViewModel(input({
      weekDays: Array.from({ length: 7 }, (_, index) => weekDay(index + 1, null)),
      scheduledThisWeek: 2,
    })).weekly

    expect(weekly.scheduled).toBe(0)
  })

  it('deduplicates duplicate scheduled weekday cells with map semantics', () => {
    const weekly = buildDashboardViewModel(input({
      weekDays: [weekDay(1, workout, true), weekDay(1, nextWorkout, true)],
      scheduledThisWeek: 2,
      sessionsThisWeek: 2,
    })).weekly

    expect(weekly.days).toHaveLength(1)
    expect(weekly).toMatchObject({ completed: 1, scheduled: 1 })
  })

  it('reports counts that exactly match the normalized rendered grid', () => {
    const weekly = buildDashboardViewModel(input({
      weekDays: [
        weekDay(1, workout, true),
        weekDay(2, null),
        weekDay(3, nextWorkout, false),
      ],
      sessionsThisWeek: 9,
      scheduledThisWeek: 9,
    })).weekly

    expect(weekly.completed).toBe(weekly.days.filter(day => day.hasTrainingEvidence).length)
    expect(weekly.scheduled).toBe(weekly.days.filter(day => day.scheduledWorkout).length)
  })

  it('prioritizes a recoverable session as the single next recommendation', () => {
    expect(buildDashboardViewModel(input({
      recoverableWorkout: workout,
      recoverableIsoDay: 1,
      activeAdjustmentCount: 3,
    })).recommendation).toMatchObject({
      kind: 'recover-session',
      href: '/session/workout-1',
      chatHref: '/chat',
    })
  })

  it('falls back through adjustment, brief, and upcoming-session recommendations', () => {
    expect(buildDashboardViewModel(input({ activeAdjustmentCount: 2 })).recommendation)
      .toMatchObject({ kind: 'plan-adjustment', href: '/plan', chatHref: '/chat' })
    expect(buildDashboardViewModel(input()).recommendation)
      .toMatchObject({ kind: 'daily-brief', chatHref: '/chat' })
    expect(buildDashboardViewModel(input({ dailyBriefMessage: null })).recommendation)
      .toMatchObject({ kind: 'prepare-next', chatHref: '/chat' })
    expect(buildDashboardViewModel(input({
      dailyBriefMessage: null,
      nextWorkout: null,
      nextWorkoutIsoDay: null,
    })).recommendation).toBeNull()
  })

  it('derives secondary metrics entirely from the supplied payload', () => {
    const latestSession = {
      id: 'log-1',
      workoutName: 'Fuerza total',
      completedAt: '2026-07-05T12:00:00.000Z',
      durationMinutes: 47,
    }
    const topRecord = {
      logId: 'log-1',
      exerciseId: 'exercise-1',
      exerciseName: 'Sentadilla',
      maxWeightKg: 100,
      repsAtMaxWeight: 5,
    }
    const viewModel = buildDashboardViewModel(input({ latestSession, topRecord }))

    expect(viewModel.secondaryMetrics).toEqual({
      streak: 4,
      volumeKg: 1240,
      volumeSeries: [100, 140, 180],
      hasCompletedSessions: true,
      latestSession,
      topRecord,
      activeAdjustments: 0,
      timeZone: 'America/Havana',
      referenceInstant: '2026-07-06T12:00:00.000Z',
    })
  })

  it('is a pure derivation and does not require a database client', () => {
    const supplied = input()
    const viewModel = buildDashboardViewModel(supplied)

    expect(viewModel.today.workout).toBe(supplied.todayWorkout)
    expect(Object.keys(supplied)).not.toContain('supabase')
  })
})
