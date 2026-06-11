/**
 * coachContextLoader.ts
 *
 * Recopila de Supabase los datos que alimentan el contexto del coach
 * (perfil, plan activo, sesiones recientes) y los compacta con
 * buildCoachContextText. Server-only; la lógica de formato vive en
 * coachContext.ts (pura y testeada).
 */

import 'server-only'
import { createClient } from '@/lib/supabase/server'
import { buildCoachContextText } from './coachContext'

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>

const RECENT_SESSIONS_LIMIT = 5

export async function loadCoachContextText(
  supabase: SupabaseServerClient,
  userId: string,
): Promise<string> {
  type ProfileRow = {
    fitness_level: string | null
    primary_goal: string | null
    days_per_week: number | null
    injuries: string | null
    weight_kg: number | null
  }
  type PlanRow = { id: string; name: string; week_number: number | null }
  type LogRow = { workout_id: string | null; completed_at: string; duration_minutes: number | null }

  const [{ data: profile }, { data: plan }, { data: logs }] = await Promise.all([
    (supabase.from('profiles') as any)
      .select('fitness_level, primary_goal, days_per_week, injuries, weight_kg')
      .eq('id', userId)
      .maybeSingle() as Promise<{ data: ProfileRow | null }>,
    (supabase.from('workout_plans') as any)
      .select('id, name, week_number')
      .eq('user_id', userId)
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle() as Promise<{ data: PlanRow | null }>,
    (supabase.from('progress_logs') as any)
      .select('workout_id, completed_at, duration_minutes')
      .eq('user_id', userId)
      .not('workout_id', 'is', null)
      .order('completed_at', { ascending: false })
      .limit(RECENT_SESSIONS_LIMIT) as Promise<{ data: LogRow[] | null }>,
  ])

  type WorkoutRow = { id: string; name: string; day_of_week: number | null }

  const logWorkoutIds = (logs ?? [])
    .map(log => log.workout_id)
    .filter((id): id is string => id !== null)

  let planWorkouts: WorkoutRow[] = []
  let exerciseCounts: Record<string, number> = {}
  let workoutNameById = new Map<string, string>()

  if (plan || logWorkoutIds.length > 0) {
    const { data: workoutRows } = await (supabase.from('workouts') as any)
      .select('id, name, day_of_week, plan_id')
      .eq('user_id', userId)
      .or([
        plan ? `plan_id.eq.${plan.id}` : null,
        logWorkoutIds.length > 0 ? `id.in.(${logWorkoutIds.join(',')})` : null,
      ].filter(Boolean).join(',')) as { data: (WorkoutRow & { plan_id: string | null })[] | null }

    const rows = workoutRows ?? []
    workoutNameById = new Map(rows.map(workout => [workout.id, workout.name]))
    planWorkouts = plan ? rows.filter(workout => workout.plan_id === plan.id) : []

    if (planWorkouts.length > 0) {
      const { data: exerciseRows } = await (supabase.from('workout_exercises') as any)
        .select('workout_id')
        .in('workout_id', planWorkouts.map(workout => workout.id)) as {
          data: { workout_id: string }[] | null
        }

      exerciseCounts = (exerciseRows ?? []).reduce<Record<string, number>>((acc, row) => {
        acc[row.workout_id] = (acc[row.workout_id] ?? 0) + 1
        return acc
      }, {})
    }
  }

  return buildCoachContextText({
    profile: {
      fitnessLevel: profile?.fitness_level ?? null,
      primaryGoal: profile?.primary_goal ?? null,
      daysPerWeek: profile?.days_per_week ?? null,
      injuries: profile?.injuries ?? null,
      weightKg: profile?.weight_kg ?? null,
    },
    activePlan: plan
      ? {
          name: plan.name,
          weekNumber: plan.week_number,
          workouts: planWorkouts.map(workout => ({
            name: workout.name,
            dayOfWeek: workout.day_of_week,
            exerciseCount: exerciseCounts[workout.id] ?? 0,
          })),
        }
      : null,
    recentSessions: (logs ?? []).map(log => ({
      workoutName: log.workout_id ? workoutNameById.get(log.workout_id) ?? null : null,
      completedAt: log.completed_at,
      durationMinutes: log.duration_minutes,
    })),
  })
}
