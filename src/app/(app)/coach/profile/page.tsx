import { UserRound } from 'lucide-react'
import { TrainerProfileForm } from '@/components/coaching/TrainerProfileForm'
import { PageTopBar } from '@/components/navigation/PageTopBar'
import { requireActiveTrainerContext } from '@/lib/coaching/access'

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
  status: typeof OPEN_REVIEW_STATUSES[number]
  application_kind: 'profile_update'
  professional_name: string
  specialties: string[]
  modalities: Array<'online' | 'in_person' | 'hybrid'>
  experience_summary: string
}

export default async function CoachProfilePage() {
  const { user, supabase, trainerProfile } = await requireActiveTrainerContext()

  const applications = supabase.from('trainer_applications') as any
  const { data: reviewData, error } = await applications
    .select('id, status, application_kind, professional_name, specialties, modalities, experience_summary')
    .eq('user_id', user.id)
    .eq('application_kind', 'profile_update')
    .in('status', [...OPEN_REVIEW_STATUSES])
    .order('created_at', { ascending: false })
    .maybeSingle()

  if (error) throw new Error('No se pudo cargar la revisión pendiente del perfil.')
  const review = reviewData as PendingReviewRow | null

  return (
    <div className="min-h-screen bg-background pb-28">
      <PageTopBar title="Perfil profesional" subtitle="Información aprobada y revisiones" backHref="/coach" backLabel="Resumen" icon={<UserRound className="h-5 w-5" />} />
      <main className="mx-auto max-w-4xl px-4 py-8">
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
          pendingReview={review ? {
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
