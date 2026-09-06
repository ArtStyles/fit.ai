import { TrainerDirectory } from '@/components/coaching/TrainerDirectory'
import { requireAppUserContext } from '@/lib/auth/server'
import { loadClientCoachingSummary, type ClientCoachingSummaryClient } from '@/lib/coaching/clientSummary'
import { getTrainerDirectory, normalizeDirectoryFilters } from '@/lib/coaching/directory'

function firstValue(value: string | string[] | undefined) {
  return typeof value === 'string' ? value : undefined
}

export default async function TrainersPage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>
}) {
  const { supabase, user } = await requireAppUserContext()
  const filters = normalizeDirectoryFilters({
    text: firstValue(searchParams.q),
    specialty: firstValue(searchParams.especialidad),
    modality: firstValue(searchParams.modalidad),
    language: firstValue(searchParams.idioma),
    location: firstValue(searchParams.ubicacion),
  })
  const [directory, coaching] = await Promise.all([
    getTrainerDirectory({ filters, cursor: firstValue(searchParams.cursor) }),
    loadClientCoachingSummary(supabase as unknown as ClientCoachingSummaryClient, user.id),
  ])

  return (
    <main className="mx-auto max-w-4xl px-4 pb-24 pt-6 sm:px-6 lg:px-8">
      {directory.error ? <p role="alert" className="rounded-2xl border border-destructive/30 p-4 text-sm text-destructive">{directory.error}</p> : null}
      <TrainerDirectory trainers={directory.trainers} filters={filters} nextCursor={directory.nextCursor} coachingSummary={coaching.summary} />
    </main>
  )
}
