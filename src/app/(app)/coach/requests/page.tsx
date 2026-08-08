import { ClipboardList } from 'lucide-react'
import { CoachRequestQueue } from '@/components/coaching/CoachRequestQueue'
import { PageTopBar } from '@/components/navigation/PageTopBar'
import { requireActiveTrainerContext } from '@/lib/coaching/access'

export const metadata = { title: 'Solicitudes profesionales Â· Vekira' }

export default async function CoachRequestsPage() {
  const { supabase, user } = await requireActiveTrainerContext()
  if (!supabase) return <div className="min-h-screen bg-background pb-28">
    <PageTopBar title="Solicitudes" subtitle="Nuevas relaciones profesionales" backHref="/coach" backLabel="Resumen" icon={<ClipboardList className="h-5 w-5" />} />
    <main className="mx-auto max-w-4xl px-4 py-8"><CoachRequestQueue requests={[]} /></main>
  </div>
  const { data, error } = await (supabase as any)
    .from('coaching_requests')
    .select('id, message, created_at, trainer_service_offerings!inner(name)')
    .eq('trainer_user_id', user.id)
    .eq('status', 'pending')
    .order('created_at', { ascending: false })

  const requests = !error ? (data ?? []).map((request: any) => ({
    id: request.id,
    message: request.message,
    createdAt: request.created_at,
    serviceName: request.trainer_service_offerings?.name ?? 'Servicio de acompaÃ±amiento',
  })) : []

  return <div className="min-h-screen bg-background pb-28">
    <PageTopBar title="Solicitudes" subtitle="Nuevas relaciones profesionales" backHref="/coach" backLabel="Resumen" icon={<ClipboardList className="h-5 w-5" />} />
    <main className="mx-auto max-w-4xl px-4 py-8">
      {error ? <p role="alert" className="rounded-2xl border border-red-500/30 p-4 text-sm text-foreground">No se pudieron cargar las solicitudes. IntÃ©ntalo de nuevo mÃ¡s tarde.</p> : <CoachRequestQueue requests={requests} />}
    </main>
  </div>
}
