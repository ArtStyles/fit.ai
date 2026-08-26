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
  scheduledWorkout: DashboardWorkout | null
  completedEvidence: DashboardCompletedEvidence | null
  isScheduledWorkoutCompleted: boolean
  hasTrainingEvidence: boolean
  canStartScheduledWorkout: boolean
  isToday: boolean
  isRecoverable: boolean
}

export type DashboardCompletedEvidence = {
  logId: string
  workoutId: string | null
  workoutName: string
  focus: string | null
  durationMinutes: number
  completedAt: string
  source: 'snapshot' | 'workout' | 'fallback'
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

export type DashboardNoticePlacement = 'primary' | 'inline' | 'hub'

export function dashboardNoticePlacement(
  kind: DashboardNotice['kind'],
): DashboardNoticePlacement {
  if (kind === 'needs-plan') return 'primary'
  if (kind === 'check-in') return 'inline'
  return 'hub'
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
  completedEvidence: DashboardCompletedEvidence | null
  href: string | null
  nextWorkout: DashboardWorkout | null
  nextWorkoutIsoDay: number | null
}

export type DashboardTimelineTone = 'completed' | 'active' | 'rest' | 'upcoming' | 'missed'

export type DashboardTimelineItem = DashboardWeekDay & {
  tone: DashboardTimelineTone
  position: 'past' | 'today' | 'future'
}

export type DashboardRecommendation =
  | {
      kind: 'recover-session'
      workout: DashboardWorkout
      isoDay: number | null
      href: string
    }
  | {
      kind: 'plan-adjustment'
      adjustmentCount: number
      href: '/plan'
    }
  | {
      kind: 'daily-brief'
      message: string
      href: null
    }
  | {
      kind: 'prepare-next'
      workout: DashboardWorkout
      isoDay: number | null
      href: '/plan'
    }

export type DashboardViewModel = {
  notice: DashboardNotice | null
  noticePlacement: DashboardNoticePlacement | null
  today: DashboardToday
  weekly: {
    days: DashboardWeekDay[]
    timeline: DashboardTimelineItem[]
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

function buildDashboardTimeline(days: DashboardWeekDay[]): DashboardTimelineItem[] {
  const todayIndex = days.findIndex(day => day.isToday)

  return days.map((day, index) => {
    const position = todayIndex < 0
      ? 'future'
      : index < todayIndex
        ? 'past'
        : index === todayIndex
          ? 'today'
          : 'future'
    const tone: DashboardTimelineTone = day.hasTrainingEvidence
      ? 'completed'
      : position === 'today' && day.scheduledWorkout
        ? 'active'
        : !day.scheduledWorkout
          ? 'rest'
          : position === 'past'
            ? 'missed'
            : 'upcoming'

    return { ...day, position, tone }
  })
}

function deriveToday(input: DashboardViewModelInput): DashboardToday {
  const completedEvidence = input.weekDays.find(day => day.isToday)?.completedEvidence ?? null

  if (input.needsPlan) {
    return {
      state: 'needs-plan',
      workout: null,
      completedEvidence,
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
        completedEvidence,
        href: null,
        nextWorkout: input.nextWorkout,
        nextWorkoutIsoDay: input.nextWorkoutIsoDay,
      }
    }
    return {
      state: 'rest',
      workout: null,
      completedEvidence,
      href: null,
      nextWorkout: input.nextWorkout,
      nextWorkoutIsoDay: input.nextWorkoutIsoDay,
    }
  }

  if (input.hasSessionToday && !input.isCompletedToday) {
    return {
      state: 'completed-for-today',
      workout: input.todayWorkout,
      completedEvidence,
      href: null,
      nextWorkout: input.nextWorkout,
      nextWorkoutIsoDay: input.nextWorkoutIsoDay,
    }
  }

  return {
    state: input.isCompletedToday ? 'completed' : 'available',
    workout: input.todayWorkout,
    completedEvidence,
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
    }
  }
  if (input.activeAdjustmentCount > 0) {
    return {
      kind: 'plan-adjustment',
      adjustmentCount: input.activeAdjustmentCount,
      href: '/plan',
    }
  }
  if (input.dailyBriefMessage) {
    return {
      kind: 'daily-brief',
      message: input.dailyBriefMessage,
      href: null,
    }
  }
  if (input.nextWorkout) {
    return {
      kind: 'prepare-next',
      workout: input.nextWorkout,
      isoDay: input.nextWorkoutIsoDay,
      href: '/plan',
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
  const notice = selectDashboardNotice(input)

  return {
    notice,
    noticePlacement: notice ? dashboardNoticePlacement(notice.kind) : null,
    today: deriveToday(input),
    weekly: {
      days: normalizedDays,
      timeline: buildDashboardTimeline(normalizedDays),
      completed: normalizedDays.filter(day => day.hasTrainingEvidence).length,
      scheduled: normalizedDays.filter(day => day.scheduledWorkout).length,
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
