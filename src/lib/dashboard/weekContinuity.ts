import { resolveOccurrences, occurrenceCompleted, addCivilDays, civilWeekday, isCivilDate, type LocalWorkoutSchedule, type OccurrenceLog } from '@/lib/workouts/occurrences'
import { parseSessionContextSnapshot } from '@/lib/session/contextSnapshot'
import { toCompletedSessionPresentation, type CompletedSessionWorkoutRelation } from '@/lib/session/historyRows'
import { getLocalDateString, WORKOUT_ACCESS_POLICY } from '@/lib/workouts/schedule'

export type WeekContinuityWorkout = {
  id: string
  name: string
  focus: string | null
  day_of_week: number | null
}

export type WeekContinuityLog = OccurrenceLog & {
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
  sourceDate?: string | null
  completedDate?: string
  isFromActivePlan?: boolean
}

export type WeekContinuityDay<TWorkout extends WeekContinuityWorkout> = WeekContinuityDate & {
  scheduledWorkout: TWorkout | null
  completedEvidence: CompletedTrainingEvidence | null
  completionOnAnotherDate: CompletedTrainingEvidence | null
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

/** Prefer frozen occurrence identity. Older snapshots only imply recovery within
 * the supported window; names and the current weekly plan are not date evidence. */
function completionSource(log: WeekContinuityLog, schedule: LocalWorkoutSchedule | undefined, timeZone: string) {
  const stored = schedule?.logs.find(row => row.id === log.id || (!row.id && row.workout_id === log.workout_id && row.completed_at === log.completed_at))
  const clientSessionId = stored?.client_session_id ?? log.client_session_id
  const lease = clientSessionId ? schedule?.authorizations.find(row => row.client_session_id === clientSessionId && row.workout_id === log.workout_id && row.consumed_at) : undefined
  const source = stored?.occurrence_source_date ?? log.occurrence_source_date ?? lease?.occurrence_source_date
  const scheduled = stored?.occurrence_scheduled_date ?? log.occurrence_scheduled_date ?? lease?.occurrence_scheduled_date
  if (isCivilDate(source)) return { sourceDate: source, scheduledDate: isCivilDate(scheduled) ? scheduled : source }
  if (lease && Number.isFinite(Date.parse(lease.workout_window_start))) {
    const date = getLocalDateString(new Date(lease.workout_window_start), lease.policy_timezone ?? timeZone)
    return { sourceDate: date, scheduledDate: date }
  }
  const snapshot = parseSessionContextSnapshot(log.session_context_snapshot)
  const weekday = snapshot?.workout.dayOfWeek
  if (weekday) {
    const completedDate = getLocalDateString(new Date(log.completed_at), timeZone)
    const daysLate = (civilWeekday(completedDate) - weekday + 7) % 7
    if (daysLate <= WORKOUT_ACCESS_POLICY.missedWorkoutRecoveryDays) {
      const date = addCivilDays(completedDate, -daysLate)
      return { sourceDate: date, scheduledDate: date }
    }
  }
  return { sourceDate: null, scheduledDate: null }
}

export function buildWeekContinuity<TWorkout extends WeekContinuityWorkout>({
  activeWorkouts,
  weekLogs,
  dates,
  today,
  timeZone = 'America/Havana',
  fallbackWorkoutName = 'Workout',
  localSchedule,
}: {
  activeWorkouts: TWorkout[]
  weekLogs: WeekContinuityLog[]
  dates: WeekContinuityDate[]
  today: string
  timeZone?: string
  fallbackWorkoutName?: string
  localSchedule?: LocalWorkoutSchedule
}): Array<WeekContinuityDay<TWorkout>> {
  const logsByDate = new Map<string, WeekContinuityLog[]>()
  for (const log of weekLogs) {
    const dateStr = getLocalDateString(new Date(log.completed_at), timeZone)
    const logs = logsByDate.get(dateStr) ?? []
    logs.push(log)
    logsByDate.set(dateStr, logs)
  }
  Array.from(logsByDate.values()).forEach(logs => logs.sort(compareLogsNewestFirst))
  const completions = [...weekLogs].sort(compareLogsNewestFirst).map(log => ({
    log,
    ...completionSource(log, localSchedule, timeZone),
    completedDate: getLocalDateString(new Date(log.completed_at), timeZone),
  }))
  const occurrenceLogs = localSchedule?.logs.map(log => ({
    ...log,
    occurrence_source_date: completions.find(row => row.log.id === log.id
      || (!log.id && row.log.workout_id === log.workout_id && row.log.completed_at === log.completed_at))?.sourceDate ?? log.occurrence_source_date,
  }))
  const evidence = (log: WeekContinuityLog): CompletedTrainingEvidence => {
    const completion = completions.find(row => row.log.id === log.id)!
    const activeWorkout = activeWorkouts.find(workout => workout.id === log.workout_id)
    return {
      ...toEvidence({ ...log, workout: log.workout ?? activeWorkout ?? null }, fallbackWorkoutName),
      sourceDate: completion.sourceDate,
      completedDate: completion.completedDate,
      isFromActivePlan: Boolean(activeWorkout),
    }
  }

  return dates.map(date => {
    const occurrence = localSchedule ? resolveOccurrences(activeWorkouts, localSchedule.overrides, date.dateStr, date.dateStr)[0] : undefined
    const scheduledWorkout = activeWorkouts.find(workout => localSchedule ? workout.id === occurrence?.workoutId : workout.day_of_week === date.isoDay) ?? null
    const scheduledCompletion = completions.find(row => row.log.workout_id === scheduledWorkout?.id
      && row.sourceDate === (occurrence?.sourceDate ?? date.dateStr))
    const alreadyCompleted = Boolean(scheduledCompletion || (occurrence && occurrenceLogs && occurrenceCompleted(occurrence, occurrenceLogs, timeZone)))
    const otherDateCompletion = completions.find(row => row.completedDate !== date.dateStr
      && (row.sourceDate === date.dateStr || row === scheduledCompletion))
    const dayLogs = logsByDate.get(date.dateStr) ?? []
    const scheduledLog = scheduledWorkout
      ? dayLogs.find(log => log.workout_id === scheduledWorkout.id && (() => {
        const sourceDate = completions.find(row => row.log.id === log.id)?.sourceDate
        return !sourceDate || sourceDate === (occurrence?.sourceDate ?? date.dateStr)
      })())
      : undefined
    const evidenceLog = scheduledLog ?? dayLogs[0]

    return {
      ...date,
      scheduledWorkout,
      completedEvidence: evidenceLog ? evidence(evidenceLog) : null,
      completionOnAnotherDate: otherDateCompletion ? evidence(otherDateCompletion.log) : null,
      isScheduledWorkoutCompleted: Boolean(scheduledLog) || alreadyCompleted,
      hasTrainingEvidence: dayLogs.length > 0,
      canStartScheduledWorkout: Boolean(scheduledWorkout) && dayLogs.length === 0 && !alreadyCompleted,
      isToday: date.dateStr === today,
    }
  })
}
