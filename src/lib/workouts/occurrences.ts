import { getLocalDateString, WORKOUT_ACCESS_POLICY, type WorkoutStartWindow } from './schedule'

export type ScheduledWorkout = { id: string; day_of_week: number | null }
export type ScheduleOverride = { workout_id: string; source_date: string; target_date: string }
export type WorkoutOccurrence = { workoutId: string; sourceDate: string; scheduledDate: string }
export type OccurrenceLog = { workout_id: string | null; completed_at: string; occurrence_source_date?: string | null }
export type OccurrenceAuthorization = {
  workout_id: string; occurrence_source_date?: string | null; policy_date: string; policy_timezone?: string
  workout_window_start: string; expires_at: string; consumed_at?: string | null; released_at?: string | null
}
export type LocalWorkoutSchedule = {
  overrides: ScheduleOverride[]; logs: OccurrenceLog[]; authorizations: OccurrenceAuthorization[]
}

export function isCivilDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const date = new Date(`${value}T12:00:00Z`)
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
}
export function addCivilDays(value: string, days: number): string {
  if (!isCivilDate(value)) throw new Error('Fecha inválida.')
  const date = new Date(`${value}T12:00:00Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}
export function civilDaysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86400000)
}
export function civilWeekday(date: string): number {
  return new Date(`${date}T12:00:00Z`).getUTCDay() || 7
}
export function resolveOccurrences(workouts: ScheduledWorkout[], overrides: ScheduleOverride[], from: string, to: string): WorkoutOccurrence[] {
  if (!isCivilDate(from) || !isCivilDate(to) || from > to || civilDaysBetween(from, to) > 370) return []
  const valid = overrides.filter(row => isCivilDate(row.source_date) && isCivilDate(row.target_date) && workouts.some(workout => workout.id === row.workout_id))
  const replaced = new Set(valid.map(row => `${row.workout_id}:${row.source_date}`))
  const result: WorkoutOccurrence[] = []
  for (let date = from; date <= to; date = addCivilDays(date, 1)) {
    for (const workout of workouts) if (workout.day_of_week === civilWeekday(date) && !replaced.has(`${workout.id}:${date}`)) {
      result.push({ workoutId: workout.id, sourceDate: date, scheduledDate: date })
    }
  }
  for (const row of valid) if (row.target_date >= from && row.target_date <= to) result.push({ workoutId: row.workout_id, sourceDate: row.source_date, scheduledDate: row.target_date })
  return result.sort((a, b) => a.scheduledDate.localeCompare(b.scheduledDate) || a.workoutId.localeCompare(b.workoutId))
}
export function getOccurrenceWindow(occurrence: WorkoutOccurrence, today: string): WorkoutStartWindow {
  const daysLate = civilDaysBetween(occurrence.scheduledDate, today)
  if (daysLate === 0) return { status: 'today' }
  if (daysLate >= 1 && daysLate <= WORKOUT_ACCESS_POLICY.missedWorkoutRecoveryDays) return { status: 'recoverable', daysLate, scheduledDate: occurrence.scheduledDate }
  return { status: 'unavailable' }
}
export function occurrenceCompleted(occurrence: WorkoutOccurrence, logs: OccurrenceLog[], timeZone: string): boolean {
  return logs.some(log => {
    if (log.workout_id !== occurrence.workoutId) return false
    if (log.occurrence_source_date) return log.occurrence_source_date === occurrence.sourceDate
    const date = getLocalDateString(new Date(log.completed_at), timeZone)
    return date >= occurrence.scheduledDate && date <= addCivilDays(occurrence.scheduledDate, 2)
  })
}
export function occurrenceStarted(occurrence: WorkoutOccurrence, authorizations: OccurrenceAuthorization[], timeZone: string, now: Date): boolean {
  return authorizations.some(row => {
    if (row.workout_id !== occurrence.workoutId || row.released_at || (!row.consumed_at && Date.parse(row.expires_at) <= now.getTime())) return false
    if (row.occurrence_source_date) return row.occurrence_source_date === occurrence.sourceDate
    return getLocalDateString(new Date(row.workout_window_start), row.policy_timezone ?? timeZone) === occurrence.scheduledDate
  })
}

/** Optional data only exists in the Android local runtime. Web performs no new query. */
export async function loadLocalWorkoutSchedule(client: { from(table: string): any }, userId: string): Promise<LocalWorkoutSchedule | undefined> {
  if (process.env.NEXT_PUBLIC_LOCAL_APP !== 'true') return undefined
  const results = await Promise.all(['workout_schedule_overrides', 'progress_logs', 'session_authorizations'].map(table => client.from(table).select('*').eq('user_id', userId)))
  if (results.some(result => result.error)) throw new Error('No se pudo leer el calendario local.')
  return { overrides: results[0].data ?? [], logs: results[1].data ?? [], authorizations: results[2].data ?? [] }
}

export function rescheduleReason({ occurrence, targetDate, workouts, schedule, today, timeZone, now, reverting = false }: {
  occurrence: WorkoutOccurrence; targetDate: string; workouts: ScheduledWorkout[]; schedule: LocalWorkoutSchedule; today: string; timeZone: string; now: Date; reverting?: boolean
}): string | null {
  if (!isCivilDate(targetDate) || !isCivilDate(occurrence.sourceDate)) return 'Selecciona una fecha válida.'
  if (occurrence.sourceDate < addCivilDays(today, -2) || occurrence.sourceDate > addCivilDays(today, 7)) return 'La fecha original está fuera del intervalo disponible.'
  if (occurrence.scheduledDate < addCivilDays(today, -2)) return 'Esta sesión ya quedó fuera de la recuperación de 2 días.'
  if (targetDate < (reverting ? addCivilDays(today, -2) : today) || targetDate > addCivilDays(today, 7)) return 'Elige entre hoy y los próximos 7 días.'
  if (occurrenceCompleted(occurrence, schedule.logs, timeZone) || occurrenceStarted(occurrence, schedule.authorizations, timeZone, now)) return 'Esta sesión ya fue iniciada o completada.'
  const others = resolveOccurrences(workouts, schedule.overrides, addCivilDays(targetDate, -2), addCivilDays(targetDate, 2))
    .filter(row => row.workoutId !== occurrence.workoutId || row.sourceDate !== occurrence.sourceDate)
  if (others.some(row => row.scheduledDate === targetDate)) return 'Ya hay una rutina programada en esa fecha.'
  if (others.some(row => row.workoutId === occurrence.workoutId)) return 'Esa fecha se solapa con la recuperación de otra sesión de esta rutina.'
  if (schedule.logs.some(log => getLocalDateString(new Date(log.completed_at), timeZone) === targetDate)) return 'Ya registraste una sesión en esa fecha.'
  if (schedule.authorizations.some(row => row.policy_date === targetDate && !row.released_at && (row.consumed_at || Date.parse(row.expires_at) > now.getTime()))) return 'Ya tienes una sesión iniciada o registrada en esa fecha.'
  return null
}

export type SchedulePresentation = {
  today: string
  startableWorkoutIds: string[]
  occurrences: Array<WorkoutOccurrence & { workoutName: string; targets: Array<{ date: string; reason: string | null }>; revertReason: string | null }>
}
export function buildSchedulePresentation(workouts: Array<ScheduledWorkout & { name: string }>, schedule: LocalWorkoutSchedule, now: Date, timeZone: string): SchedulePresentation {
  const today = getLocalDateString(now, timeZone)
  const occurrences = resolveOccurrences(workouts, schedule.overrides, addCivilDays(today, -9), addCivilDays(today, 14))
    .filter(row => (row.sourceDate >= addCivilDays(today, -2) && row.sourceDate <= addCivilDays(today, 7))
      || (row.sourceDate !== row.scheduledDate && row.scheduledDate >= addCivilDays(today, -2) && row.scheduledDate <= addCivilDays(today, 7)))
  const hasSessionToday = schedule.logs.some(log => getLocalDateString(new Date(log.completed_at), timeZone) === today)
    || schedule.authorizations.some(row => row.policy_date === today && row.consumed_at)
  return {
    today,
    startableWorkoutIds: hasSessionToday ? [] : occurrences.filter(row => getOccurrenceWindow(row, today).status !== 'unavailable' && !occurrenceCompleted(row, schedule.logs, timeZone)).map(row => row.workoutId),
    occurrences: occurrences.map(occurrence => ({ ...occurrence,
      workoutName: workouts.find(workout => workout.id === occurrence.workoutId)!.name,
      targets: Array.from({ length: 8 }, (_, day) => {
        const date = addCivilDays(today, day)
        return { date, reason: rescheduleReason({ occurrence, targetDate: date, workouts, schedule, today, timeZone, now }) }
      }),
      revertReason: rescheduleReason({ occurrence, targetDate: occurrence.sourceDate, workouts, schedule, today, timeZone, now, reverting: true }),
    })),
  }
}
