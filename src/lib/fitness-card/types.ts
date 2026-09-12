import type { MuscleGroupId } from '@/lib/muscles/activity'

export type FitnessTheme = 'violet' | 'ember' | 'ice'
export type FitnessIdentity = { userId: string; name: string; username: string | null; avatarUrl: string | null }
export type FitnessRecord = {
  exerciseId: string; name: string; kind: 'strength' | 'duration';
  weightKg: number | null; reps: number | null; seconds: number | null; date: string
}
export type FitnessEvidence = {
  records: FitnessRecord[]; muscles: { id: MuscleGroupId; sessions: number }[];
  totalSessions: number; partialSessions: number; rangeFrom: string; rangeTo: string; updatedAt: string
}
export type FitnessPhoto = { slot: 1 | 2 | 3; path: string }
export type FitnessCard = {
  owner: FitnessIdentity; artisticName: string; theme: FitnessTheme; revision: number;
  photos: FitnessPhoto[]; evidence: FitnessEvidence; updatedAt: string
}
export type FitnessCover = Pick<FitnessCard, 'owner' | 'artisticName' | 'theme' | 'updatedAt'>
export type FitnessAccessStatus = 'pending' | 'accepted' | 'rejected' | 'revoked'
export type FitnessAccess = {
  id: string; owner: FitnessIdentity; viewer: FitnessIdentity; status: FitnessAccessStatus; updatedAt: string
}
export type FitnessHubState = { viewerId: string; own: FitnessCard | null; received: FitnessCover[]; access: FitnessAccess[] }
export type FitnessAccessAction = 'share' | 'request' | 'accept' | 'reject' | 'revoke' | 'cancel' | 'leave'
export type FitnessPhotoUrls = Partial<Record<1 | 2 | 3, string>>
