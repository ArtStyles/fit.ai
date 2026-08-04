import { toCompletedSessionPresentation, type CompletedSessionWorkoutRelation } from '@/lib/session/historyRows'
import { getLocalDateString } from '@/lib/workouts/schedule'

export type WeekContinuityWorkout = {
  id: string
  name: string
  focus: string | null
  day_of_week: number | null
}

export type WeekContinuityLog = {
  id: string
  workout_id: string | null
  completed_at: string
  duration_minutes: number | null
  session_context_snapshot: unknown
  workout?: CompletedSessionWorkoutRelation | CompletedSessionWorkoutRelation[] | null
}

export type WeekContinuityDate = {
  isoDay: number
  dateStr: string
}

export type CompletedTrainingEvidence = {
  logId: string
  workoutId: string | null
  workoutName: string
  focus: string | null
  durationMinutes: number
  completedAt: string
  source: 'snapshot' | 'workout' | 'fallback'
}

export type WeekContinuityDay<TWorkout extends WeekContinuityWorkout> = WeekContinuityDate & {
  scheduledWorkout: TWorkout | null
  completedEvidence: CompletedTrainingEvidence | null
  isScheduledWorkoutCompleted: boolean
  hasTrainingEvidence: boolean
  canStartScheduledWorkout: boolean
  isToday: boolean
}

function toEvidence(log: WeekContinuityLog, fallbackWorkoutName: string): CompletedTrainingEvidence {
  const presentation = toCompletedSessionPresentation({
    ...log,
    workout: log.workout ?? null,
  }, fallbackWorkoutName)

  return {
    logId: presentation.id,
    workoutId: presentation.workoutId,
    workoutName: presentation.workoutName,
    focus: presentation.focus,
    durationMinutes: presentation.durationMinutes,
    completedAt: presentation.completedAt,
    source: presentation.source,
  }
}

function compareLogsNewestFirst(left: WeekContinuityLog, right: WeekContinuityLog): number {
  const completedAtDifference = new Date(right.completed_at).getTime() - new Date(left.completed_at).getTime()
  if (completedAtDifference !== 0) return completedAtDifference
  return right.id.localeCompare(left.id)
}

export function buildWeekContinuity<TWorkout extends WeekContinuityWorkout>({
  activeWorkouts,
  weekLogs,
  dates,
  today,
  timeZone = 'America/Havana',
  fallbackWorkoutName = 'Workout',
}: {
  activeWorkouts: TWorkout[]
  weekLogs: WeekContinuityLog[]
  dates: WeekContinuityDate[]
  today: string
  timeZone?: string
  fallbackWorkoutName?: string
}): Array<WeekContinuityDay<TWorkout>> {
  const logsByDate = new Map<string, WeekContinuityLog[]>()
  for (const log of weekLogs) {
    const dateStr = getLocalDateString(new Date(log.completed_at), timeZone)
    const logs = logsByDate.get(dateStr) ?? []
    logs.push(log)
    logsByDate.set(dateStr, logs)
  }
  Array.from(logsByDate.values()).forEach(logs => logs.sort(compareLogsNewestFirst))

  return dates.map(date => {
    const scheduledWorkout = activeWorkouts.find(workout => workout.day_of_week === date.isoDay) ?? null
    const dayLogs = logsByDate.get(date.dateStr) ?? []
    const scheduledLog = scheduledWorkout
      ? dayLogs.find(log => log.workout_id === scheduledWorkout.id)
      : undefined
    const evidenceLog = scheduledLog ?? dayLogs[0]

    return {
      ...date,
      scheduledWorkout,
      completedEvidence: evidenceLog ? toEvidence(evidenceLog, fallbackWorkoutName) : null,
      isScheduledWorkoutCompleted: Boolean(scheduledLog),
      hasTrainingEvidence: dayLogs.length > 0,
      canStartScheduledWorkout: Boolean(scheduledWorkout) && dayLogs.length === 0,
      isToday: date.dateStr === today,
    }
  })
}
