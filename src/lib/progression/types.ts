export type ProgressionAction = 'increase' | 'hold' | 'decrease' | 'baseline'

export type ProgressionConfidence = 'low' | 'medium' | 'high'

export type ProgressionType = 'weight' | 'reps'

export interface ProgressionSetInput {
  weightKg: string | number | null
  reps: string | number | null
  rpe: number | null
  completed: boolean
}

export interface ProgressionExerciseInput {
  exerciseId: string
  exerciseName: string
  isCompound: boolean
  targetSets: number
  targetReps: number | null
  targetRpe: number
  suggestedWeightKg: number | null
  previousLogCount: number
  /** Peso máximo por sesión previa, de la más reciente a la más antigua. */
  recentMaxWeightsKg?: number[]
  status: 'pending' | 'active' | 'completed' | 'skipped'
  sets: ProgressionSetInput[]
}

export interface ProgressionSuggestion {
  exerciseId: string
  exerciseName: string
  progressionType: ProgressionType
  currentWeightKg: number | null
  nextWeightKg: number | null
  currentTargetReps: number | null
  nextTargetReps: number | null
  action: ProgressionAction
  reason: string
  confidence: ProgressionConfidence
  /** true cuando la sugerencia es un deload por estancamiento. */
  stalled?: boolean
}
