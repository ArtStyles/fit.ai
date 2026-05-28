export type ProgressionAction = 'increase' | 'hold' | 'decrease' | 'baseline'

export type ProgressionConfidence = 'low' | 'medium' | 'high'

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
  status: 'pending' | 'active' | 'completed' | 'skipped'
  sets: ProgressionSetInput[]
}

export interface ProgressionSuggestion {
  exerciseId: string
  exerciseName: string
  currentWeightKg: number | null
  nextWeightKg: number | null
  action: ProgressionAction
  reason: string
  confidence: ProgressionConfidence
}
