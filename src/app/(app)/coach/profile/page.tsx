import { UserRound } from 'lucide-react'
import {
  ApplicationTimeline,
  type TrainerApplicationEventView,
  type TrainerInterviewView,
} from '@/components/coaching/ApplicationTimeline'
import { TrainerProfileForm } from '@/components/coaching/TrainerProfileForm'
import { PageTopBar } from '@/components/navigation/PageTopBar'
import { requireActiveTrainerContext } from '@/lib/coaching/access'
import type { TrainerApplicationStatus } from '@/lib/coaching/status'

export const metadata = { title: 'Perfil profesional · Vekira' }

const OPEN_REVIEW_STATUSES = [
  'draft',
  'submitted',
  'under_review',
  'changes_requested',
  'interview_required',
] as const

type PendingReviewRow = {
  id: string
  status: TrainerApplicationStatus
  application_kind: 'profile_update'
  professional_name: string
  specialties: string[]
  modalities: Array<'online' | 'in_person' | 'hybrid'>
  experience_summary: string
}

type EventRow = {
  id: string
  to_status: TrainerApplicationEventView['toStatus']
  public_note: string | null
  created_at: string
}

type InterviewRow = {
  proposed_at: string
  timezone: string
  medium: TrainerInterviewView['medium']
  external_url: string | null
  status: TrainerInterviewView['status']
  public_note: string | null
}

function isOpenReview(status: TrainerApplicationStatus): status is typeof OPEN_REVIEW_STATUSES[number] {
  return OPEN_REVIEW_STATUSES.includes(status as typeof OPEN_REVIEW_STATUSES[number])
}

export default async function CoachProfilePage() {
  const { user, profile, supabase, trainerProfile } = await requireActiveTrainerContext()

  const applications = supabase.from('trainer_applications') as any
  const { data: reviewData, error } = await applications
    .select('id, status, application_kind, professional_name, specialties, modalities, experience_summary')
    .eq('user_id', user.id)
    .eq('application_kind', 'profile_update')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) throw new Error('No se pudo cargar la revisión del perfil.')
  const review = reviewData as PendingReviewRow | null
  let events: TrainerApplicationEventView[] = []
  let interview: TrainerInterviewView | null = null

  if (review) {
    const [eventQuery, interviewQuery] = await Promise.all([
      supabase.from('trainer_application_events_public')
        .select('id, to_status, public_note, created_at')
        .eq('application_id', review.id)
        .order('created_at', { ascending: true }),
      supabase.from('trainer_interviews_applicant_public')
        .select('proposed_at, timezone, medium, external_url, status, public_note')
        .eq('application_id', review.id)
        .order('proposed_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ])
    const eventResponse = eventQuery as unknown as { data: EventRow[] | null; error: unknown }
    const interviewResponse = interviewQuery as unknown as { data: InterviewRow | null; error: unknown }
    if (eventResponse.error || interviewResponse.error) {
      throw new Error('No se pudo cargar el seguimiento público de la revisión.')
    }
    events = (eventResponse.data ?? []).map(row => ({
      id: row.id,
      toStatus: row.to_status,
      publicNote: row.public_note,
      createdAt: row.created_at,
    }))
    if (interviewResponse.data) {
      interview = {
        proposedAt: interviewResponse.data.proposed_at,
        timezone: interviewResponse.data.timezone,
        medium: interviewResponse.data.medium,
        externalUrl: interviewResponse.data.external_url,
        status: interviewResponse.data.status,
        publicNote: interviewResponse.data.public_note,
      }
    }
  }

  return (
    <div className="min-h-screen bg-background pb-28">
      <PageTopBar title="Perfil profesional" subtitle="Información aprobada y revisiones" backHref="/coach" backLabel="Resumen" icon={<UserRound className="h-5 w-5" />} />
      <main className="mx-auto max-w-4xl space-y-6 px-4 py-8">
        <ApplicationTimeline
          events={events}
          interview={interview}
          applicantTimezone={profile.timezone ?? 'UTC'}
        />
        <TrainerProfileForm
          approvedProfile={{
            professionalName: trainerProfile.professional_name,
            professionalPhotoUrl: trainerProfile.professional_photo_url,
            bio: trainerProfile.bio,
            specialties: [...trainerProfile.specialties],
            modalities: [...trainerProfile.modalities],
            experienceSummary: trainerProfile.experience_summary,
            generalLocation: trainerProfile.general_location,
            languages: [...trainerProfile.languages],
          }}
          pendingReview={review && isOpenReview(review.status) ? {
            id: review.id,
            status: review.status,
            professionalName: review.professional_name,
            specialties: [...review.specialties],
            modalities: [...review.modalities],
            experienceSummary: review.experience_summary,
          } : null}
        />
      </main>
    </div>
  )
}
