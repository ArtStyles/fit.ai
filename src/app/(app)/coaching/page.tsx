import { ClientCoachingStatus } from '@/components/coaching/ClientCoachingStatus'
import { ConsentManager, type CoachingConsentView } from '@/components/coaching/ConsentManager'
import { ProposedProgramReview } from '@/components/coaching/ProposedProgramReview'
import { requireAppUserContext } from '@/lib/auth/server'
import { getRequestableTrainerServicesBySlug } from '@/lib/coaching/directory'
import { parseTrainerProgramSnapshot } from '@/lib/coaching/programs'
import { selectLatestProposedAssignment } from '@/lib/coaching/proposals'

export default async function CoachingPage() {
  const { supabase, user } = await requireAppUserContext()
  const { data, error } = await supabase
    .from('coaching_requests')
    .select('id, status, created_at, trainer_user_id, service_id')
    .eq('client_user_id', user.id)
    .order('created_at', { ascending: false })
  if (error) return <main className="mx-auto max-w-lg px-4 pb-24 pt-6">
    <h1 className="text-2xl font-bold text-foreground">Acompañamiento</h1>
    <p role="alert" className="mt-4 rounded-2xl border border-red-500/30 p-4 text-sm text-foreground">No se pudo cargar el estado de tus solicitudes. Inténtalo de nuevo más tarde.</p>
  </main>

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
  const [{ data: profiles }, { data: trainers }] = trainerIds.length
    ? await Promise.all([
      (supabase as any).from('public_profiles').select('id, username, full_name, avatar_url').in('id', trainerIds),
      (supabase as any).from('active_trainer_directory').select('user_id, slug').in('user_id', trainerIds),
    ])
    : [{ data: [] }, { data: [] }]
  const profilesById = new Map((profiles ?? []).map((profile: any) => [profile.id, profile]))
  const trainerRows = (trainers ?? []) as Array<{ user_id: string; slug: string }>
  const servicesByTrainer = new Map(await Promise.all(trainerRows.map(async trainer => [
    trainer.user_id,
    trainer.slug ? await getRequestableTrainerServicesBySlug(trainer.slug) : [],
  ] as const)))

  function resolveTrainerEntry(trainerUserId: string, serviceId: string) {
    const profile = profilesById.get(trainerUserId) as { username?: string | null; full_name?: string | null; avatar_url?: string | null } | undefined
    const service = servicesByTrainer.get(trainerUserId)?.find(candidate => candidate.id === serviceId)
    return {
      trainerName: profile?.full_name?.trim() || profile?.username?.trim() || 'Entrenador no disponible',
      trainerAvatarUrl: profile?.avatar_url || null,
      serviceName: service?.name?.trim() || 'Servicio de acompañamiento no disponible',
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
      .select('id, trainer_user_id, status, created_at, trainer_assignment_versions(id, version_number, snapshot, status)')
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
    {relationshipsError || consentsError ? <p role="alert" className="mt-4 rounded-2xl border border-red-500/30 p-4 text-sm text-foreground">No se pudieron cargar tus consentimientos.</p> : relationship?.status === 'active' ? <ConsentManager relationshipId={relationship.id} consents={((consents ?? []) as Array<{ scope: CoachingConsentView['scope']; text_version: string; granted_at: string; revoked_at: string | null }>).map(consent => ({
      scope: consent.scope,
      textVersion: consent.text_version,
      grantedAt: consent.granted_at,
      revokedAt: consent.revoked_at,
    }))} /> : null}
    {proposalsError ? <p role="alert" className="mt-4 rounded-2xl border border-red-500/30 p-4 text-sm text-foreground">No se pudo cargar la rutina propuesta.</p> : proposedProgram ? <ProposedProgramReview proposal={proposedProgram} /> : null}
  </main>
}
