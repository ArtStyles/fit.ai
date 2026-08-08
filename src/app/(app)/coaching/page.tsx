import { ClientCoachingStatus } from '@/components/coaching/ClientCoachingStatus'
import { ConsentManager, type CoachingConsentView } from '@/components/coaching/ConsentManager'
import { requireAppUserContext } from '@/lib/auth/server'

export default async function CoachingPage() {
  const { supabase, user } = await requireAppUserContext()
  const { data, error } = await supabase
    .from('coaching_requests')
    .select('id, status, created_at')
    .eq('client_user_id', user.id)
    .order('created_at', { ascending: false })
  if (error) return <main className="mx-auto max-w-lg px-4 pb-24 pt-6">
    <h1 className="text-2xl font-bold text-foreground">Acompañamiento</h1>
    <p role="alert" className="mt-4 rounded-2xl border border-red-500/30 p-4 text-sm text-foreground">No se pudo cargar el estado de tus solicitudes. Inténtalo de nuevo más tarde.</p>
  </main>

  const requests = ((data ?? []) as Array<{ id: string; status: 'pending' | 'accepted' | 'declined' | 'cancelled'; created_at: string }>)
    .map(request => ({ id: request.id, status: request.status, createdAt: request.created_at }))

  const { data: relationships, error: relationshipsError } = await (supabase as any)
    .from('coaching_relationships')
    .select('id, status')
    .eq('client_user_id', user.id)
    .eq('status', 'active')
    .limit(1)
  const relationship = relationships?.[0] as { id: string } | undefined
  const { data: consents, error: consentsError } = relationship
    ? await (supabase as any)
      .from('coaching_consents')
      .select('scope, text_version, granted_at, revoked_at')
      .eq('relationship_id', relationship.id)
    : { data: [], error: null }

  return <main className="mx-auto max-w-lg px-4 pb-24 pt-6">
    <header className="mb-6">
      <h1 className="text-2xl font-bold text-foreground">Acompañamiento</h1>
      <p className="mt-1 text-sm text-muted-foreground">Consulta el estado real de tus solicitudes. No se comparten datos de entrenamiento hasta que exista una relación aceptada.</p>
    </header>
    <ClientCoachingStatus requests={requests} />
    {relationshipsError || consentsError ? <p role="alert" className="mt-4 rounded-2xl border border-red-500/30 p-4 text-sm text-foreground">No se pudieron cargar tus consentimientos.</p> : relationship ? <ConsentManager relationshipId={relationship.id} consents={((consents ?? []) as Array<{ scope: CoachingConsentView['scope']; text_version: string; granted_at: string; revoked_at: string | null }>).map(consent => ({
      scope: consent.scope,
      textVersion: consent.text_version,
      grantedAt: consent.granted_at,
      revokedAt: consent.revoked_at,
    }))} /> : null}
  </main>
}
