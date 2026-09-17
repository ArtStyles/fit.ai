import type { ExerciseCatalogOption } from '@/components/plan/ExercisePicker'
import type { MuscleGroupId } from '@/lib/muscles/activity'
import type { Exercise } from '@/types/exercise'

export type PersonalExerciseContext = { accountId: string; sessionVersion: number; language: 'es' | 'en' }
export type PersonalExerciseInput = {
  accountId: string
  sessionVersion: number
  operationId: string
  name: string
  description: string
  muscleGroups: MuscleGroupId[]
  recording: 'reps' | 'time'
  illustration: MuscleGroupId | null
}
export type PersonalExerciseOption = ExerciseCatalogOption & { exerciseType: string; personal: true }
export type PersonalExercise = Exercise & { motion_preview_url: null }
