export type FreeTrainingDetail = 'attendance' | 'partial' | 'complete'

export type FreeTrainingSet = { weightKg: number; reps: number; durationSeconds?: number }
export type FreeTrainingExercise = { exerciseId: string; sets: FreeTrainingSet[] }
export type FreeTrainingInput = {
  accountId: string
  sessionId: string
  operationId: string
  expectedVersion: number | null
  date: string
  name: string
  durationMinutes: number | null
  notes: string
  detailLevel: FreeTrainingDetail
  exercises: FreeTrainingExercise[]
  weeklyGoal?: number
}
export type FreeTrainingCatalogItem = {
  id: string
  name: string
  muscleGroups: string[]
  timed: boolean
  previous: FreeTrainingSet[] | null
  previousDate: string | null
}
export type FreeTrainingModel = {
  accountId: string
  language: 'es' | 'en'
  timeZone: string
  today: string
  hasActivePlan: boolean
  weeklyGoal: number | null
  catalog: FreeTrainingCatalogItem[]
  initial: FreeTrainingInput
  recent: Array<{ id: string; name: string; date: string; detailLevel: FreeTrainingDetail }>
}
export type FreeTrainingResult = {
  success: true
  logId: string
  version: number
  detailLevel: FreeTrainingDetail
  sets: number
  volumeKg: number
  trainedDaysThisWeek: number
  improvements: Array<{ exerciseName: string; previousWeightKg: number; previousReps: number; weightKg: number; reps: number }>
} | { success: false; error: string }
