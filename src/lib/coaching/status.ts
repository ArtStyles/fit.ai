export type TrainerApplicationStatus =
  | 'draft'
  | 'submitted'
  | 'under_review'
  | 'changes_requested'
  | 'interview_required'
  | 'approved'
  | 'rejected'
  | 'withdrawn'

export type TrainerProfileStatus = 'active' | 'suspended' | 'inactive'

export type TrainerApplicationActor = 'applicant' | 'admin'

export type TrainerApplicationDraft = {
  professionalName: string
  professionalPhotoUrl: string | null
  bio: string
  specialties: string[]
  modalities: Array<'online' | 'in_person' | 'hybrid'>
  experienceSummary: string
  generalLocation: string | null
  languages: string[]
  contactEmail: string
  contactPhone: string | null
  preferredContact: 'email' | 'phone' | 'whatsapp'
  timezone: string
  interviewAvailability: string
}

const allowedTransitions: Record<
  TrainerApplicationActor,
  Partial<Record<TrainerApplicationStatus, readonly TrainerApplicationStatus[]>>
> = {
  applicant: {
    draft: ['submitted', 'withdrawn'],
    submitted: ['withdrawn'],
    under_review: ['withdrawn'],
    changes_requested: ['submitted', 'withdrawn'],
    interview_required: ['withdrawn'],
  },
  admin: {
    submitted: ['under_review'],
    under_review: ['changes_requested', 'interview_required', 'approved', 'rejected'],
    interview_required: ['changes_requested', 'approved', 'rejected'],
  },
}

export function canTransitionApplication(
  from: TrainerApplicationStatus,
  to: TrainerApplicationStatus,
  actor: TrainerApplicationActor,
): boolean {
  return allowedTransitions[actor][from]?.includes(to) ?? false
}
