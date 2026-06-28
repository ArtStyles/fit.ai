// Construye los payloads de inserción para clonar una rutina (snapshot) a las
// tablas del usuario. Puro: la Server Action orquesta las inserciones reales.

import type { RoutineSnapshot, RoutineSnapshotWorkout } from './snapshots'

export interface PlanInsert {
  user_id: string
  name: string
  goal: string | null
  days_per_week: number | null
  difficulty: string | null
  generated_by_ai: boolean
  is_active: boolean
  source_type: 'shared_post'
  source_post_id: string
  source_user_id: string | null
}
export interface WorkoutInsert {
  plan_id: string
  user_id: string
  name: string
  day_of_week: number | null
  order_in_plan: number
}
export interface WorkoutExerciseInsert {
  workout_id: string
  exercise_id: string
  order_index: number
  sets: number | null
  reps: number | null
  rest_seconds: number | null
  weight_kg: number | null
}

export function buildPlanInsert(
  snapshot: RoutineSnapshot,
  userId: string,
  source: { postId: string; userId: string | null },
): PlanInsert {
  return {
    user_id: userId,
    name: snapshot.name,
    goal: snapshot.goal,
    days_per_week: snapshot.days_per_week,
    difficulty: snapshot.difficulty,
    generated_by_ai: false,
    is_active: false,
    source_type: 'shared_post',
    source_post_id: source.postId,
    source_user_id: source.userId,
  }
}

export function buildWorkoutInsert(
  workout: RoutineSnapshotWorkout,
  planId: string,
  userId: string,
  orderInPlan: number,
): WorkoutInsert {
  return {
    plan_id: planId,
    user_id: userId,
    name: workout.name,
    day_of_week: workout.day_of_week,
    order_in_plan: orderInPlan,
  }
}

export function buildWorkoutExerciseInserts(
  workout: RoutineSnapshotWorkout,
  workoutId: string,
): WorkoutExerciseInsert[] {
  return workout.exercises.map(e => ({
    workout_id: workoutId,
    exercise_id: e.exercise_id,
    order_index: e.order_index,
    sets: e.sets,
    reps: e.reps,
    rest_seconds: e.rest_seconds,
    weight_kg: e.weight_kg,
  }))
}
