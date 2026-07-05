import { redirect } from 'next/navigation'
import { requireAppUserContext } from '@/lib/auth/server'
import { getIsoWeekday, resolveUserTimeZone } from '@/lib/workouts/schedule'

type ActivePlanRow = {
  id: string
}

type TodayWorkoutRow = {
  id: string
}

export default async function TrainPage() {
  const { supabase, user, profile } = await requireAppUserContext()
  const timeZone = resolveUserTimeZone(profile.timezone)
  const todayIso = getIsoWeekday(new Date(), timeZone)

  const { data: activePlan } = await supabase
    .from('workout_plans')
    .select('id')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle() as unknown as { data: ActivePlanRow | null }

  if (!activePlan) {
    redirect('/dashboard?notice=no-workout-today')
  }

  const { data: todayWorkout } = await supabase
    .from('workouts')
    .select('id')
    .eq('user_id', user.id)
    .eq('plan_id', activePlan.id)
    .eq('day_of_week', todayIso)
    .order('order_in_plan')
    .limit(1)
    .maybeSingle() as unknown as { data: TodayWorkoutRow | null }

  if (!todayWorkout) {
    redirect('/dashboard?notice=no-workout-today')
  }

  redirect(`/session/${todayWorkout.id}`)
}
