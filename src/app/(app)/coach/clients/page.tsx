import { UsersRound } from 'lucide-react'
import { CoachClientList } from '@/components/coaching/CoachClientList'
import { PageTopBar } from '@/components/navigation/PageTopBar'
import { getCoachRelationshipManagement } from '@/lib/coaching/relationshipManagement'
import { getCoachClientsSummary } from '@/lib/coaching/insights'
import { requireActiveTrainerContext } from '@/lib/coaching/access'
import { resolveUserTimeZone } from '@/lib/workouts/schedule'

export const metadata = { title: 'Clientes · Vekira' }

export default async function CoachClientsPage() {
  const { profile, supabase } = await requireActiveTrainerContext()
  const viewerTimeZone = resolveUserTimeZone(profile.timezone)
  const [managementResult, summaryResult] = await Promise.allSettled([
    getCoachRelationshipManagement(supabase as any),
    getCoachClientsSummary(supabase as any),
  ])
  const management = managementResult.status === 'fulfilled' ? managementResult.value : null
  const summary = summaryResult.status === 'fulfilled' ? summaryResult.value : null

  return (
    <div className="min-h-screen bg-background pb-28">
      <PageTopBar title="Clientes" subtitle="Relaciones profesionales" backHref="/coach" backLabel="Resumen" icon={<UsersRound className="h-5 w-5" />} />
      <main className="mx-auto max-w-4xl px-4 py-8">
        {management
          ? <CoachClientList relationships={management.relationships} clients={summary?.clients ?? null} viewerTimeZone={viewerTimeZone} />
          : <p role="alert" className="rounded-2xl border border-red-500/30 p-4 text-sm text-foreground">No se pudo cargar la lista de clientes. Inténtalo de nuevo más tarde.</p>}
      </main>
    </div>
  )
}
