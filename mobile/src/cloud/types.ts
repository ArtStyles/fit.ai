import type { MobileAccount, MobileRepository } from '../domain/types'

export type TrainerCard = {
  id: string; name: string; slug: string; bio: string; imageUrl: string | null
  specialties: string[]
  services: { id: string; name: string; description: string; modality: string; durationMinutes: number }[]
}
export type CoachingOverview = {
  requests: { id: string; serviceId: string; status: string; message: string; createdAt: string }[]
  relationships: { id: string; trainerId: string; trainerName: string; status: string; startedAt: string }[]
  assignments: { id: string; planId: string | null; name: string; status: string; createdAt: string }[]
}
export interface MobileCloud {
  configured: boolean
  signIn(email: string, password: string): Promise<MobileAccount>
  signOut(): Promise<void>
  sync(accountId: string): Promise<{ uploaded: number; downloaded: number; pending: number }>
  listTrainers(): Promise<TrainerCard[]>
  /** Caller must present training-profile-v1 consent and require explicit acceptance. */
  requestTrainer(serviceId: string, message: string): Promise<void>
  listCoaching(): Promise<CoachingOverview>
  dispose(): void
}
export type CreateMobileCloud = (repository: MobileRepository) => MobileCloud
