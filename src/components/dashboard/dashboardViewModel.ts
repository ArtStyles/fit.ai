export type DashboardWorkout = {
  id: string
  name: string
  focus: string | null
  day_of_week: number | null
  order_in_plan: number | null
  estimated_duration_minutes: number | null
  exercise_count: number
  progression_suggestion_count: number
}

export type DashboardWeekDay = {
  isoDay: number
  dateStr: string
  workout: DashboardWorkout | null
  isCompleted: boolean
  isToday: boolean
  isRecoverable: boolean
  completedDurationMinutes: number | null
  completedLogId: string | null
}

export type DashboardLatestSession = {
  id: string
  workoutName: string
  completedAt: string
  durationMinutes: number | null
} | null

export type DashboardTopRecord = {
  logId: string
  exerciseId: string
  exerciseName: string
  maxWeightKg: number
  repsAtMaxWeight: number
} | null

export type DashboardNotice =
  | { kind: 'needs-plan' }
  | { kind: 'check-in' }
  | { kind: 'ai-notes'; text: string }
  | { kind: 'promo'; title: string }

export type DashboardNoticeInput = {
  needsPlan: boolean
  checkInDue: boolean
  aiNotes: string | null
  promo: { title: string } | null
}

export function selectDashboardNotice(input: DashboardNoticeInput): DashboardNotice | null {
  if (input.needsPlan) return { kind: 'needs-plan' }
  if (input.checkInDue) return { kind: 'check-in' }
  if (input.aiNotes) return { kind: 'ai-notes', text: input.aiNotes }
  if (input.promo) return { kind: 'promo', title: input.promo.title }
  return null
}

export type DashboardViewModelInput = DashboardNoticeInput & {
  todayWorkout: DashboardWorkout | null
  isCompletedToday: boolean
  hasSessionToday: boolean
  nextWorkout: DashboardWorkout | null
  nextWorkoutIsoDay: number | null
  recoverableWorkout: DashboardWorkout | null
  recoverableIsoDay: number | null
  weekDays: DashboardWeekDay[]
  sessionsThisWeek: number
  scheduledThisWeek: number
  streak: number
  weekVolumeKg: number
  volumeSeries: number[]
  hasCompletedSessions: boolean
  dailyBriefMessage: string | null
  latestSession: DashboardLatestSession
  topRecord: DashboardTopRecord
  activeAdjustmentCount: number
  timeZone: string
  referenceInstant: string
}

export type DashboardToday = {
  state: 'available' | 'completed' | 'completed-for-today' | 'rest' | 'needs-plan'
  workout: DashboardWorkout | null
  href: string | null
  nextWorkout: DashboardWorkout | null
  nextWorkoutIsoDay: number | null
}

export type DashboardRecommendation =
  | {
      kind: 'recover-session'
      workout: DashboardWorkout
      isoDay: number | null
      href: string
      chatHref: '/chat'
    }
  | {
      kind: 'plan-adjustment'
      adjustmentCount: number
      href: '/plan'
      chatHref: '/chat'
    }
  | {
      kind: 'daily-brief'
      message: string
      href: null
      chatHref: '/chat'
    }
  | {
      kind: 'prepare-next'
      workout: DashboardWorkout
      isoDay: number | null
      href: '/plan'
      chatHref: '/chat'
    }

export type DashboardViewModel = {
  notice: DashboardNotice | null
  today: DashboardToday
  weekly: {
    days: DashboardWeekDay[]
    completed: number
    scheduled: number
  }
  recommendation: DashboardRecommendation | null
  secondaryMetrics: {
    streak: number
    volumeKg: number
    volumeSeries: number[]
    hasCompletedSessions: boolean
    latestSession: DashboardLatestSession
    topRecord: DashboardTopRecord
    activeAdjustments: number
    timeZone: string
    referenceInstant: string
  }
}

function deriveToday(input: DashboardViewModelInput): DashboardToday {
  if (input.needsPlan) {
    return {
      state: 'needs-plan',
      workout: null,
      href: null,
      nextWorkout: null,
      nextWorkoutIsoDay: null,
    }
  }

  if (!input.todayWorkout) {
    if (input.hasSessionToday) {
      return {
        state: 'completed-for-today',
        workout: null,
        href: null,
        nextWorkout: input.nextWorkout,
        nextWorkoutIsoDay: input.nextWorkoutIsoDay,
      }
    }
    return {
      state: 'rest',
      workout: null,
      href: null,
      nextWorkout: input.nextWorkout,
      nextWorkoutIsoDay: input.nextWorkoutIsoDay,
    }
  }

  if (input.hasSessionToday && !input.isCompletedToday) {
    return {
      state: 'completed-for-today',
      workout: input.todayWorkout,
      href: null,
      nextWorkout: input.nextWorkout,
      nextWorkoutIsoDay: input.nextWorkoutIsoDay,
    }
  }

  return {
    state: input.isCompletedToday ? 'completed' : 'available',
    workout: input.todayWorkout,
    href: input.isCompletedToday ? null : `/session/${input.todayWorkout.id}`,
    nextWorkout: input.nextWorkout,
    nextWorkoutIsoDay: input.nextWorkoutIsoDay,
  }
}

function deriveRecommendation(input: DashboardViewModelInput): DashboardRecommendation | null {
  if (input.needsPlan) return null
  if (input.recoverableWorkout && !input.hasSessionToday) {
    return {
      kind: 'recover-session',
      workout: input.recoverableWorkout,
      isoDay: input.recoverableIsoDay,
      href: `/session/${input.recoverableWorkout.id}`,
      chatHref: '/chat',
    }
  }
  if (input.activeAdjustmentCount > 0) {
    return {
      kind: 'plan-adjustment',
      adjustmentCount: input.activeAdjustmentCount,
      href: '/plan',
      chatHref: '/chat',
    }
  }
  if (input.dailyBriefMessage) {
    return {
      kind: 'daily-brief',
      message: input.dailyBriefMessage,
      href: null,
      chatHref: '/chat',
    }
  }
  if (input.nextWorkout) {
    return {
      kind: 'prepare-next',
      workout: input.nextWorkout,
      isoDay: input.nextWorkoutIsoDay,
      href: '/plan',
      chatHref: '/chat',
    }
  }
  return null
}

export function buildDashboardViewModel(input: DashboardViewModelInput): DashboardViewModel {
  const daysByIso = new Map<number, DashboardWeekDay>()
  for (const day of input.weekDays) {
    if (day.isoDay < 1 || day.isoDay > 7 || daysByIso.has(day.isoDay)) continue
    daysByIso.set(day.isoDay, day)
  }
  const normalizedDays = Array.from(daysByIso.values()).sort((a, b) => a.isoDay - b.isoDay)

  return {
    notice: selectDashboardNotice(input),
    today: deriveToday(input),
    weekly: {
      days: normalizedDays,
      completed: normalizedDays.filter(day => day.workout && day.isCompleted).length,
      scheduled: normalizedDays.filter(day => day.workout).length,
    },
    recommendation: deriveRecommendation(input),
    secondaryMetrics: {
      streak: input.streak,
      volumeKg: Math.round(input.weekVolumeKg),
      volumeSeries: input.volumeSeries,
      hasCompletedSessions: input.hasCompletedSessions,
      latestSession: input.latestSession,
      topRecord: input.topRecord,
      activeAdjustments: input.activeAdjustmentCount,
      timeZone: input.timeZone,
      referenceInstant: input.referenceInstant,
    },
  }
}
