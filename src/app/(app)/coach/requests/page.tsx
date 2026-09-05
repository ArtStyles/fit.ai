import { ClipboardList } from 'lucide-react'
import { CoachRequestQueue } from '@/components/coaching/CoachRequestQueue'
import { CoachRelationshipActions } from '@/components/coaching/CoachRelationshipActions'
import { PageTopBar } from '@/components/navigation/PageTopBar'
import { requireActiveTrainerContext } from '@/lib/coaching/access'

export const metadata = { title: 'Solicitudes profesionales · Vekira' }

export default async function CoachRequestsPage() {
  const { supabase, user } = await requireActiveTrainerContext()
  if (!supabase) return <div className="min-h-screen bg-background pb-28">
    <PageTopBar title="Solicitudes" subtitle="Nuevas relaciones profesionales" backHref="/coach" backLabel="Resumen" icon={<ClipboardList className="h-5 w-5" />} />
    <main className="mx-auto max-w-4xl px-4 py-8"><CoachRequestQueue requests={[]} /></main>
  </div>
  const { data, error } = await (supabase as any)
    .from('coaching_requests')
    .select('id, client_user_id, message, created_at, trainer_service_offerings!inner(name)')
    .eq('trainer_user_id', user.id)
    .eq('status', 'pending')
    .order('created_at', { ascending: false })

  const requestRows = !error ? data ?? [] : []
  const clientIds = Array.from(new Set(requestRows.map((request: any) => request.client_user_id)))
  const { data: clientProfiles, error: clientProfilesError } = clientIds.length
    ? await (supabase as any)
      .from('public_profiles')
      .select('id, username, full_name, avatar_url')
      .in('id', clientIds)
    : { data: [], error: null }
  const profilesById = new Map((clientProfiles ?? []).map((profile: any) => [profile.id, profile]))

  const requests = requestRows.map((request: any) => {
    const profile = profilesById.get(request.client_user_id) as any
    return {
      id: request.id,
      clientId: request.client_user_id,
      message: request.message,
      createdAt: request.created_at,
      serviceName: request.trainer_service_offerings?.name ?? 'Servicio de acompañamiento',
      clientName: profile?.full_name?.trim() || profile?.username?.trim() || 'Usuario',
      clientAvatarUrl: profile?.avatar_url || null,
    }
  })
  const { data: relationships, error: relationshipsError } = await (supabase as any)
    .from('coaching_relationships')
    .select('id, status')
    .eq('trainer_user_id', user.id)
    .in('status', ['active', 'paused_by_platform'])
    .order('started_at', { ascending: false })

  return <div className="min-h-screen bg-background pb-28">
    <PageTopBar title="Solicitudes" subtitle="Nuevas relaciones profesionales" backHref="/coach" backLabel="Resumen" icon={<ClipboardList className="h-5 w-5" />} />
    <main className="mx-auto max-w-4xl px-4 py-8">
      {error
        ? <p role="alert" className="rounded-2xl border border-red-500/30 p-4 text-sm text-foreground">No se pudieron cargar las solicitudes. Inténtalo de nuevo más tarde.</p>
        : clientProfilesError
          ? <p role="alert" className="rounded-2xl border border-red-500/30 p-4 text-sm text-foreground">No se pudo cargar la identidad de las personas que enviaron estas solicitudes. Inténtalo de nuevo más tarde.</p>
          : <CoachRequestQueue requests={requests} />}
      {relationshipsError ? <p role="alert" className="mt-4 rounded-2xl border border-red-500/30 p-4 text-sm text-foreground">No se pudieron cargar los acompañamientos activos o pausados.</p> : relationships?.length ? <section className="mt-6 space-y-4" aria-labelledby="coach-relationships-title"><h2 id="coach-relationships-title" className="text-lg font-bold text-foreground">Acompañamientos activos o pausados</h2>{relationships.map((relationship: { id: string; status: 'active' | 'paused_by_platform' }) => <CoachRelationshipActions key={relationship.id} relationshipId={relationship.id} status={relationship.status} />)}</section> : null}
    </main>
  </div>
}
