import { Briefcase } from 'lucide-react'
import { CoachOverview } from '@/components/coaching/CoachOverview'
import { PageTopBar } from '@/components/navigation/PageTopBar'
import { getCoachClientsSummary } from '@/lib/coaching/insights'
import { requireActiveTrainerContext } from '@/lib/coaching/access'

export const metadata = { title: 'Espacio profesional · Vekira' }

export default async function CoachPage() {
  const { trainerProfile, supabase } = await requireActiveTrainerContext()
  let summary = null
  try {
    summary = await getCoachClientsSummary(supabase as any)
  } catch {
    // The RPC deliberately uses one generic response for unavailable data.
  }

  return (
    <div className="min-h-screen bg-background pb-28">
      <PageTopBar title="Resumen profesional" subtitle="Tu espacio de entrenador" icon={<Briefcase className="h-5 w-5" />} />
      <main className="mx-auto max-w-5xl px-4 py-8">
        {summary
          ? <CoachOverview professionalName={trainerProfile.professional_name} summary={summary} />
          : <p role="alert" className="rounded-2xl border border-red-500/30 p-4 text-sm text-foreground">No se pudo cargar el resumen profesional. Inténtalo de nuevo más tarde.</p>}
      </main>
    </div>
  )
}
