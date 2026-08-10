import { UsersRound } from 'lucide-react'
import { CoachClientList } from '@/components/coaching/CoachClientList'
import { PageTopBar } from '@/components/navigation/PageTopBar'
import { getCoachClientsSummary } from '@/lib/coaching/insights'
import { requireActiveTrainerContext } from '@/lib/coaching/access'

export const metadata = { title: 'Clientes · Vekira' }

export default async function CoachClientsPage() {
  const { supabase } = await requireActiveTrainerContext()
  let summary = null
  try {
    summary = await getCoachClientsSummary(supabase as any)
  } catch {
    // Keep failure generic so the page never reveals relationship state.
  }

  return (
    <div className="min-h-screen bg-background pb-28">
      <PageTopBar title="Clientes" subtitle="Relaciones profesionales" backHref="/coach" backLabel="Resumen" icon={<UsersRound className="h-5 w-5" />} />
      <main className="mx-auto max-w-4xl px-4 py-8">
        {summary
          ? <CoachClientList clients={summary.clients} />
          : <p role="alert" className="rounded-2xl border border-red-500/30 p-4 text-sm text-foreground">No se pudo cargar la lista de clientes. Inténtalo de nuevo más tarde.</p>}
      </main>
    </div>
  )
}
