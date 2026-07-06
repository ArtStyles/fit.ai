import { describe, expect, it } from 'vitest'
import {
  buildDashboardViewModel,
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

function input(overrides: Partial<DashboardViewModelInput> = {}): DashboardViewModelInput {
  return {
    needsPlan: false,
    checkInDue: false,
    aiNotes: null,
    promo: null,
    todayWorkout: workout,
    isCompletedToday: false,
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
  it('makes an available workout today\'s primary action', () => {
    expect(buildDashboardViewModel(input()).today).toMatchObject({
      state: 'available',
      workout,
      href: '/session/workout-1',
    })
  })

  it('marks today complete without offering the session again', () => {
    expect(buildDashboardViewModel(input({ isCompletedToday: true })).today).toMatchObject({
      state: 'completed',
      workout,
      href: null,
      nextWorkout,
      nextWorkoutIsoDay: 3,
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
      workout,
      isCompleted: true,
      isToday: true,
      isRecoverable: false,
      completedDurationMinutes: 45,
      completedLogId: 'log-1',
    }]
    expect(buildDashboardViewModel(input({ weekDays })).weekly).toEqual({
      days: weekDays,
      completed: 1,
      scheduled: 3,
    })
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
    })
  })

  it('is a pure derivation and does not require a database client', () => {
    const supplied = input()
    const viewModel = buildDashboardViewModel(supplied)

    expect(viewModel.today.workout).toBe(supplied.todayWorkout)
    expect(Object.keys(supplied)).not.toContain('supabase')
  })
})
