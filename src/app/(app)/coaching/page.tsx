import { ClientCoachingStatus } from '@/components/coaching/ClientCoachingStatus'
import { ConsentManager, type CoachingConsentView } from '@/components/coaching/ConsentManager'
import { ProposedProgramReview } from '@/components/coaching/ProposedProgramReview'
import { requireAppUserContext } from '@/lib/auth/server'
import { parseTrainerProgramSnapshot } from '@/lib/coaching/programs'
import { selectLatestProposedAssignment } from '@/lib/coaching/proposals'

const REQUEST_HISTORY_LIMIT = 20

function CoachingPageLoadError({ message }: { message: string }) {
  return <main className="mx-auto max-w-lg px-4 pb-24 pt-6">
    <h1 className="text-2xl font-bold text-foreground">Acompañamiento</h1>
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

  const trainerIds = Array.from(new Set([
    ...requestRows.map(request => request.trainer_user_id),
    ...(relationship ? [relationship.trainer_user_id] : []),
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

  const { data: proposedAssignments, error: proposalsError } = relationship
    ? await (supabase as any)
      .from('trainer_plan_assignments')
      .select('id, trainer_user_id, status, created_at, trainer_assignment_versions(id, version_number, snapshot, status, change_summary)')
      .eq('relationship_id', relationship.id)
      .eq('client_user_id', user.id)
      .eq('status', 'proposed')
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
    : { data: [], error: null }
  const assignment = selectLatestProposedAssignment(proposedAssignments as Array<any> | null | undefined)
  const rawVersion = assignment?.trainer_assignment_versions
  const version = (Array.isArray(rawVersion) ? rawVersion : rawVersion ? [rawVersion] : [])
    .filter((candidate: any) => candidate.status === 'proposed')
    .sort((left: any, right: any) => right.version_number - left.version_number)[0]
  let proposedProgram: Parameters<typeof ProposedProgramReview>[0]['proposal'] | null = null
  if (assignment && version) {
    try {
      const snapshot = parseTrainerProgramSnapshot(version.snapshot)
      const exerciseIds = snapshot.workouts.flatMap(workout => workout.exercises.map(exercise => exercise.exerciseId))
      const [trainerResponse, exerciseResponse] = await Promise.all([
        (supabase as any).from('active_trainer_directory').select('professional_name').eq('user_id', assignment.trainer_user_id).maybeSingle(),
        (supabase as any).from('exercises').select('id, name').in('id', exerciseIds).eq('is_public', true),
      ])
      proposedProgram = {
        assignmentId: assignment.id,
        versionNumber: version.version_number,
        changeSummary: version.change_summary,
        trainerName: trainerResponse.data?.professional_name ?? 'tu entrenador',
        snapshot,
        exerciseNames: Object.fromEntries(((exerciseResponse.data ?? []) as Array<{ id: string; name: string }>).map(exercise => [exercise.id, exercise.name])),
      }
    } catch {
      proposedProgram = null
    }
  }

  return <main className="mx-auto max-w-lg px-4 pb-24 pt-6">
    <header className="mb-6">
      <h1 className="text-2xl font-bold text-foreground">Acompañamiento</h1>
      <p className="mt-1 text-sm text-muted-foreground">Consulta el estado real de tus solicitudes. No se comparten datos de entrenamiento hasta que exista una relación aceptada.</p>
    </header>
    <ClientCoachingStatus requests={requests} relationship={relationshipView} />
    {serviceLookupFailures.size ? <p role="alert" className="mt-4 rounded-2xl border border-red-500/30 p-4 text-sm text-foreground">Algunos servicios de acompañamiento no se pudieron cargar. Inténtalo de nuevo más tarde.</p> : null}
    {relationshipsError || consentsError ? <p role="alert" className="mt-4 rounded-2xl border border-red-500/30 p-4 text-sm text-foreground">No se pudieron cargar tus consentimientos.</p> : relationship?.status === 'active' ? <ConsentManager relationshipId={relationship.id} consents={((consents ?? []) as Array<{ scope: CoachingConsentView['scope']; text_version: string; granted_at: string; revoked_at: string | null }>).map(consent => ({
      scope: consent.scope,
      textVersion: consent.text_version,
      grantedAt: consent.granted_at,
      revokedAt: consent.revoked_at,
    }))} /> : null}
    {proposalsError ? <p role="alert" className="mt-4 rounded-2xl border border-red-500/30 p-4 text-sm text-foreground">No se pudo cargar la rutina propuesta.</p> : proposedProgram ? <ProposedProgramReview proposal={proposedProgram} /> : null}
  </main>
}
