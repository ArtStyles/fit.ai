export type ClientCoachingSummary = {
  relationshipId: string
  relationshipStatus: 'active' | 'paused_by_platform'
  trainerUserId: string
  trainerName: string
  trainerAvatarUrl: string | null
  trainerSlug: string | null
  serviceId: string
  serviceName: string
  startedAt: string
  trainingConsentActive: boolean
  assignmentStatus: 'proposed' | 'active' | null
}

export type ClientCoachingSummaryResult = {
  summary: ClientCoachingSummary | null
  error: string | null
}

export type ClientCoachingSummaryClient = {
  from: (table: string) => any
  rpc: (functionName: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: unknown }>
}

type RelationshipRow = {
  id: string
  status: 'active' | 'paused_by_platform'
  trainer_user_id: string
  service_id: string
  started_at: string
}

type ProfileRow = {
  full_name: string | null
  username: string | null
  avatar_url: string | null
}

type DirectoryRow = { slug: string | null }
type ConsentRow = { scope: 'training_profile'; revoked_at: string | null }
type AssignmentRow = { id: string; status: 'proposed' | 'active'; created_at: string }
type ServiceRow = { service_id: string; name: string }

function firstRow<T>(value: unknown): T | null {
  return Array.isArray(value) && value.length > 0 ? value[0] as T : null
}

export async function loadClientCoachingSummary(
  supabase: ClientCoachingSummaryClient,
  clientUserId: string,
): Promise<ClientCoachingSummaryResult> {
  const relationshipResponse = await supabase
    .from('coaching_relationships')
    .select('id, status, trainer_user_id, service_id, started_at')
    .eq('client_user_id', clientUserId)
    .in('status', ['active', 'paused_by_platform'])
    .order('started_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(1)

  if (relationshipResponse.error) {
    return { summary: null, error: 'No se pudo cargar tu acompañamiento.' }
  }

  const relationship = firstRow<RelationshipRow>(relationshipResponse.data)
  if (!relationship) return { summary: null, error: null }

  const [profileResponse, directoryResponse, consentResponse, assignmentResponse] = await Promise.all([
    supabase
      .from('public_profiles')
      .select('id, username, full_name, avatar_url')
      .eq('id', relationship.trainer_user_id)
      .limit(1),
    supabase
      .from('active_trainer_directory')
      .select('user_id, slug')
      .eq('user_id', relationship.trainer_user_id)
      .limit(1),
    supabase
      .from('coaching_consents')
      .select('scope, revoked_at')
      .eq('relationship_id', relationship.id)
      .eq('scope', 'training_profile')
      .is('revoked_at', null)
      .limit(1),
    supabase
      .from('trainer_plan_assignments')
      .select('id, status, created_at')
      .eq('relationship_id', relationship.id)
      .in('status', ['proposed', 'active'])
      .order('created_at', { ascending: false })
      .order('id', { ascending: false }),
  ])

  const profile = profileResponse.error ? null : firstRow<ProfileRow>(profileResponse.data)
  const directory = directoryResponse.error ? null : firstRow<DirectoryRow>(directoryResponse.data)
  const consent = consentResponse.error ? null : firstRow<ConsentRow>(consentResponse.data)
  const assignments = assignmentResponse.error || !Array.isArray(assignmentResponse.data)
    ? []
    : assignmentResponse.data as AssignmentRow[]
  const assignment = assignments.find(candidate => candidate.status === 'proposed')
    ?? assignments.find(candidate => candidate.status === 'active')

  let serviceName = 'Servicio de acompañamiento no disponible'
  if (directory?.slug) {
    const serviceResponse = await supabase.rpc('get_requestable_trainer_services', { trainer_slug: directory.slug })
    const services = Array.isArray(serviceResponse.data) ? serviceResponse.data as ServiceRow[] : []
    const service = serviceResponse.error
      ? null
      : services.find(candidate => candidate.service_id === relationship.service_id)
    if (typeof service?.name === 'string' && service.name.trim()) serviceName = service.name.trim()
  }

  return {
    summary: {
      relationshipId: relationship.id,
      relationshipStatus: relationship.status,
      trainerUserId: relationship.trainer_user_id,
      trainerName: profile?.full_name?.trim() || profile?.username?.trim() || 'Entrenador no disponible',
      trainerAvatarUrl: profile?.avatar_url || null,
      trainerSlug: directory?.slug || null,
      serviceId: relationship.service_id,
      serviceName,
      startedAt: relationship.started_at,
      trainingConsentActive: Boolean(consent),
      assignmentStatus: assignment?.status ?? null,
    },
    error: null,
  }
}
