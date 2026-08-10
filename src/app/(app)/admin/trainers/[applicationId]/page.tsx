import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { UserRoundSearch } from 'lucide-react'
import { TrainerApplicationReview } from '@/components/admin/TrainerApplicationReview'
import { PageTopBar } from '@/components/navigation/PageTopBar'
import { getAdminTrainerApplication } from '@/lib/auth/adminTrainers'

export const metadata: Metadata = { title: 'Expediente de entrenador' }

export default async function AdminTrainerApplicationPage({
  params,
}: {
  params: { applicationId: string }
}) {
  const application = await getAdminTrainerApplication(params.applicationId)
  if (!application) notFound()

  return (
    <div className="min-h-screen bg-background pb-28">
      <PageTopBar
        title="Expediente privado"
        subtitle={application.professionalName}
        backHref="/admin/trainers"
        backLabel="Entrenadores"
        icon={<UserRoundSearch className="h-5 w-5" />}
      />
      <main className="mx-auto max-w-5xl px-4 py-8">
        <TrainerApplicationReview application={application} />
      </main>
    </div>
  )
}
