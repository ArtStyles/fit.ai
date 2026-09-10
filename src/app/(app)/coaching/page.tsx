import { ClientCoachingStatus } from '@/components/coaching/ClientCoachingStatus'
import { AssignedCoachingRoutines } from '@/components/coaching/AssignedCoachingRoutines'
import { ConsentManager, type CoachingConsentView } from '@/components/coaching/ConsentManager'
import { AccountWorkspaceMenu } from '@/components/navigation/AccountWorkspaceMenu'
import { requireAppUserContext } from '@/lib/auth/server'
import { parseTrainerProgramSnapshot } from '@/lib/coaching/programs'

const REQUEST_HISTORY_LIMIT = 20

function CoachingHeader({ description }: { description?: string }) {
  return (
    <header className="mb-6 flex items-start justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-2xl font-bold text-foreground">Acompañamiento</h1>
        {description ? <p className="mt-1 text-sm text-muted-foreground">{description}</p> : null}
      </div>
      <AccountWorkspaceMenu surface="topbar" />
    </header>
  )
}

function CoachingPageLoadError({ message }: { message: string }) {
  return <main className="mx-auto max-w-lg px-4 pb-24 pt-6">
    <CoachingHeader />
    <p role="alert" className="mt-4 rounded-2xl border border-red-500/30 p-4 text-sm text-foreground">{message}</p>
  </main>
}

export default async function CoachingPage() {
  const { supabase, user } = await requireAppUserContext()
  const { data, error } = await supabase
    .from('coaching_requests')
    .select('id, status, created_at, trainer_user_id, service_id')
    .eq('client_user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(REQUEST_HISTORY_LIMIT)
  if (error) return <CoachingPageLoadError message="No se pudo cargar el estado de tus solicitudes. Inténtalo de nuevo más tarde." />

  const requestRows = (data ?? []) as Array<{
    id: string
    status: 'pending' | 'accepted' | 'declined' | 'cancelled'
    created_at: string
    trainer_user_id: string
    service_id: string
  }>

  const { data: relationships, error: relationshipsError } = await (supabase as any)
    .from('coaching_relationships')
    .select('id, status, trainer_user_id, service_id, started_at, source_request_id')
    .eq('client_user_id', user.id)
    .in('status', ['active', 'paused_by_platform'])
    .order('started_at', { ascending: false })
  if (relationshipsError) return <CoachingPageLoadError message="No se pudo cargar tu acompañamiento. Inténtalo de nuevo más tarde." />
  const relationship = (relationships as Array<{
    id: string
    status: 'active' | 'paused_by_platform'
    trainer_user_id: string
    service_id: string
    started_at: string
    source_request_id: string | null
  }> | null | undefined)
    ?.find(candidate => candidate.status === 'active')
    ?? (relationships as Array<{
      id: string
      status: 'active' | 'paused_by_platform'
      trainer_user_id: string
      service_id: string
      started_at: string
      source_request_id: string | null
    }> | null | undefined)?.find(candidate => candidate.status === 'paused_by_platform')

  const { data: assignedPrograms, error: assignmentsError } = await (supabase as any)
    .from('trainer_plan_assignments')
    .select('id, trainer_user_id, active_version_id, status, trainer_assignment_versions!trainer_assignment_versions_assignment_id_fkey(id, version_number, snapshot, change_summary)')
    .eq('client_user_id', user.id)
    .in('status', ['active', 'frozen'])
    .order('created_at', { ascending: false })
  const assignmentRows = (assignedPrograms ?? []) as Array<any>

  const trainerIds = Array.from(new Set([
    ...requestRows.map(request => request.trainer_user_id),
    ...(relationship ? [relationship.trainer_user_id] : []),
    ...assignmentRows.map(assignment => assignment.trainer_user_id),
  ]))
  const [{ data: profiles, error: profilesError }, { data: trainers, error: trainersError }] = trainerIds.length
    ? await Promise.all([
      (supabase as any).from('public_profiles').select('id, username, full_name, avatar_url').in('id', trainerIds),
      (supabase as any).from('active_trainer_directory').select('user_id, slug').in('user_id', trainerIds),
    ])
    : [{ data: [], error: null }, { data: [], error: null }]
  if (profilesError || trainersError) return <CoachingPageLoadError message="No se pudieron cargar los datos públicos de tu entrenador. Inténtalo de nuevo más tarde." />
  const profilesById = new Map((profiles ?? []).map((profile: any) => [profile.id, profile]))
  const trainerRows = (trainers ?? []) as Array<{ user_id: string; slug: string }>
  const serviceLookupResults = await Promise.allSettled(trainerRows.map(async trainer => {
    const { data: serviceRows, error: serviceError } = await (supabase as any).rpc('get_requestable_trainer_services', { trainer_slug: trainer.slug })
    if (serviceError) throw new Error('REQUESTABLE_TRAINER_SERVICES_UNAVAILABLE')
    const services = Array.isArray(serviceRows)
      ? serviceRows.flatMap(service => typeof service?.service_id === 'string' && typeof service.name === 'string'
        ? [{ id: service.service_id, name: service.name }]
        : [])
      : []
    return { trainerUserId: trainer.user_id, services }
  }))
  const servicesByTrainer = new Map<string, Array<{ id: string; name: string }>>()
  const serviceLookupFailures = new Set<string>()
  for (let index = 0; index < serviceLookupResults.length; index += 1) {
    const result = serviceLookupResults[index]
    if (result.status === 'fulfilled') servicesByTrainer.set(result.value.trainerUserId, result.value.services)
    else {
      const failedTrainer = trainerRows[index]
      if (failedTrainer) serviceLookupFailures.add(failedTrainer.user_id)
    }
  }

  function resolveTrainerEntry(trainerUserId: string, serviceId: string) {
    const profile = profilesById.get(trainerUserId) as { username?: string | null; full_name?: string | null; avatar_url?: string | null } | undefined
    const service = servicesByTrainer.get(trainerUserId)?.find(candidate => candidate.id === serviceId)
    return {
      trainerName: profile?.full_name?.trim() || profile?.username?.trim() || 'Entrenador no disponible',
      trainerAvatarUrl: profile?.avatar_url || null,
      serviceName: serviceLookupFailures.has(trainerUserId) ? 'No se pudo cargar el servicio.' : service?.name?.trim() || 'Servicio de acompañamiento no disponible',
    }
  }

  const requests = requestRows.map(request => ({
    id: request.id,
    status: request.status,
    createdAt: request.created_at,
    ...resolveTrainerEntry(request.trainer_user_id, request.service_id),
  }))
  const relationshipView = relationship ? {
    id: relationship.id,
    status: relationship.status,
    startedAt: relationship.started_at,
    sourceRequestId: relationship.source_request_id,
    ...resolveTrainerEntry(relationship.trainer_user_id, relationship.service_id),
  } : undefined
  const { data: consents, error: consentsError } = relationship
    ? await (supabase as any)
      .from('coaching_consents')
      .select('scope, text_version, granted_at, revoked_at')
      .eq('relationship_id', relationship.id)
    : { data: [], error: null }

  const routines = assignmentRows.map(assignment => {
    const versions = Array.isArray(assignment.trainer_assignment_versions) ? assignment.trainer_assignment_versions : []
    const version = versions.find((candidate: any) => candidate.id === assignment.active_version_id)
    const trainer = profilesById.get(assignment.trainer_user_id) as { full_name?: string; username?: string } | undefined
    let name = 'Rutina del entrenador'
    try { name = parseTrainerProgramSnapshot(version?.snapshot).name } catch { /* The library remains reachable if a historical snapshot is incomplete. */ }
    return { id: assignment.id, name, trainerName: trainer?.full_name?.trim() || trainer?.username?.trim() || 'Tu entrenador', version: version?.version_number, message: version?.change_summary }
  })

  return <main className="mx-auto max-w-lg px-4 pb-24 pt-6">
    <CoachingHeader description="Tu entrenador, tus rutinas y los datos que compartes." />
    <ClientCoachingStatus requests={requests} relationship={relationshipView}>
      {assignmentsError ? <p role="alert" className="rounded-2xl border border-red-500/30 p-4 text-sm text-foreground">No se pudieron cargar tus rutinas asignadas.</p> : routines.length ? <AssignedCoachingRoutines routines={routines} /> : relationship ? <section className="rounded-2xl border border-border/70 bg-card p-4">
        <h2 className="font-semibold text-foreground">Tus próximas rutinas</h2>
        <p className="mt-2 text-sm text-muted-foreground">Cuando tu entrenador te asigne una rutina, la encontrarás aquí y en Plan.</p>
      </section> : null}
      {consentsError ? <p role="alert" className="rounded-2xl border border-red-500/30 p-4 text-sm text-foreground">No se pudieron cargar tus consentimientos.</p> : relationship?.status === 'active' ? <ConsentManager relationshipId={relationship.id} consents={((consents ?? []) as Array<{ scope: CoachingConsentView['scope']; text_version: string; granted_at: string; revoked_at: string | null }>).map(consent => ({
        scope: consent.scope,
        textVersion: consent.text_version,
        grantedAt: consent.granted_at,
        revokedAt: consent.revoked_at,
      }))} /> : null}
      {serviceLookupFailures.size ? <p role="alert" className="rounded-2xl border border-red-500/30 p-4 text-sm text-foreground">Algunos servicios de acompañamiento no se pudieron cargar. Inténtalo de nuevo más tarde.</p> : null}
    </ClientCoachingStatus>
  </main>
}
