import type { Metadata } from 'next'
import { AdminPageHeader } from '@/components/admin/AdminPageHeader'
import { TrainerApplicationQueue } from '@/components/admin/TrainerApplicationReview'
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
    <main className="mx-auto w-full max-w-7xl px-4 py-6 pb-24 sm:px-6 lg:px-8 lg:py-8">
      <AdminPageHeader title="Entrenadores" description="Cola de verificación profesional" />
      <div className="mt-8">
        <TrainerApplicationQueue applications={applications} selectedStatus={selectedStatus} timeZone={timeZone} />
      </div>
    </main>
  )
}
