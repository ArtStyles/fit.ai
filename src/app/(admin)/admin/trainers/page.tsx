import type { Metadata } from 'next'
import { ClipboardList } from 'lucide-react'
import { TrainerApplicationQueue } from '@/components/admin/TrainerApplicationReview'
import { PageTopBar } from '@/components/navigation/PageTopBar'
import {
  listAdminTrainerApplications,
  normalizeAdminTrainerStatus,
} from '@/lib/auth/adminTrainers'
import { requireAppUserContext } from '@/lib/auth/server'
import { resolveUserTimeZone } from '@/lib/workouts/schedule'

export const metadata: Metadata = { title: 'Solicitudes de entrenadores' }

export default async function AdminTrainersPage({
  searchParams,
}: {
  searchParams?: { status?: string }
}) {
  const selectedStatus = normalizeAdminTrainerStatus(searchParams?.status)
  const [applications, { profile }] = await Promise.all([
    listAdminTrainerApplications(selectedStatus),
    requireAppUserContext(),
  ])
  const timeZone = resolveUserTimeZone(profile.timezone)

  return (
    <div className="min-h-screen bg-background pb-28">
      <PageTopBar
        title="Entrenadores"
        subtitle="Cola de verificación profesional"
        backHref="/admin"
        backLabel="Administración"
        icon={<ClipboardList className="h-5 w-5" />}
      />
      <main className="mx-auto max-w-5xl px-4 py-8">
        <TrainerApplicationQueue applications={applications} selectedStatus={selectedStatus} timeZone={timeZone} />
      </main>
    </div>
  )
}
