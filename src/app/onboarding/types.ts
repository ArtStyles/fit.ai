export interface OnboardingAnswers {
  goal: string | null
  fitness_level: string | null
  days_per_week: number | null
  session_duration: number | null
  gym_type: string | null
  equipment: string[]
  injuries: string
  cardio_preferences: Array<'walking' | 'running' | 'cycling' | 'elliptical' | 'rowing' | 'stairs' | 'jump_rope'>
  activity_level: 'inactive' | 'insufficiently_active' | 'regularly_active' | null
  warning_symptoms: string[]
  known_disease: boolean
  medically_cleared: boolean
  recent_surgery: boolean
  limitation_regions: string[]
  limitation_status: 'stable' | 'acute' | 'recovering' | null
  movements_to_avoid: string
  clinician_cleared: boolean
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
  cardio_preferences: [],
  activity_level: null,
  warning_symptoms: [],
  known_disease: false,
  medically_cleared: false,
  recent_surgery: false,
  limitation_regions: [],
  limitation_status: null,
  movements_to_avoid: '',
  clinician_cleared: false,
  age: '',
  weight_kg: '',
  height_cm: '',
  gender: null,
}
