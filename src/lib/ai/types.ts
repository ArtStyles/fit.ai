/** Profile and catalog shapes shared by exercise filtering and the plan engine. */

export interface UserContext {
  fitness_level: 'beginner' | 'intermediate' | 'advanced'
  primary_goal:
    | 'lose_weight'
    | 'build_muscle'
    | 'gain_strength'
    | 'improve_endurance'
    | 'stay_active'
  days_per_week: number
  session_duration_minutes: number
  gym_type: 'home_no_equipment' | 'home_basic' | 'full_gym'
  available_equipment: string[]
  injuries: string
  gender: string
  weight_kg: number | null
  age: number | null
}

export interface FilteredExercise {
  id: string
  name: string
  muscle_groups: string[]
  equipment: string[]
  exercise_type: string
  difficulty: string | null
  is_compound: boolean
  movement_patterns?: string[]
  cardio_modality?: string | null
  impact_level?: string | null
  joint_stress_tags?: string[]
}
