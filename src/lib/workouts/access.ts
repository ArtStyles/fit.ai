import { canStartWorkoutToday, getLocalDayBounds } from './schedule'

export type WorkoutStartAccessReason =
  | 'not_found'
  | 'not_today'
  | 'inactive_plan'
  | 'completed_today'

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
}: {
  supabase: SupabaseLike
  userId: string
  workoutId: string
  date?: Date
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

  if (!workout.plan_id || !canStartWorkoutToday(workout.day_of_week, date)) {
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

  const { start, end } = getLocalDayBounds(date)
  const { data: existingLog } = await (supabase
    .from('progress_logs') as any)
    .select('id')
    .eq('user_id', userId)
    .eq('workout_id', workoutId)
    .gte('completed_at', start.toISOString())
    .lt('completed_at', end.toISOString())
    .limit(1) as { data: { id: string }[] | null }

  if ((existingLog?.length ?? 0) > 0) {
    return { allowed: false, reason: 'completed_today', workout }
  }

  return { allowed: true, workout }
}
