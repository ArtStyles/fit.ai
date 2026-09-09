import type { TrainingProfile } from '@/lib/training-engine'

export type MobileAccount = {
  id: string
  remoteUserId: string | null
  name: string
  profile: TrainingProfile
  createdAt: string
  updatedAt: string
}

export type MobileExercise = {
  id: string
  remoteId?: string | null
  name: string
  imageUrl: string | null
  instructions: string
  muscleGroups: string[]
  equipment: string[]
}

export type MobilePrescription = {
  id: string
  exerciseId: string
  name: string
  imageUrl: string | null
  instructions: string
  sets: number
  reps: number | null
  durationSeconds: number | null
  restSeconds: number
  weightKg: number | null
  targetRpe: number | null
}

export type MobileWorkout = {
  id: string
  name: string
  dayOfWeek: number
  exercises: MobilePrescription[]
}

export type MobilePlan = {
  id: string
  accountId: string
  remoteId: string | null
  source: 'personal' | 'trainer'
  name: string
  notes: string
  workouts: MobileWorkout[]
  createdAt: string
  updatedAt: string
}

export type MobileSet = {
  id: string
  reps: number | null
  weightKg: number | null
  durationSeconds: number | null
  completed: boolean
}

export type MobileSessionExercise = {
  prescription: MobilePrescription
  sets: MobileSet[]
}

export type MobileSession = {
  id: string
  accountId: string
  planId: string
  workoutId: string
  workoutName: string
  source: 'personal' | 'trainer'
  startedAt: string
  finishedAt: string | null
  exercises: MobileSessionExercise[]
  rpe: number | null
  notes: string
  remoteId: string | null
}

export type MobileMeasurement = {
  id: string
  accountId: string
  date: string
  weightKg: number
  waistCm: number | null
  notes: string
  updatedAt: string
  deletedAt: string | null
}

export type OutboxOperation = {
  id: string
  accountId: string
  kind: 'plan' | 'session' | 'measurement' | 'profile'
  entityId: string
  payload: unknown
  createdAt: string
  attempts: number
  error: string | null
}

export type MobileData = {
  plans: MobilePlan[]
  sessions: MobileSession[]
  measurements: MobileMeasurement[]
  activePlanId: string | null
}

export interface MobileRepository {
  listAccounts(): Promise<MobileAccount[]>
  saveAccount(account: MobileAccount, enqueue?: boolean): Promise<void>
  getActiveAccountId(): Promise<string | null>
  setActiveAccountId(id: string | null): Promise<void>
  loadData(accountId: string): Promise<MobileData>
  savePlan(plan: MobilePlan, enqueue?: boolean): Promise<void>
  setActivePlan(accountId: string, planId: string): Promise<void>
  saveSession(session: MobileSession, enqueue?: boolean): Promise<void>
  saveMeasurement(measurement: MobileMeasurement, enqueue?: boolean): Promise<void>
  pending(accountId: string): Promise<OutboxOperation[]>
  acknowledge(accountId: string, operationId: string): Promise<void>
  recordFailure(accountId: string, operationId: string, message: string): Promise<void>
  exportBackup(accountId: string): Promise<string>
  importBackup(json: string, targetAccountId?: string): Promise<MobileAccount>
}
