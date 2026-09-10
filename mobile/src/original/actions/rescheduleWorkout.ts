import { getLocalDateString, resolveUserTimeZone } from '@/lib/workouts/schedule'
import { civilWeekday, isCivilDate, rescheduleReason, type LocalWorkoutSchedule } from '@/lib/workouts/occurrences'
import type { RescheduleWorkoutInput, RescheduleWorkoutResult } from '@/app/actions/rescheduleWorkout'
import { mutate, owner, ownedPlan, ownedWorkout, profile, uuid, type State } from './state'
export type { RescheduleWorkoutInput, RescheduleWorkoutResult } from '@/app/actions/rescheduleWorkout'

export function scheduleInState(state: State): LocalWorkoutSchedule {
  return { overrides: state.tables.workout_schedule_overrides ?? [], logs: state.tables.progress_logs ?? [], authorizations: state.tables.session_authorizations ?? [] } as LocalWorkoutSchedule
}
export function rescheduleInState(state: State, input: RescheduleWorkoutInput, now = new Date()): RescheduleWorkoutResult {
  const fail = (error: string): RescheduleWorkoutResult => ({ success: false, error })
  if (input.accountId !== owner(state) || !uuid(input.planId) || !uuid(input.workoutId) || !isCivilDate(input.sourceDate) || (input.targetDate !== null && !isCivilDate(input.targetDate))) return fail('La cuenta o las fechas no son válidas. Vuelve a abrir el plan.')
  let plan, workout
  try { plan = ownedPlan(state, input.planId); workout = ownedWorkout(state, input.workoutId, plan.id) } catch { return fail('Esta rutina ya no está disponible en tu plan activo.') }
  if (!plan.is_active) return fail('Solo puedes reprogramar tu plan activo.')
  const schedule = scheduleInState(state)
  const existing = schedule.overrides.find(row => row.workout_id === workout.id && row.source_date === input.sourceDate)
  if (!existing && civilWeekday(input.sourceDate) !== workout.day_of_week) return fail('La fecha original no corresponde a esta rutina.')
  const timeZone = resolveUserTimeZone(profile(state).timezone)
  const targetDate = input.targetDate ?? input.sourceDate
  const occurrence = { workoutId: workout.id, sourceDate: input.sourceDate, scheduledDate: existing?.target_date ?? input.sourceDate }
  const reason = rescheduleReason({ occurrence, targetDate, workouts: (state.tables.workouts ?? []).filter(row => row.plan_id === plan.id && row.user_id === owner(state)) as any, schedule, today: getLocalDateString(now, timeZone), timeZone, now, reverting: input.targetDate === null })
  if (reason) return fail(reason)
  if (targetDate === input.sourceDate) {
    if (existing) state.tables.workout_schedule_overrides = (state.tables.workout_schedule_overrides ?? []).filter(row => row !== existing)
  } else if (existing) {
    if (existing.target_date !== targetDate) Object.assign(existing, { target_date: targetDate, policy_timezone: timeZone, updated_at: now.toISOString() })
  } else {
    (state.tables.workout_schedule_overrides ??= []).push({ id: crypto.randomUUID(), user_id: owner(state), plan_id: plan.id, workout_id: workout.id, source_date: input.sourceDate, target_date: targetDate, policy_timezone: timeZone, created_at: now.toISOString(), updated_at: now.toISOString() })
  }
  return { success: true, scheduledDate: targetDate, reverted: targetDate === input.sourceDate }
}
export async function rescheduleWorkout(input: RescheduleWorkoutInput): Promise<RescheduleWorkoutResult> {
  try { return await mutate(state => rescheduleInState(state, input)) }
  catch { return { success: false, error: 'No se pudo guardar el cambio de fecha en este dispositivo. Reintenta.' } }
}
