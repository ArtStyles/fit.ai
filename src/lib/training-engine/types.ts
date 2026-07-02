export const TRAINING_GOALS = [
  'lose_weight',
  'build_muscle',
  'gain_strength',
  'improve_endurance',
  'stay_active',
] as const

export type TrainingGoal = (typeof TRAINING_GOALS)[number]
export type FitnessLevel = 'beginner' | 'intermediate' | 'advanced'
export type GymType = 'home_no_equipment' | 'home_basic' | 'full_gym'
export type ReadinessStatus =
  | 'pending'
  | 'cleared'
  | 'modified'
  | 'professional_clearance_required'

export type CardioModality =
  | 'walking'
  | 'running'
  | 'cycling'
  | 'elliptical'
  | 'rowing'
  | 'stairs'
  | 'jump_rope'

export type MovementPattern =
  | 'squat'
  | 'hinge'
  | 'horizontal_push'
  | 'vertical_push'
  | 'horizontal_pull'
  | 'vertical_pull'
  | 'carry'
  | 'core'
  | 'isolation'
  | 'locomotion'
  | 'mobility'
  | 'balance'

export type ImpactLevel = 'low' | 'moderate' | 'high'

export interface MovementLimitation {
  region: string
  side?: 'left' | 'right' | 'both' | null
  status: 'stable' | 'acute' | 'recovering'
  movementsToAvoid: string[]
  clinicianCleared: boolean
}

export interface ReadinessProfile {
  status: ReadinessStatus
  currentlyActive: boolean
  warningSymptoms: string[]
  knownCardiovascularMetabolicOrRenalDisease: boolean
  medicallyCleared: boolean
  recentSurgery: boolean
  limitations: MovementLimitation[]
}

export interface TrainingProfile {
  language: 'es' | 'en'
  fitnessLevel: FitnessLevel
  primaryGoal: TrainingGoal
  daysPerWeek: number
  sessionDurationMinutes: number
  gymType: GymType
  availableEquipment: string[]
  preferredWorkoutDays: number[] | null
  cardioPreferences: CardioModality[]
  age: number | null
  readiness: ReadinessProfile
}

export interface EngineExercise {
  id: string
  name: string
  muscleGroups: string[]
  equipment: string[]
  exerciseType: 'strength' | 'cardio' | 'flexibility' | 'balance' | 'hiit'
  difficulty: FitnessLevel | null
  isCompound: boolean
  movementPatterns: MovementPattern[]
  cardioModality: CardioModality | null
  impactLevel: ImpactLevel | null
  jointStressTags: string[]
}

export interface PlanExercise {
  exercise_id: string
  sets: number
  reps: number | null
  duration_seconds: number | null
  rest_seconds: number
  target_rpe: number
  weight_kg: number | null
  weight_suggestion_basis:
    | 'user_baseline_pending'
    | 'estimated_from_profile'
    | 'based_on_previous_logs'
  notes: string | null
}

export interface PlanDay {
  day_number: number
  display_name: string
  focus: string
  exercises: PlanExercise[]
}

export interface EvidencePlan {
  display_name: string
  ai_notes: string
  days: PlanDay[]
}

export interface PreviousPlanContext {
  plan: EvidencePlan
}

export interface RegenerationHistory {
  scheduledSessions: number
  completedSessions: number
  adherenceRatio: number
  avgRpe: number | null
  painReported: boolean
  stalledExerciseIds: string[]
}

export interface TrainingPlanInput {
  profile: TrainingProfile
  exercises: EngineExercise[]
  weekNumber?: number
  seed: string
  previousPlan?: PreviousPlanContext | null
  history?: RegenerationHistory | null
}

export interface ValidationIssue {
  severity: 'error' | 'warning'
  code: string
  message: string
  path?: string
}

export interface EngineMetadata {
  engineVersion: string
  evidenceVersion: string
  appliedRuleIds: string[]
  warnings: string[]
  generatedAt: string
}

export interface EngineResult {
  success: boolean
  plan?: EvidencePlan
  metadata: EngineMetadata
  issues: ValidationIssue[]
  requiresReadinessReview?: boolean
}

export type PlanAdjustmentIntent =
  | { type: 'change_days'; daysPerWeek: number; preferredWorkoutDays?: number[] }
  | { type: 'change_duration'; sessionDurationMinutes: 30 | 45 | 60 | 90 }
  | { type: 'change_intensity'; direction: 'easier' | 'harder' }
  | { type: 'equipment_unavailable'; equipment: string[] }
  | { type: 'replace_exercise'; exerciseId: string }
  | { type: 'change_cardio_preferences'; cardioPreferences: CardioModality[] }
  | { type: 'health_change' }

export interface PlanDiff {
  daysBefore: number
  daysAfter: number
  exercisesAdded: string[]
  exercisesRemoved: string[]
  changedPrescriptionCount: number
}
