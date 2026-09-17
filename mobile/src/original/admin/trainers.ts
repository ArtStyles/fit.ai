import { mobileApi } from '../mobile-api'
import type { AdminTrainerApplicationDetail, AdminTrainerApplicationStatus, AdminTrainerQueueItem } from '@/lib/auth/adminTrainers'

export type {
  AdminTrainerApplicationDetail, AdminTrainerApplicationStatus, AdminTrainerQueueItem,
  AdminTrainerCredential, AdminTrainerApplicationEvent, AdminTrainerInterview,
} from '@/lib/auth/adminTrainers'

export const ADMIN_TRAINER_STATUSES = [
  'draft', 'submitted', 'under_review', 'changes_requested', 'interview_required',
  'approved', 'rejected', 'withdrawn',
] as const

export function normalizeAdminTrainerStatus(value?: string): AdminTrainerApplicationStatus | undefined {
  return value && (ADMIN_TRAINER_STATUSES as readonly string[]).includes(value)
    ? value as AdminTrainerApplicationStatus : undefined
}
export function listAdminTrainerApplications(status?: string) {
  const selected = normalizeAdminTrainerStatus(status)
  return mobileApi<AdminTrainerQueueItem[]>('/api/mobile/admin', {
    operation: 'trainers', ...(selected ? { status: selected } : {}),
  })
}
export function getAdminTrainerApplication(applicationId: string) {
  return mobileApi<AdminTrainerApplicationDetail | null>('/api/mobile/admin', { operation: 'trainer-detail', applicationId })
}
