import { ClientCoachingStatus } from '@/components/coaching/ClientCoachingStatus'
import { requireAppUserContext } from '@/lib/auth/server'

export default async function CoachingPage() {
  const { supabase, user } = await requireAppUserContext()
  const { data } = await supabase
    .from('coaching_requests')
    .select('id, status, created_at')
    .eq('client_user_id', user.id)
    .order('created_at', { ascending: false })
  const requests = ((data ?? []) as Array<{ id: string; status: 'pending' | 'accepted' | 'declined' | 'cancelled'; created_at: string }>)
    .map(request => ({ id: request.id, status: request.status, createdAt: request.created_at }))

  return <main className="mx-auto max-w-lg px-4 pb-24 pt-6">
    <header className="mb-6">
      <h1 className="text-2xl font-bold text-foreground">Acompañamiento</h1>
      <p className="mt-1 text-sm text-muted-foreground">Consulta el estado real de tus solicitudes. No se comparten datos de entrenamiento hasta que exista una relación aceptada.</p>
    </header>
    <ClientCoachingStatus requests={requests} />
  </main>
}
