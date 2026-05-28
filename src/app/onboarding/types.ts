export interface OnboardingAnswers {
  goal: string | null
  fitness_level: string | null
  days_per_week: number | null
  session_duration: number | null
  gym_type: string | null
  equipment: string[]
  injuries: string
  age: string
  weight_kg: string
  height_cm: string
  gender: string | null
}

export const defaultAnswers: OnboardingAnswers = {
  goal: null,
  fitness_level: null,
  days_per_week: null,
  session_duration: null,
  gym_type: null,
  equipment: [],
  injuries: '',
  age: '',
  weight_kg: '',
  height_cm: '',
  gender: null,
}
