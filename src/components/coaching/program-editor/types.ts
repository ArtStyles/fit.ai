export type SaveState = 'saved' | 'dirty' | 'saving' | 'error'

export type ProgramTemplateView = {
  id: string
  name: string
  goal: string | null
  description: string | null
  days_per_week: number
  status: 'draft' | 'active' | 'archived'
}

export type TemplateExerciseView = {
  id: string
  exercise_id: string
  order_index: number
  sets: number
  reps: number
  weight_kg: number | null
  target_rpe: number | null
  rest_seconds: number
  notes: string | null
  exercise?: {
    name: string
    muscle_groups?: string[] | null
    equipment?: string[] | null
    image_url?: string | null
  } | null
}

export type TemplateWorkoutView = {
  id: string
  name: string
  day_of_week: number
  order_in_plan: number
  exercises: TemplateExerciseView[]
}

export type RoutineSummary = {
  days: number
  exercises: number
  sets: number
  estimatedMinutes: number
}
