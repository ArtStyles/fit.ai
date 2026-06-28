import { describe, it, expect } from 'vitest'
import { buildPlanInsert, buildWorkoutInsert, buildWorkoutExerciseInserts } from '../clone'
import type { RoutineSnapshot } from '../snapshots'

const snap: RoutineSnapshot = {
  name: 'Full Body', goal: 'build_muscle', days_per_week: 3, difficulty: 'intermediate',
  workouts: [
    { name: 'Día A', day_of_week: 1, exercises: [
      { exercise_id: 'e1', name: 'Press', order_index: 0, sets: 3, reps: 10, rest_seconds: 90, weight_kg: 60 },
    ]},
  ],
}

describe('buildPlanInsert', () => {
  it('crea un plan inactivo y no-IA para el usuario', () => {
    expect(buildPlanInsert(snap, 'u1', { postId: 'post1', userId: 'author1' })).toEqual({
      user_id: 'u1', name: 'Full Body', goal: 'build_muscle',
      days_per_week: 3, difficulty: 'intermediate',
      generated_by_ai: false, is_active: false,
      source_type: 'shared_post', source_post_id: 'post1', source_user_id: 'author1',
    })
  })
})

describe('buildWorkoutInsert', () => {
  it('asocia el workout al plan y al usuario con su orden', () => {
    expect(buildWorkoutInsert(snap.workouts[0], 'plan1', 'u1', 0)).toEqual({
      plan_id: 'plan1', user_id: 'u1', name: 'Día A', day_of_week: 1, order_in_plan: 0,
    })
  })
})

describe('buildWorkoutExerciseInserts', () => {
  it('re-enlaza exercise_id de la librería pública conservando series/reps', () => {
    expect(buildWorkoutExerciseInserts(snap.workouts[0], 'w1')).toEqual([
      { workout_id: 'w1', exercise_id: 'e1', order_index: 0, sets: 3, reps: 10, rest_seconds: 90, weight_kg: 60 },
    ])
  })
})
