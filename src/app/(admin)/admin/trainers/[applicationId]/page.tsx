import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { AdminPageHeader } from '@/components/admin/AdminPageHeader'
import { TrainerApplicationReview } from '@/components/admin/TrainerApplicationReview'
import { getAdminTrainerApplication } from '@/lib/auth/adminTrainers'
import { requireAppUserContext } from '@/lib/auth/server'
import { resolveUserTimeZone } from '@/lib/workouts/schedule'

export const metadata: Metadata = { title: 'Expediente de entrenador' }

export default async function AdminTrainerApplicationPage({
  params,
}: {
  params: { applicationId: string }
}) {
  const [application, { profile }] = await Promise.all([
    getAdminTrainerApplication(params.applicationId),
    requireAppUserContext(),
  ])
  if (!application) notFound()
  const timeZone = resolveUserTimeZone(profile.timezone)

  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-6 pb-24 sm:px-6 lg:px-8 lg:py-8">
      <AdminPageHeader
        eyebrow="Entrenadores"
        title="Expediente privado"
        description={application.professionalName}
        backHref="/admin/trainers"
        backLabel="Volver a entrenadores"
      />
      <div className="mt-8">
        <TrainerApplicationReview application={application} timeZone={timeZone} />
      </div>
    </main>
  )
}
