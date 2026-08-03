import { addDays, getAppTimeZone, getLocalDayBounds, getWorkoutStartWindow } from './schedule'
import type { WorkoutStartWindow } from './schedule'

export type WorkoutStartAccessReason =
  | 'not_found'
  | 'not_today'
  | 'inactive_plan'
  | 'completed_today'
  | 'already_completed'
  | 'another_session_today'

export type WorkoutStartAccessWorkout = {
  id: string
  name: string
  estimated_duration_minutes: number | null
  focus: string | null
  day_of_week: number | null
  plan_id: string | null
}

export type WorkoutStartAccessResult =
  | {
      allowed: true
      workout: WorkoutStartAccessWorkout
      window: WorkoutStartWindow
    }
  | {
      allowed: false
      reason: WorkoutStartAccessReason
      workout?: WorkoutStartAccessWorkout
    }

type SupabaseLike = {
  from: (table: string) => any
}

export async function getWorkoutStartAccess({
  supabase,
  userId,
  workoutId,
  date = new Date(),
  timeZone = getAppTimeZone(),
}: {
  supabase: SupabaseLike
  userId: string
  workoutId: string
  date?: Date
  timeZone?: string
}): Promise<WorkoutStartAccessResult> {
  const { data: workout } = await (supabase
    .from('workouts') as any)
    .select('id, name, estimated_duration_minutes, focus, day_of_week, plan_id')
    .eq('id', workoutId)
    .eq('user_id', userId)
    .maybeSingle() as { data: WorkoutStartAccessWorkout | null }

  if (!workout) {
    return { allowed: false, reason: 'not_found' }
  }

  const window = getWorkoutStartWindow(workout.day_of_week, date, timeZone)

  if (!workout.plan_id || window.status === 'unavailable') {
    return { allowed: false, reason: 'not_today', workout }
  }

  const { data: activePlan } = await (supabase
    .from('workout_plans') as any)
    .select('id')
    .eq('id', workout.plan_id)
    .eq('user_id', userId)
    .eq('is_active', true)
    .maybeSingle() as { data: { id: string } | null }

  if (!activePlan) {
    return { allowed: false, reason: 'inactive_plan', workout }
  }

  const { start: todayStart, end: todayEnd } = getLocalDayBounds(date, timeZone)
  const windowStart = window.status === 'recoverable'
    ? getLocalDayBounds(addDays(date, -window.daysLate, timeZone), timeZone).start
    : todayStart

  // ¿Esta rutina ya fue registrada desde su día programado?
  const { data: existingLog } = await (supabase
    .from('progress_logs') as any)
    .select('id')
    .eq('user_id', userId)
    .eq('workout_id', workoutId)
    .gte('completed_at', windowStart.toISOString())
    .lt('completed_at', todayEnd.toISOString())
    .limit(1) as { data: { id: string }[] | null }

  if ((existingLog?.length ?? 0) > 0) {
    return {
      allowed: false,
      reason: window.status === 'today' ? 'completed_today' : 'already_completed',
      workout,
    }
  }

  // Máximo una sesión por día, sin importar qué rutina sea.
  const { data: todaySession } = await (supabase
    .from('progress_logs') as any)
    .select('id')
    .eq('user_id', userId)
    .gte('completed_at', todayStart.toISOString())
    .lt('completed_at', todayEnd.toISOString())
    .limit(1) as { data: { id: string }[] | null }

  if ((todaySession?.length ?? 0) > 0) {
    return { allowed: false, reason: 'another_session_today', workout }
  }

  return { allowed: true, workout, window }
}
