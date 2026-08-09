import { randomUUID } from 'node:crypto'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import {
  cleanupTrainerRelationshipsFixture,
  seedTrainerInsightsFixture,
  seedTrainerProgrammingFixture,
  seedTrainerRelationshipsFixture,
} from './core-product'

type QueryError = { code?: string; message?: string } | null

export const TRAINER_SECURITY_ID_FIELDS = [
  'applicationId',
  'credentialId',
  'requestId',
  'relationshipId',
  'clientId',
  'templateId',
  'assignmentId',
  'planId',
  'progressLogId',
] as const

export type TrainerSecurityIdField = typeof TRAINER_SECURITY_ID_FIELDS[number]

export const TRAINER_SECURITY_PREFLIGHT_ERROR =
  'Trainer security migrations 042, 043, 044, and 045 must be deployed before fixture writes'

type TrainerSecurityReadOnlyClient = {
  from(table: string): { select(columns: string): { limit(count: number): PromiseLike<{ error: QueryError }> } }
  rpc(name: string, args?: Record<string, unknown>): PromiseLike<{ data?: unknown; error: QueryError }>
}

export type TrainerSecurityProbeResult = { tableError: QueryError; marker: number | null }

/** The only remote operations allowed before the security fixture is created. */
export async function probeTrainerSecurityReadOnly(
  service: TrainerSecurityReadOnlyClient,
): Promise<TrainerSecurityProbeResult> {
  const [tables, markerResult] = await Promise.all([
    Promise.all([
      service.from('trainer_applications').select('id').limit(1),
      service.from('trainer_application_credentials').select('id').limit(1),
      service.from('coaching_requests').select('id,status').limit(1),
      service.from('coaching_relationships').select('id,status').limit(1),
      service.from('trainer_program_templates').select('id,status').limit(1),
      service.from('trainer_plan_assignments').select('id,status').limit(1),
      service.from('trainer_assignment_versions').select('id,version_number').limit(1),
      service.from('workout_plans').select('id,is_active').limit(1),
      service.from('progress_logs').select('id,client_session_id').limit(1),
      service.from('professional_audit_logs').select('id,entity_type').limit(1),
    ]),
    service.rpc('trainer_security_preflight'),
  ])

  return {
    tableError: tables.find(result => result.error)?.error ?? null,
    marker: markerResult.error || markerResult.data !== 45 ? null : 45,
  }
}

export async function assertTrainerSecuritySchemaReady(dependencies: {
  probeReadOnly: () => Promise<TrainerSecurityProbeResult>
}): Promise<void> {
  try {
    const probe = await dependencies.probeReadOnly()
    if (probe.tableError || probe.marker !== 45) throw new Error(TRAINER_SECURITY_PREFLIGHT_ERROR)
  } catch {
    throw new Error(TRAINER_SECURITY_PREFLIGHT_ERROR)
  }
}

export type SecurityDeniedResult = {
  data: unknown
  error: { code?: string; message?: string } | null
}

export function requireDeniedGenericOutcome(result: SecurityDeniedResult): {
  code: string | null
  domain: string | null
} {
  if (!result.error) throw new Error('IDOR attempt unexpectedly succeeded')
  if (result.data !== null && result.data !== undefined) throw new Error('IDOR denial leaked a response payload')
  const code = result.error.code ?? null
  const domain = result.error.message?.match(/\b[A-Z][A-Z0-9_]{3,}\b/)?.[0] ?? null
  if (!code && !domain) throw new Error('IDOR result did not expose a generic denial code')
  return { code, domain }
}

/** A failed preflight has no compensating cleanup because no write was attempted. */
export async function runTrainerSecurityFixtureAfterPreflight<T>(input: {
  preflight: () => Promise<void>
  seed: () => Promise<T>
  cleanup?: () => Promise<void>
}): Promise<T> {
  await input.preflight()
  try {
    return await input.seed()
  } catch (error) {
    if (input.cleanup) await input.cleanup()
    throw error
  }
}

export async function assertTrainerSecurityRemoteReady(service: SupabaseClient): Promise<void> {
  await assertTrainerSecuritySchemaReady({
    probeReadOnly: () => probeTrainerSecurityReadOnly(service as unknown as TrainerSecurityReadOnlyClient),
  })
}

type RpcResult = { data: unknown; error: { message?: string } | null }

async function independentActor(email: string, password: string): Promise<SupabaseClient> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !anonKey) throw new Error('Dedicated E2E Supabase configuration is required')
  const client = createClient(url, anonKey, { auth: { autoRefreshToken: false, persistSession: false } })
  const { error } = await client.auth.signInWithPassword({ email, password })
  if (error) throw new Error('Could not authenticate an isolated trainer security actor')
  return client
}

export type PreparedSecurityRace = {
  actors: Record<string, SupabaseClient>
  run: Record<string, () => PromiseLike<RpcResult>>
  inspect: () => Promise<Record<string, unknown>>
  resetPolicy: 'ordinary-cleanup' | 'dedicated-project-reset'
  cleanup: () => Promise<void>
}

export type PreparedIdorSecurityRace = PreparedSecurityRace & {
  foreignIds: Record<TrainerSecurityIdField, string>
  missingIds: Record<TrainerSecurityIdField, string>
  attempt: (field: TrainerSecurityIdField, kind: 'foreign' | 'missing') => Promise<RpcResult>
}

export async function runPreparedTrainerSecurityRace<
  R extends { cleanup: () => Promise<void>; resetPolicy: 'ordinary-cleanup' | 'dedicated-project-reset' },
  T,
>(input: { prepare: () => Promise<R>; exercise: (race: R) => Promise<T> }): Promise<T> {
  const race = await input.prepare()
  try {
    return await input.exercise(race)
  } finally {
    await race.cleanup()
  }
}

async function signOutSecurityActors(actors: Record<string, SupabaseClient>): Promise<void> {
  await Promise.allSettled(Object.values(actors).map(actor => actor.auth.signOut()))
}

export async function prepareTwoTrainerAcceptRace(scope: string, password: string): Promise<PreparedSecurityRace> {
  const fixture = await seedTrainerRelationshipsFixture(scope, { skipReadiness: true })
  const actors: Record<string, SupabaseClient> = {
    fixtureClient: fixture.client.client,
    fixtureTrainerA: fixture.trainerA.client,
    fixtureTrainerB: fixture.trainerB.client,
  }
  try {
    const first = await (fixture.client.client.rpc as any)('create_coaching_request', {
      service_id: fixture.trainerA.serviceId, message: 'Security request A', consent_version: 'training-profile-v1', idempotency_key: randomUUID(),
    })
    const firstId = first.data?.[0]?.request_id
    if (first.error || !firstId) throw new Error('Could not prepare first competing coaching request')
    fixture.created.requestIds.push(firstId)
    const second = await (fixture.client.client.rpc as any)('create_coaching_request', {
      service_id: fixture.trainerB.serviceId, message: 'Security request B', consent_version: 'training-profile-v1', idempotency_key: randomUUID(),
    })
    const secondId = second.data?.[0]?.request_id
    if (second.error || !secondId) throw new Error('Could not prepare second competing coaching request')
    fixture.created.requestIds.push(secondId)
    const trainerA = await independentActor(fixture.trainerA.email, password)
    actors.trainerA = trainerA
    const trainerB = await independentActor(fixture.trainerB.email, password)
    actors.trainerB = trainerB
    return {
      actors,
      run: {
        trainerA: () => (trainerA.rpc as any)('accept_coaching_request', { request_id: firstId, idempotency_key: randomUUID() }),
        trainerB: () => (trainerB.rpc as any)('accept_coaching_request', { request_id: secondId, idempotency_key: randomUUID() }),
      },
      inspect: async () => {
        const [{ data: relationships }, { data: requests }] = await Promise.all([
          (fixture.service.from('coaching_relationships') as any).select('id,status').eq('client_user_id', fixture.client.id),
          (fixture.service.from('coaching_requests') as any).select('id,status').in('id', [firstId, secondId]),
        ])
        return { relationships, requests }
      },
      resetPolicy: 'ordinary-cleanup',
      cleanup: async () => {
        await signOutSecurityActors(actors)
        await cleanupTrainerRelationshipsFixture(fixture)
      },
    }
  } catch (error) {
    await signOutSecurityActors(actors)
    await cleanupTrainerRelationshipsFixture(fixture)
    throw error
  }
}

async function programmingRace(scope: string) {
  const actors: Record<string, SupabaseClient> = {}
  try {
    const fixture = await seedTrainerProgrammingFixture(scope, { skipReadiness: true })
    Object.assign(actors, {
      fixtureTrainer: fixture.trainerA.client,
      fixtureClient: fixture.client.client,
    })
    const proposal = await fixture.createTemplateAndPropose('Security concurrent program', `proposal-${scope}`)
    const trainerA = await independentActor(fixture.trainerA.email, fixture.password)
    actors.trainerA = trainerA
    const trainerB = await independentActor(fixture.trainerA.email, fixture.password)
    actors.trainerB = trainerB
    const client = await independentActor(fixture.client.email, fixture.password)
    actors.client = client
    const admin = await independentActor(fixture.admin.email, fixture.password)
    actors.admin = admin
    return { fixture, proposal, trainerA, trainerB, client, admin, actors }
  } catch (error) {
    await signOutSecurityActors(actors)
    throw error
  }
}

async function suspendThroughAuthenticatedAdmin(
  admin: SupabaseClient,
  targetUserId: string,
): Promise<RpcResult> {
  const { data: session, error: sessionError } = await admin.auth.getSession()
  const accessToken = session.session?.access_token
  if (sessionError || !accessToken) return { data: null, error: { message: 'ADMIN_AUTH_REQUIRED' } }
  const baseUrl = process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:3000'
  const response = await fetch(`${baseUrl}/api/e2e/trainer-security/suspend`, {
    method: 'POST',
    headers: { authorization: `Bearer ${accessToken}`, 'content-type': 'application/json' },
    body: JSON.stringify({ targetUserId }),
  })
  const body = await response.json().catch(() => null)
  return response.ok
    ? { data: body, error: null }
    : { data: null, error: { message: typeof body?.error === 'string' ? body.error : 'ADMIN_SUSPENSION_FAILED' } }
}

export async function prepareIdempotentProposalRace(scope: string): Promise<PreparedSecurityRace> {
  const prepared = await programmingRace(scope)
  const actors = prepared.actors
  const args = {
    p_relationship_id: prepared.fixture.relationshipId,
    p_template_id: prepared.proposal.templateId,
    p_change_summary: 'Retry must return the original object',
    p_idempotency_key: prepared.proposal.proposalIdempotencyKey,
  }
  return {
    actors,
    run: {
      trainerA: () => (prepared.trainerA.rpc as any)('propose_trainer_assignment', args),
      trainerB: () => (prepared.trainerB.rpc as any)('propose_trainer_assignment', args),
    },
    inspect: async () => {
      const [{ data: assignments }, { data: versions }, { data: plans }] = await Promise.all([
        (prepared.fixture.service.from('trainer_plan_assignments') as any).select('id,status').eq('proposal_idempotency_key', prepared.proposal.proposalIdempotencyKey),
        (prepared.fixture.service.from('trainer_assignment_versions') as any).select('id,materialized_plan_id').eq('assignment_id', prepared.proposal.assignmentId),
        (prepared.fixture.service.from('workout_plans') as any).select('id,is_active').eq('trainer_assignment_id', prepared.proposal.assignmentId),
      ])
      return { assignments, versions, plans }
    },
    resetPolicy: 'dedicated-project-reset',
    cleanup: () => signOutSecurityActors(actors),
  }
}

export async function prepareAcceptPublishSuspendRace(scope: string): Promise<PreparedSecurityRace> {
  const prepared = await programmingRace(scope)
  const actors = prepared.actors
  return {
    actors,
    run: {
      accept: () => (prepared.client.rpc as any)('accept_trainer_assignment', { p_assignment_id: prepared.proposal.assignmentId, p_idempotency_key: `accept-${scope}` }),
      publish: () => (prepared.trainerA.rpc as any)('publish_trainer_assignment_revision', { p_assignment_id: prepared.proposal.assignmentId, p_template_id: prepared.proposal.templateId, p_change_summary: 'Concurrent publish', p_idempotency_key: `publish-${scope}` }),
      suspend: () => suspendThroughAuthenticatedAdmin(prepared.admin, prepared.fixture.trainerA.id),
    },
    inspect: async () => {
      const [{ data: account }, { data: trainerProfile }, { data: relationship }, { data: consents }, { data: assignments }, { data: versions }, { data: plans }] = await Promise.all([
        (prepared.fixture.service.from('profiles') as any).select('id,account_status').eq('id', prepared.fixture.trainerA.id).maybeSingle(),
        (prepared.fixture.service.from('trainer_profiles') as any).select('id,status').eq('user_id', prepared.fixture.trainerA.id).maybeSingle(),
        (prepared.fixture.service.from('coaching_relationships') as any).select('id,status,paused_at').eq('id', prepared.fixture.relationshipId).maybeSingle(),
        (prepared.fixture.service.from('coaching_consents') as any).select('id,scope,revoked_at').eq('relationship_id', prepared.fixture.relationshipId),
        (prepared.fixture.service.from('trainer_plan_assignments') as any).select('id,status,active_version_id').eq('id', prepared.proposal.assignmentId),
        (prepared.fixture.service.from('trainer_assignment_versions') as any).select('id,status,materialized_plan_id,version_number').eq('assignment_id', prepared.proposal.assignmentId),
        (prepared.fixture.service.from('workout_plans') as any).select('id,is_active').eq('trainer_assignment_id', prepared.proposal.assignmentId),
      ])
      return { account, trainerProfile, relationship, consents, assignments, versions, plans }
    },
    resetPolicy: 'dedicated-project-reset',
    cleanup: () => signOutSecurityActors(actors),
  }
}

export async function prepareRevisionRace(scope: string): Promise<PreparedSecurityRace> {
  const prepared = await programmingRace(scope)
  const accepted = await (prepared.client.rpc as any)('accept_trainer_assignment', { p_assignment_id: prepared.proposal.assignmentId, p_idempotency_key: `accept-${scope}` })
  if (accepted.error) {
    await signOutSecurityActors(prepared.actors)
    throw new Error('Could not prepare revision race')
  }
  const revision = (client: SupabaseClient, suffix: string) => () => (client.rpc as any)('publish_trainer_assignment_revision', {
    p_assignment_id: prepared.proposal.assignmentId, p_template_id: prepared.proposal.templateId,
    p_change_summary: `Concurrent revision ${suffix}`, p_idempotency_key: `revision-${scope}-${suffix}`,
  })
  const actors = prepared.actors
  return {
    actors,
    run: { trainerA: revision(prepared.trainerA, 'a'), trainerB: revision(prepared.trainerB, 'b') },
    inspect: async () => {
      const [{ data: versions }, { data: plans }] = await Promise.all([
        (prepared.fixture.service.from('trainer_assignment_versions') as any).select('id,status,materialized_plan_id,version_number').eq('assignment_id', prepared.proposal.assignmentId),
        (prepared.fixture.service.from('workout_plans') as any).select('id,is_active').eq('trainer_assignment_id', prepared.proposal.assignmentId),
      ])
      return { versions, plans }
    },
    resetPolicy: 'dedicated-project-reset',
    cleanup: () => signOutSecurityActors(actors),
  }
}

export async function prepareEndReadEvidenceRace(scope: string): Promise<PreparedSecurityRace> {
  const fixture = await seedTrainerInsightsFixture(scope, { skipReadiness: true })
  const actors: Record<string, SupabaseClient> = {
    fixtureTrainer: fixture.trainerA.client,
    fixtureClient: fixture.client.client,
  }
  try {
  const proposal = await fixture.createTemplateAndPropose('Security evidence program', `proposal-${scope}`)
  const accepted = await (fixture.client.client.rpc as any)('accept_trainer_assignment', { p_assignment_id: proposal.assignmentId, p_idempotency_key: `accept-${scope}` })
  if (accepted.error) throw new Error('Could not prepare evidence race')
  await fixture.prepareInsightsEvidence()
  const trainerA = await independentActor(fixture.trainerA.email, fixture.password)
  actors.trainerA = trainerA
  const trainerB = await independentActor(fixture.trainerA.email, fixture.password)
  actors.trainerB = trainerB
  return {
    actors,
    run: {
      end: () => (trainerA.rpc as any)('end_coaching_relationship', { p_relationship_id: fixture.relationshipId, p_reason: 'Security evidence race', p_idempotency_key: randomUUID() }),
      read: () => (trainerB.rpc as any)('get_coach_client_insights', { p_client_id: fixture.client.id, p_from_date: new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10), p_to_date: new Date().toISOString().slice(0, 10) }),
      readAfter: () => (trainerB.rpc as any)('get_coach_client_insights', { p_client_id: fixture.client.id, p_from_date: new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10), p_to_date: new Date().toISOString().slice(0, 10) }),
    },
    inspect: async () => {
      const [{ data: relationship }, { data: consents }, { data: assignments }, { data: versions }, { data: plans }] = await Promise.all([
        (fixture.service.from('coaching_relationships') as any).select('id,status,ended_at').eq('id', fixture.relationshipId).maybeSingle(),
        (fixture.service.from('coaching_consents') as any).select('id,scope,revoked_at').eq('relationship_id', fixture.relationshipId),
        (fixture.service.from('trainer_plan_assignments') as any).select('id,status,active_version_id').eq('relationship_id', fixture.relationshipId),
        (fixture.service.from('trainer_assignment_versions') as any).select('id,assignment_id,status,materialized_plan_id'),
        (fixture.service.from('workout_plans') as any).select('id,is_active,trainer_assignment_id').eq('trainer_relationship_id', fixture.relationshipId),
      ])
      const assignmentIds = new Set((assignments ?? []).map((assignment: { id: string }) => assignment.id))
      return { relationship, consents, assignments, versions: (versions ?? []).filter((version: { assignment_id: string }) => assignmentIds.has(version.assignment_id)), plans }
    },
    resetPolicy: 'dedicated-project-reset',
    cleanup: () => signOutSecurityActors(actors),
  }
  } catch (error) {
    await signOutSecurityActors(actors)
    throw error
  }
}

async function snapshotRows(query: PromiseLike<{ data: unknown; error: QueryError }>, label: string): Promise<unknown[]> {
  const { data, error } = await query
  if (error) throw new Error(`Reading security snapshot ${label} failed`)
  return Array.isArray(data) ? data : data ? [data] : []
}

export async function prepareAuthoritativeIdorRace(scope: string): Promise<PreparedIdorSecurityRace> {
  const preparationActors: Record<string, SupabaseClient> = {}
  try {
  const attacker = await programmingRace(`${scope}-attacker`)
  Object.assign(preparationActors, attacker.actors)
  const foreign = await seedTrainerInsightsFixture(`${scope}-foreign`, { skipReadiness: true })
  Object.assign(preparationActors, {
    foreignTrainer: foreign.trainerA.client,
    foreignClient: foreign.client.client,
  })
  const foreignProposal = await foreign.createTemplateAndPropose('Foreign IDOR program', `proposal-${scope}-foreign`)
  const accepted = await (foreign.client.client.rpc as any)('accept_trainer_assignment', {
    p_assignment_id: foreignProposal.assignmentId,
    p_idempotency_key: `accept-${scope}-foreign`,
  })
  if (accepted.error) throw new Error('Could not accept the foreign IDOR assignment')
  const evidence = await foreign.prepareInsightsEvidence()
  const credentialId = randomUUID()
  const credential = await (foreign.service.from('trainer_application_credentials') as any).insert({
    id: credentialId,
    application_id: foreign.trainerA.applicationId,
    credential_type: 'link',
    title: 'Foreign IDOR credential',
    external_url: 'https://example.test/foreign-credential',
  })
  if (credential.error) throw new Error('Could not create the foreign IDOR credential')
  const request = await (foreign.client.client.rpc as any)('create_coaching_request', {
    service_id: foreign.trainerB.serviceId,
    message: 'Foreign IDOR request',
    consent_version: 'training-profile-v1',
    idempotency_key: randomUUID(),
  })
  if (request.error || !request.data?.[0]?.request_id) throw new Error('Could not create the foreign IDOR request')
  const requestId = request.data[0].request_id as string
  const activeAssignment = await (foreign.service.from('trainer_plan_assignments') as any)
    .select('active_version_id').eq('id', foreignProposal.assignmentId).single()
  if (activeAssignment.error || !activeAssignment.data?.active_version_id) throw new Error('Foreign IDOR assignment has no active version')
  const activeVersion = await (foreign.service.from('trainer_assignment_versions') as any)
    .select('materialized_plan_id').eq('id', activeAssignment.data.active_version_id).single()
  if (activeVersion.error || !activeVersion.data?.materialized_plan_id) throw new Error('Foreign IDOR version has no materialized plan')

  const foreignIds: Record<TrainerSecurityIdField, string> = {
    applicationId: foreign.trainerA.applicationId,
    credentialId,
    requestId,
    relationshipId: foreign.relationshipId,
    clientId: foreign.client.id,
    templateId: foreignProposal.templateId,
    assignmentId: foreignProposal.assignmentId,
    planId: activeVersion.data.materialized_plan_id,
    progressLogId: evidence.currentProfessionalProgressLogId,
  }
  const missingIds = Object.fromEntries(TRAINER_SECURITY_ID_FIELDS.map(field => [field, randomUUID()])) as Record<TrainerSecurityIdField, string>
  const actor = attacker.trainerA
  const idFor = (field: TrainerSecurityIdField, kind: 'foreign' | 'missing') =>
    kind === 'foreign' ? foreignIds[field] : missingIds[field]
  const attempt = async (field: TrainerSecurityIdField, kind: 'foreign' | 'missing'): Promise<RpcResult> => {
    const id = idFor(field, kind)
    switch (field) {
      case 'applicationId': return (actor.rpc as any)('submit_trainer_application', { p_application_id: id })
      case 'credentialId': return (actor.rpc as any)('prepare_trainer_credential_removal', {
        p_application_id: kind === 'foreign' ? foreignIds.applicationId : missingIds.applicationId,
        p_credential_id: id,
      })
      case 'requestId': return (actor.rpc as any)('accept_coaching_request', { request_id: id, idempotency_key: randomUUID() })
      case 'relationshipId': return (actor.rpc as any)('end_coaching_relationship', { p_relationship_id: id, p_reason: null, p_idempotency_key: randomUUID() })
      case 'clientId': return (actor.rpc as any)('get_coach_client_insights', { p_client_id: id, p_from_date: '2026-07-01', p_to_date: '2026-08-01' })
      case 'templateId': return (actor.rpc as any)('propose_trainer_assignment', {
        p_relationship_id: attacker.fixture.relationshipId,
        p_template_id: id,
        p_change_summary: null,
        p_idempotency_key: randomUUID(),
      })
      case 'assignmentId': return (actor.rpc as any)('publish_trainer_assignment_revision', {
        p_assignment_id: id,
        p_template_id: attacker.proposal.templateId,
        p_change_summary: 'Blocked IDOR revision',
        p_idempotency_key: randomUUID(),
      })
      case 'planId': return (actor.from('workout_plans') as any).update({ name: 'IDOR blocked' }).eq('id', id).select('id').single()
      case 'progressLogId': return (actor.from('progress_logs') as any).update({ notes: 'IDOR blocked' }).eq('id', id).select('id').single()
    }
  }

  const inspect = async (): Promise<Record<string, unknown>> => {
    const service = foreign.service
    const assignmentIds = [foreignIds.assignmentId]
    const versions = await snapshotRows((service.from('trainer_assignment_versions') as any).select('*').in('assignment_id', assignmentIds).order('id'), 'versions')
    const planIds = (versions as Array<{ materialized_plan_id?: string | null }>).map(row => row.materialized_plan_id).filter((id): id is string => Boolean(id))
    const workouts = await snapshotRows((service.from('workouts') as any).select('*').in('plan_id', planIds).order('id'), 'workouts')
    const workoutIds = (workouts as Array<{ id: string }>).map(row => row.id)
    const templateWorkouts = await snapshotRows((service.from('trainer_template_workouts') as any).select('*').eq('template_id', foreignIds.templateId).order('id'), 'template workouts')
    const templateWorkoutIds = (templateWorkouts as Array<{ id: string }>).map(row => row.id)
    const involvedUsers = [foreign.trainerA.id, foreign.client.id]
    return {
      applications: await snapshotRows((service.from('trainer_applications') as any).select('*').eq('id', foreignIds.applicationId).order('id'), 'applications'),
      credentials: await snapshotRows((service.from('trainer_application_credentials') as any).select('*').eq('id', foreignIds.credentialId).order('id'), 'credentials'),
      credentialCleanup: await snapshotRows((service.from('trainer_credential_storage_cleanup') as any).select('*').eq('application_id', foreignIds.applicationId).order('id'), 'credential cleanup'),
      applicationEvents: await snapshotRows((service.from('trainer_application_events') as any).select('*').eq('application_id', foreignIds.applicationId).order('id'), 'application events'),
      interviews: await snapshotRows((service.from('trainer_interviews') as any).select('*').eq('application_id', foreignIds.applicationId).order('id'), 'interviews'),
      trainerProfiles: await snapshotRows((service.from('trainer_profiles') as any).select('*').eq('source_application_id', foreignIds.applicationId).order('id'), 'trainer profiles'),
      serviceOfferings: await snapshotRows((service.from('trainer_service_offerings') as any).select('*').in('trainer_id', [foreign.trainerA.id, foreign.trainerB.id]).order('id'), 'service offerings'),
      requests: await snapshotRows((service.from('coaching_requests') as any).select('*').eq('id', foreignIds.requestId).order('id'), 'requests'),
      relationships: await snapshotRows((service.from('coaching_relationships') as any).select('*').eq('id', foreignIds.relationshipId).order('id'), 'relationships'),
      consents: await snapshotRows((service.from('coaching_consents') as any).select('*').eq('relationship_id', foreignIds.relationshipId).order('id'), 'consents'),
      templates: await snapshotRows((service.from('trainer_program_templates') as any).select('*').eq('id', foreignIds.templateId).order('id'), 'templates'),
      templateWorkouts,
      templateExercises: await snapshotRows((service.from('trainer_template_exercises') as any).select('*').in('template_workout_id', templateWorkoutIds).order('id'), 'template exercises'),
      assignments: await snapshotRows((service.from('trainer_plan_assignments') as any).select('*').in('id', assignmentIds).order('id'), 'assignments'),
      versions,
      plans: await snapshotRows((service.from('workout_plans') as any).select('*').in('id', planIds).order('id'), 'plans'),
      workouts,
      workoutExercises: await snapshotRows((service.from('workout_exercises') as any).select('*').in('workout_id', workoutIds).order('id'), 'workout exercises'),
      progressLogs: await snapshotRows((service.from('progress_logs') as any).select('*').eq('id', foreignIds.progressLogId).order('id'), 'progress logs'),
      exerciseLogs: await snapshotRows((service.from('exercise_logs') as any).select('*').eq('progress_log_id', foreignIds.progressLogId).order('id'), 'exercise logs'),
      notifications: await snapshotRows((service.from('product_notifications') as any).select('*').in('user_id', involvedUsers).order('id'), 'notifications'),
      auditByActor: await snapshotRows((service.from('professional_audit_logs') as any).select('*').in('actor_user_id', involvedUsers).order('id'), 'actor audits'),
      auditBySubject: await snapshotRows((service.from('professional_audit_logs') as any).select('*').in('subject_user_id', involvedUsers).order('id'), 'subject audits'),
    }
  }
  const actors = preparationActors
  return {
    actors,
    run: {},
    inspect,
    resetPolicy: 'dedicated-project-reset',
    cleanup: () => signOutSecurityActors(actors),
    foreignIds,
    missingIds,
    attempt,
  }
  } catch (error) {
    await signOutSecurityActors(preparationActors)
    throw error
  }
}
