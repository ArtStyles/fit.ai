/** Read-only production audit for the plan engine and exercise taxonomy. */

import { createClient } from '@supabase/supabase-js'
import type { Database } from '../src/types/database'

type PlanAuditRow = { id: string; user_id: string; is_active: boolean }
type WorkoutAuditRow = { id: string; plan_id: string }
type WorkoutExerciseAuditRow = { workout_id: string }

async function main(): Promise<void> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) throw new Error('Missing Supabase audit credentials')

  const supabase = createClient<Database>(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const [exerciseResult, planResult, metricsResult] = await Promise.all([
    supabase
      .from('exercises')
      .select('exercise_type, movement_patterns, cardio_modality')
      .eq('is_public', true)
      .range(0, 1999),
    supabase
      .from('workout_plans')
      .select('id, user_id, is_active')
      .eq('source_type', 'engine')
      .order('created_at', { ascending: false })
      .limit(200),
    supabase.from('plan_generation_health_daily').select('*').limit(30),
  ])

  if (exerciseResult.error) throw new Error(`Catalog audit failed: ${exerciseResult.error.message}`)
  if (planResult.error) throw new Error(`Plan audit failed: ${planResult.error.message}`)
  if (metricsResult.error) throw new Error(`Metrics view unavailable: ${metricsResult.error.message}`)

  const catalog = exerciseResult.data ?? []
  const enginePlans = planResult.data as unknown as PlanAuditRow[]
  const planIds = enginePlans.map(plan => plan.id)

  let workouts: WorkoutAuditRow[] = []
  let workoutExercises: WorkoutExerciseAuditRow[] = []
  if (planIds.length > 0) {
    const workoutResult = await supabase.from('workouts').select('id, plan_id').in('plan_id', planIds)
    if (workoutResult.error) throw new Error(`Workout audit failed: ${workoutResult.error.message}`)
    workouts = workoutResult.data as unknown as WorkoutAuditRow[]

    const workoutIds = workouts.map(workout => workout.id)
    if (workoutIds.length > 0) {
      const exerciseRowsResult = await supabase
        .from('workout_exercises')
        .select('workout_id')
        .in('workout_id', workoutIds)
      if (exerciseRowsResult.error) throw new Error(`Workout exercise audit failed: ${exerciseRowsResult.error.message}`)
      workoutExercises = exerciseRowsResult.data as unknown as WorkoutExerciseAuditRow[]
    }
  }

  const strength = catalog.filter(row => row.exercise_type === 'strength')
  const cardio = catalog.filter(row => row.exercise_type === 'cardio')
  const strengthClassified = strength.filter(row => row.movement_patterns.length > 0).length
  const cardioClassified = cardio.filter(row => row.cardio_modality !== null).length
  const workoutCountByPlan = new Map<string, number>()
  const exerciseCountByWorkout = new Map<string, number>()
  for (const workout of workouts) workoutCountByPlan.set(workout.plan_id, (workoutCountByPlan.get(workout.plan_id) ?? 0) + 1)
  for (const row of workoutExercises) exerciseCountByWorkout.set(row.workout_id, (exerciseCountByWorkout.get(row.workout_id) ?? 0) + 1)

  const emptyPlanCount = enginePlans.filter(plan =>
    (workoutCountByPlan.get(plan.id) ?? 0) === 0 || workouts
      .filter(workout => workout.plan_id === plan.id)
      .some(workout => (exerciseCountByWorkout.get(workout.id) ?? 0) === 0),
  ).length
  const activeByUser = new Map<string, number>()
  for (const plan of enginePlans) {
    if (!plan.is_active) continue
    activeByUser.set(plan.user_id, (activeByUser.get(plan.user_id) ?? 0) + 1)
  }
  const usersWithMultipleActivePlans = Array.from(activeByUser.values()).filter(count => count > 1).length

  console.log(JSON.stringify({
    catalog: {
      publicExercises: catalog.length,
      strengthCoverage: `${strengthClassified}/${strength.length}`,
      cardioCoverage: `${cardioClassified}/${cardio.length}`,
    },
    plans: {
      recentEnginePlansChecked: enginePlans.length,
      emptyPlanCount,
      usersWithMultipleActivePlans,
    },
    dailyMetrics: metricsResult.data,
  }, null, 2))

  const strengthCoverage = strength.length > 0 ? strengthClassified / strength.length : 0
  const cardioCoverage = cardio.length > 0 ? cardioClassified / cardio.length : 0
  if (strengthCoverage < 0.95 || cardioCoverage < 0.8 || emptyPlanCount > 0 || usersWithMultipleActivePlans > 0) {
    process.exitCode = 1
  }
}

void main().catch(error => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
