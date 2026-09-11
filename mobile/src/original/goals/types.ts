export type GoalKind = 'strength' | 'duration'
export type GoalTarget = { kind: 'strength'; weightKg: number; reps: number } | { kind: 'duration'; seconds: number }
export type GoalSet = { weightKg: number; reps: number; seconds?: number }
export type GoalCatalogItem = { id: string; name: string; muscleGroups: string[]; kind: GoalKind }
export type GoalPoint = {
  sessionId: string; sessionName: string; completedAt: string; date: string
  best: GoalSet; sets: GoalSet[]
}
export type PersonalExerciseGoal = {
  id: string; exerciseId: string; name: string; muscleGroups: string[]; kind: GoalKind
  target: GoalTarget | null; version: number; createdAt: string
  points: GoalPoint[]; first: GoalPoint | null; latest: GoalPoint | null; best: GoalPoint | null
  achieved: boolean; achievedAt: string | null
}
export type ExerciseGoalsModel = {
  accountId: string; language: 'es' | 'en'; today: string
  catalog: GoalCatalogItem[]; goals: PersonalExerciseGoal[]
}
export type SaveExerciseGoalInput = {
  accountId: string; id: string; exerciseId: string; expectedVersion: number | null
  target: GoalTarget | null
}
export type RemoveExerciseGoalInput = { accountId: string; id: string; expectedVersion: number }
export type GoalActionResult = { success: true } | { success: false; error: string }
