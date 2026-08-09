import { createHash, randomUUID } from 'node:crypto'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import {
  requireE2EConfig,
  seedE2EAccount,
  type E2ESeedConfig,
} from '../../../scripts/seed-e2e-account'

type CoreLanguage = 'es' | 'en'

export type CoreProductFixture = {
  userId: string
  planId: string
  workoutId: string
  exerciseId: string
}

export type HistoryContinuityFixture = {
  userId: string
  progressLogId: string
  sourcePlanId: string
  sourceWorkoutId: string
  activePlanId: string
  activeWorkoutId: string
}

type QueryError = { message?: string } | null

/** Trainer relationship E2E is deliberately opt-in because it creates several
 * service-role fixtures and needs the dedicated run-scoped credentials. */
export function isTrainerRelationshipsE2EEnabled(env: NodeJS.ProcessEnv): boolean {
  return env.E2E_TRAINER_RELATIONSHIPS_ENABLED === 'true'
}

/** Programming writes are intentionally opt-in: published professional plans
 * cannot be removed through ordinary REST cleanup. The dedicated database must
 * be reset by its owner after the suite, and that acknowledgement is required
 * before this test can create immutable evidence. */
export function isTrainerProgrammingE2EEnabled(env: NodeJS.ProcessEnv): boolean {
  return isTrainerRelationshipsE2EEnabled(env)
    && env.E2E_TRAINER_PROGRAMMING_ENABLED === 'true'
    && env.E2E_TRAINER_PROGRAMMING_RETENTION_ACK === 'dedicated-project-reset'
}

export type TrainerRelationshipsFixture = {
  client: { id: string; email: string; client: SupabaseClient }
  trainerA: { id: string; email: string; client: SupabaseClient; profileId: string; serviceId: string; slug: string; professionalName: string }
  trainerB: { id: string; email: string; client: SupabaseClient; profileId: string; serviceId: string; slug: string; professionalName: string }
  admin: { id: string; email: string }
  service: SupabaseClient
  runId: string
  scope: string
  created: {
    userIds: string[]
    applicationIds: string[]
    profileIds: string[]
    serviceIds: string[]
    requestIds: string[]
    relationshipIds: string[]
    consentIds: string[]
  }
}

type TrainerProgrammingAuthorization = {
  clientSessionId: string
  workoutId: string
  planId: string
  assignmentVersionId: string
}

type TrainerProgrammingProposal = {
  templateId: string
  assignmentId: string
  assignmentVersionId: string
  planId: string
}

export type TrainerProgrammingFixture = TrainerRelationshipsFixture & {
  password: string
  relationshipId: string
  personalPlanId: string
  createTemplateAndPropose(name: string): Promise<TrainerProgrammingProposal>
  readAcceptedAssignment(assignmentId: string): Promise<{
    planId: string
    personalPlanIsActive: boolean
    personalPlanStillExists: boolean
    snapshot: { name: string }
  }>
  authorizeCurrentProfessionalSession(): Promise<TrainerProgrammingAuthorization>
  saveUnauthorizedProfessionalExercise(authorization: TrainerProgrammingAuthorization, exerciseId: string): Promise<never>
  publishRevision(name: string, changeSummary: string): Promise<{
    assignmentVersionId: string
    planId: string
    versionNumber: number
    previousVersionEffectiveTo: string | null
  }>
  readAuthorizedSession(clientSessionId: string): Promise<{
    planId: string
    assignmentVersionId: string | null
  }>
  saveAuthorizedSessionWithActualResults(authorization: TrainerProgrammingAuthorization): Promise<{
    inserted: boolean
    progressLogId: string
    retryProgressLogId: string
    retryInserted: boolean
    progressLogCount: number
    exerciseLogCount: number
    consumedAtBeforeRetry: string | null
    consumedAtAfterRetry: string | null
    actualResult: {
      setsCompleted: number
      repsCompleted: number[]
      weightsKg: number[]
      rpeValues: number[]
      notes: string | null
    }
    skipNote: string | null
  }>
  moveToDifferentPolicyDate(): Promise<void>
}

type TrainerRelationshipRows = {
  relationshipId: string
  firstRequestId: string
  competingRequestId: string
}

function requireTrainerRelationshipsAnonKey(env: NodeJS.ProcessEnv): string {
  const value = env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!value) throw new Error('NEXT_PUBLIC_SUPABASE_ANON_KEY is required for trainer relationships E2E')
  return value
}

type TrainerRelationshipRole = 'client' | 'trainer-a' | 'trainer-b' | 'admin'

type TrainerRelationshipScopeInput = {
  projectName: string
  workerIndex: number
  parallelIndex: number
  retry: number
}

function cleanScopePart(value: string, fallback: string): string {
  const cleaned = value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
  return (cleaned || fallback).slice(0, 20).replace(/-+$/, '')
}

export function deriveTrainerRelationshipScope(input: TrainerRelationshipScopeInput): string {
  return `${cleanScopePart(input.projectName, 'project')}-w${input.workerIndex}-p${input.parallelIndex}-r${input.retry}`
}

export function deriveTrainerRelationshipIdentity(
  runId: string,
  scope: string,
  role: TrainerRelationshipRole,
): { email: string; username: string } {
  const runPart = cleanScopePart(runId, 'run').slice(0, 18)
  const scopePart = cleanScopePart(scope, 'scope').slice(0, 16).replace(/-+$/, '')
  const hash = createHash('sha256').update(`${runId}:${scope}:${role}`).digest('hex').slice(0, 8)
  const localPart = `e2e-${runPart}-${scopePart}-${hash}-${role}`
  return { email: `${localPart}@example.test`, username: localPart.replace(/-/g, '_') }
}

export function deriveTrainerFixtureIdentity(
  runId: string,
  scope: string,
  suffix: 'a' | 'b',
): { slug: string; professionalName: string } {
  const runPart = cleanScopePart(runId, 'run').slice(0, 18).replace(/-+$/, '')
  const scopePart = cleanScopePart(scope, 'scope').slice(0, 16).replace(/-+$/, '')
  const hash = createHash('sha256').update(`${runId}:${scope}:trainer:${suffix}`).digest('hex').slice(0, 8)
  const coach = suffix.toUpperCase()
  return {
    slug: `e2e-${runPart}-${scopePart}-${hash}-coach-${suffix}`,
    professionalName: `E2E Coach ${coach} ${runPart} ${scopePart} ${hash}`,
  }
}

function fixtureClient(config: E2ESeedConfig): SupabaseClient {
  return createClient(config.supabaseUrl, requireTrainerRelationshipsAnonKey(process.env), {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

async function signInFixtureClient(client: SupabaseClient, email: string, password: string): Promise<void> {
  const { error } = await client.auth.signInWithPassword({ email, password })
  assertNoError(error, `Signing in trainer relationships fixture account ${email}`)
}

async function ensureTrainerRelationshipsAccount(
  service: SupabaseClient,
  config: E2ESeedConfig,
  scope: string,
  role: TrainerRelationshipRole,
): Promise<{ id: string; email: string }> {
  const identity = deriveTrainerRelationshipIdentity(config.runId, scope, role)
  const listed = await service.auth.admin.listUsers({ page: 1, perPage: 1000 })
  assertNoError(listed.error, `Listing ${role} trainer relationships fixture`)
  const existing = listed.data.users.find(user => user.email?.toLowerCase() === identity.email)
  if (existing) {
    await cleanupTrainerRelationshipsAccount(service, existing.id)
    const { error } = await service.auth.admin.deleteUser(existing.id)
    assertNoError(error, `Removing stale ${role} trainer relationships fixture`)
  }
  const created = await service.auth.admin.createUser({
    email: identity.email,
    password: config.password,
    email_confirm: true,
    user_metadata: { e2e_run_id: config.runId, trainer_relationship_role: role },
  })
  assertNoError(created.error, `Creating ${role} trainer relationships fixture`)
  if (!created.data.user) throw new Error(`Creating ${role} trainer relationships fixture returned no user`)
  const { error: profileError } = await (service.from('profiles') as any).upsert({
    id: created.data.user.id,
    username: identity.username,
    full_name: `E2E ${role}`,
    onboarding_done: true,
    account_status: 'active',
    is_admin: role === 'admin',
    language: 'es',
    timezone: E2E_TIME_ZONE,
  })
  assertNoError(profileError, `Preparing ${role} trainer relationships profile`)
  return { id: created.data.user.id, email: identity.email }
}

async function createVerifiedTrainerFixture(
  service: SupabaseClient,
  account: { id: string; email: string },
  config: E2ESeedConfig,
  scope: string,
  suffix: 'a' | 'b',
): Promise<{ applicationId: string; profileId: string; serviceId: string; slug: string; professionalName: string }> {
  const applicationId = randomUUID()
  const profileId = randomUUID()
  const serviceId = randomUUID()
  const trainerIdentity = deriveTrainerFixtureIdentity(config.runId, scope, suffix)
  const { slug, professionalName: name } = trainerIdentity
  const { error: applicationError } = await (service.from('trainer_applications') as any).insert({
    id: applicationId,
    user_id: account.id,
    application_kind: 'initial',
    status: 'approved',
    professional_name: name,
    bio: 'Perfil profesional exclusivo para validar relaciones de entrenamiento.',
    specialties: ['fuerza'],
    modalities: ['online'],
    experience_summary: 'Experiencia de prueba controlada para E2E.',
    languages: ['es'],
    contact_email: account.email,
    interview_availability: 'E2E only',
  })
  assertNoError(applicationError, `Creating approved trainer ${suffix} application`)
  const { error: trainerError } = await (service.from('trainer_profiles') as any).insert({
    id: profileId,
    user_id: account.id,
    source_application_id: applicationId,
    slug,
    status: 'active',
    professional_name: name,
    bio: 'Perfil profesional exclusivo para validar relaciones de entrenamiento.',
    specialties: ['fuerza'],
    modalities: ['online'],
    experience_summary: 'Experiencia de prueba controlada para E2E.',
    general_location: 'La Habana',
    languages: ['es'],
  })
  assertNoError(trainerError, `Creating active trainer ${suffix} profile`)
  const { error: serviceError } = await (service.from('trainer_service_offerings') as any).insert({
    id: serviceId,
    trainer_profile_id: profileId,
    name: `E2E Servicio ${suffix.toUpperCase()} ${config.runId}`,
    description: 'Servicio gratuito de prueba para acompañamiento profesional.',
    modality: 'online',
    duration_minutes: 45,
    content: 'Seguimiento de entrenamiento.',
    capacity: 5,
    is_active: true,
    billing_mode: 'free_preview',
    price_minor: null,
    currency: null,
    billing_interval: null,
  })
  assertNoError(serviceError, `Creating non-commercial trainer ${suffix} service`)
  return { applicationId, profileId, serviceId, slug, professionalName: name }
}

/** Performs read-only migration probes before any relationship fixture write. */
export async function assertTrainerRelationshipsE2EReady(): Promise<void> {
  if (!isTrainerRelationshipsE2EEnabled(process.env)) {
    throw new Error('Trainer relationship E2E writes require E2E_TRAINER_RELATIONSHIPS_ENABLED=true')
  }
  const config = requireE2EConfig(process.env)
  const service = adminClient(config)
  const probes = await Promise.all([
    service.from('trainer_service_offerings').select('id, billing_mode, price_minor').limit(1),
    service.from('coaching_relationships').select('id, status, paused_at').limit(1),
    service.from('coaching_consents').select('id, scope, revoked_at').limit(1),
    service.rpc('suspend_account_and_professional', {
      p_user_id: null, p_admin_id: null, p_reason: null, p_until: null,
    }),
  ])
  // The invalid arguments intentionally prove the RPC exists. Missing migration
  // reports a PostgREST function-not-found error instead of a domain error.
  const schemaError = probes.slice(0, 3).find(probe => probe.error)?.error
  const rpcError = probes[3].error
  if (schemaError || !rpcError || /Could not find the function|PGRST202/i.test(rpcError.message ?? '')) {
    throw new Error('Trainer relationship migration 042 must be deployed to the dedicated E2E project')
  }
}

export async function seedTrainerRelationshipsFixture(scope: string): Promise<TrainerRelationshipsFixture> {
  await assertTrainerRelationshipsE2EReady()
  const config = requireE2EConfig(process.env)
  const service = adminClient(config)
  const created = {
    userIds: [] as string[],
    applicationIds: [] as string[],
    profileIds: [] as string[],
    serviceIds: [] as string[],
    requestIds: [] as string[],
    relationshipIds: [] as string[],
    consentIds: [] as string[],
  }
  const clientAccount = await ensureTrainerRelationshipsAccount(service, config, scope, 'client')
  created.userIds.push(clientAccount.id)
  const client = fixtureClient(config)
  await signInFixtureClient(client, clientAccount.email, config.password)
  const { error: clientProfileError } = await (service.from('profiles') as any).update({
    onboarding_done: true, account_status: 'active', is_admin: false, language: 'es', timezone: E2E_TIME_ZONE,
  }).eq('id', clientAccount.id)
  assertNoError(clientProfileError, 'Preparing trainer relationships client profile')
  const trainerAAccount = await ensureTrainerRelationshipsAccount(service, config, scope, 'trainer-a')
  const trainerBAccount = await ensureTrainerRelationshipsAccount(service, config, scope, 'trainer-b')
  const admin = await ensureTrainerRelationshipsAccount(service, config, scope, 'admin')
  created.userIds.push(trainerAAccount.id, trainerBAccount.id, admin.id)
  const trainerAClient = fixtureClient(config)
  const trainerBClient = fixtureClient(config)
  await Promise.all([
    signInFixtureClient(trainerAClient, trainerAAccount.email, config.password),
    signInFixtureClient(trainerBClient, trainerBAccount.email, config.password),
  ])
  const trainerA = await createVerifiedTrainerFixture(service, trainerAAccount, config, scope, 'a')
  const trainerB = await createVerifiedTrainerFixture(service, trainerBAccount, config, scope, 'b')
  created.applicationIds.push(trainerA.applicationId, trainerB.applicationId)
  created.profileIds.push(trainerA.profileId, trainerB.profileId)
  created.serviceIds.push(trainerA.serviceId, trainerB.serviceId)
  return {
    client: { id: clientAccount.id, email: clientAccount.email, client },
    trainerA: { ...trainerAAccount, client: trainerAClient, ...trainerA },
    trainerB: { ...trainerBAccount, client: trainerBClient, ...trainerB },
    admin,
    service,
    runId: config.runId,
    scope,
    created,
  }
}

function rpcRows<T>(data: T[] | null, operation: string): T {
  const row = data?.[0]
  if (!row) throw new Error(`${operation} returned no row`)
  return row
}

export async function exerciseTrainerRelationshipLifecycle(fixture: TrainerRelationshipsFixture): Promise<TrainerRelationshipRows> {
  const createA = await (fixture.client.client.rpc as any)('create_coaching_request', {
    service_id: fixture.trainerA.serviceId, message: 'Solicitud E2E para Coach A.', consent_version: 'training-profile-v1', idempotency_key: randomUUID(),
  })
  assertNoError(createA.error, 'Creating first pending coaching request')
  const createB = await (fixture.client.client.rpc as any)('create_coaching_request', {
    service_id: fixture.trainerB.serviceId, message: 'Solicitud E2E para Coach B.', consent_version: 'training-profile-v1', idempotency_key: randomUUID(),
  })
  assertNoError(createB.error, 'Creating competing pending coaching request')
  const firstRequestId = rpcRows<{ request_id: string }>(createA.data, 'Creating first pending coaching request').request_id
  const competingRequestId = rpcRows<{ request_id: string }>(createB.data, 'Creating competing pending coaching request').request_id
  fixture.created.requestIds.push(firstRequestId, competingRequestId)
  const accepted = await (fixture.trainerA.client.rpc as any)('accept_coaching_request', { request_id: firstRequestId, idempotency_key: randomUUID() })
  assertNoError(accepted.error, 'Accepting first coaching request')
  const acceptedRow = rpcRows<{ relationship_id: string; accepted_request_id: string; cancelled_request_ids: string[] }>(accepted.data, 'Accepting first coaching request')
  expectRelationshipValue(acceptedRow.accepted_request_id, firstRequestId, 'accepted request')
  expectRelationshipValue(acceptedRow.cancelled_request_ids.includes(competingRequestId), true, 'competing request cancellation')
  const { data: requests, error: requestsError } = await (fixture.service.from('coaching_requests') as any)
    .select('id,status').in('id', [firstRequestId, competingRequestId])
  assertNoError(requestsError, 'Reading accepted and cancelled requests')
  expectRelationshipValue(requests.find((request: any) => request.id === firstRequestId)?.status, 'accepted', 'accepted request status')
  expectRelationshipValue(requests.find((request: any) => request.id === competingRequestId)?.status, 'cancelled', 'cancelled competing request status')
  const { data: activeRelationships, error: relationshipError } = await (fixture.service.from('coaching_relationships') as any)
    .select('id,status').eq('client_user_id', fixture.client.id).eq('status', 'active')
  assertNoError(relationshipError, 'Reading active coaching relationship')
  expectRelationshipValue(activeRelationships?.length, 1, 'one active coaching relationship')
  const relationshipId = acceptedRow.relationship_id
  fixture.created.relationshipIds.push(relationshipId)
  const grant = await (fixture.client.client.rpc as any)('grant_body_measurements_consent', { p_relationship_id: relationshipId, p_consent_version: 'body-measurements-v1', p_idempotency_key: randomUUID() })
  assertNoError(grant.error, 'Granting body measurements consent')
  const revoke = await (fixture.client.client.rpc as any)('revoke_body_measurements_consent', { p_relationship_id: relationshipId, p_idempotency_key: randomUUID() })
  assertNoError(revoke.error, 'Revoking body measurements consent')
  const { data: bodyConsent, error: consentError } = await (fixture.service.from('coaching_consents') as any)
    .select('id,scope,revoked_at').eq('relationship_id', relationshipId).eq('scope', 'body_measurements').order('created_at', { ascending: false }).limit(1).maybeSingle()
  assertNoError(consentError, 'Reading body measurements consent')
  if (bodyConsent?.id) fixture.created.consentIds.push(bodyConsent.id)
  expectRelationshipValue(Boolean(bodyConsent?.revoked_at), true, 'revoked body measurements consent')
  return { relationshipId, firstRequestId, competingRequestId }
}

function expectRelationshipValue(actual: unknown, expected: unknown, label: string): void {
  if (actual !== expected) throw new Error(`Expected ${label} to be ${String(expected)}, received ${String(actual)}`)
}

export async function endSuspendReinstateAndResumeTrainerRelationship(
  fixture: TrainerRelationshipsFixture,
  firstRelationshipId: string,
): Promise<string> {
  const ended = await (fixture.client.client.rpc as any)('end_coaching_relationship', {
    p_relationship_id: firstRelationshipId, p_reason: 'Cierre E2E para preparar suspensión.', p_idempotency_key: randomUUID(),
  })
  assertNoError(ended.error, 'Ending first coaching relationship')
  const { data: endedRelationship, error: endedError } = await (fixture.service.from('coaching_relationships') as any)
    .select('status,ended_at').eq('id', firstRelationshipId).maybeSingle()
  assertNoError(endedError, 'Reading ended coaching relationship')
  expectRelationshipValue(endedRelationship?.status, 'ended', 'ended relationship status')
  expectRelationshipValue(Boolean(endedRelationship?.ended_at), true, 'ended relationship timestamp')
  const freshRequest = await (fixture.client.client.rpc as any)('create_coaching_request', {
    service_id: fixture.trainerA.serviceId, message: 'Nueva solicitud E2E para suspensión.', consent_version: 'training-profile-v1', idempotency_key: randomUUID(),
  })
  assertNoError(freshRequest.error, 'Creating request before suspension')
  const freshRequestId = rpcRows<{ request_id: string }>(freshRequest.data, 'Creating request before suspension').request_id
  fixture.created.requestIds.push(freshRequestId)
  const freshAccepted = await (fixture.trainerA.client.rpc as any)('accept_coaching_request', { request_id: freshRequestId, idempotency_key: randomUUID() })
  assertNoError(freshAccepted.error, 'Accepting request before suspension')
  const relationshipId = rpcRows<{ relationship_id: string }>(freshAccepted.data, 'Accepting request before suspension').relationship_id
  fixture.created.relationshipIds.push(relationshipId)
  const suspended = await (fixture.service.rpc as any)('suspend_account_and_professional', {
    p_user_id: fixture.trainerA.id, p_admin_id: fixture.admin.id, p_reason: 'Suspensión administrativa E2E.', p_until: null,
  })
  assertNoError(suspended.error, 'Suspending trainer account and profile')
  const { data: suspendedState, error: suspendedError } = await (fixture.service.from('coaching_relationships') as any)
    .select('status,paused_at').eq('id', relationshipId).maybeSingle()
  assertNoError(suspendedError, 'Reading paused relationship')
  expectRelationshipValue(suspendedState?.status, 'paused_by_platform', 'paused relationship status')
  expectRelationshipValue(Boolean(suspendedState?.paused_at), true, 'paused relationship timestamp')
  const { data: activeConsent, error: activeConsentError } = await (fixture.service.from('coaching_consents') as any)
    .select('id').eq('relationship_id', relationshipId).is('revoked_at', null)
  assertNoError(activeConsentError, 'Reading suspended relationship grants')
  expectRelationshipValue(activeConsent?.length, 0, 'active grants after suspension')
  const { data: directory, error: directoryError } = await (fixture.service.from('active_trainer_directory') as any)
    .select('slug').eq('user_id', fixture.trainerA.id)
  assertNoError(directoryError, 'Reading suspended trainer directory projection')
  expectRelationshipValue(directory?.length, 0, 'suspended trainer directory rows')
  const { error: accountError } = await (fixture.service.from('profiles') as any).update({
    account_status: 'active', suspension_reason: null, suspended_at: null, suspended_until: null, suspended_by: null,
  }).eq('id', fixture.trainerA.id)
  assertNoError(accountError, 'Reactivating trainer account only')
  const { data: stillSuspended, error: profileError } = await (fixture.service.from('trainer_profiles') as any)
    .select('status').eq('id', fixture.trainerA.profileId).maybeSingle()
  assertNoError(profileError, 'Reading trainer profile after account reactivation')
  expectRelationshipValue(stillSuspended?.status, 'suspended', 'trainer profile after account-only reactivation')
  const reinstated = await (fixture.service.rpc as any)('reinstate_trainer_profile', { p_user_id: fixture.trainerA.id, p_admin_id: fixture.admin.id })
  assertNoError(reinstated.error, 'Explicitly reinstating trainer profile')
  const { data: pausedAfterReinstate, error: pausedAfterError } = await (fixture.service.from('coaching_relationships') as any)
    .select('status').eq('id', relationshipId).maybeSingle()
  assertNoError(pausedAfterError, 'Reading relationship after trainer profile reinstatement')
  expectRelationshipValue(pausedAfterReinstate?.status, 'paused_by_platform', 'relationship after profile reinstatement')
  const resumed = await (fixture.client.client.rpc as any)('resume_paused_coaching_relationship', { p_relationship_id: relationshipId, p_idempotency_key: randomUUID() })
  assertNoError(resumed.error, 'Client-confirmed relationship resume')
  const { data: resumedState, error: resumedError } = await (fixture.service.from('coaching_relationships') as any)
    .select('status').eq('id', relationshipId).maybeSingle()
  assertNoError(resumedError, 'Reading resumed relationship')
  expectRelationshipValue(resumedState?.status, 'active', 'resumed relationship status')
  const { data: renewedTrainingConsent, error: renewedConsentError } = await (fixture.service.from('coaching_consents') as any)
    .select('id').eq('relationship_id', relationshipId).eq('scope', 'training_profile').is('revoked_at', null)
  assertNoError(renewedConsentError, 'Reading renewed training consent')
  expectRelationshipValue(renewedTrainingConsent?.length, 1, 'renewed training consent')
  if (renewedTrainingConsent?.[0]?.id) fixture.created.consentIds.push(renewedTrainingConsent[0].id)
  return relationshipId
}

/** Probes 043 before fixture writes so a partially deployed database never
 * receives an unrecoverable professional materialization from E2E. */
export async function assertTrainerProgrammingE2EReady(): Promise<void> {
  if (!isTrainerProgrammingE2EEnabled(process.env)) {
    throw new Error('Trainer programming E2E writes require dedicated-project reset acknowledgement')
  }
  await assertTrainerRelationshipsE2EReady()
  const config = requireE2EConfig(process.env)
  const service = adminClient(config)
  const [tables, propose, save] = await Promise.all([
    Promise.all([
      service.from('trainer_program_templates').select('id').limit(1),
      service.from('trainer_plan_assignments').select('id').limit(1),
      service.from('trainer_assignment_versions').select('id, materialized_plan_id').limit(1),
      service.from('workout_plans').select('id, prescription_locked').limit(1),
    ]),
    (service.rpc as any)('propose_trainer_assignment', {
      p_relationship_id: null, p_template_id: null, p_change_summary: null, p_idempotency_key: null,
    }),
    (service.rpc as any)('save_session_log_atomic_v3', {
      p_client_session_id: null, p_workout_id: null, p_completed_at: null,
      p_duration_minutes: null, p_mood_rating: null, p_exercise_logs: [], p_result_snapshot: {},
    }),
  ])
  const tableError = tables.find(result => result.error)?.error
  const missingRpc = [propose.error, save.error].some(error =>
    /Could not find the function|PGRST202/i.test(error?.message ?? ''))
  if (tableError || missingRpc) {
    throw new Error('Trainer programming migration 043 must be deployed to the dedicated E2E project')
  }
}

function requireRpcRow<T>(data: T[] | null, operation: string): T {
  const row = data?.[0]
  if (!row) throw new Error(`${operation} returned no row`)
  return row
}

async function createTrainerProgrammingPersonalPlan(
  service: SupabaseClient,
  userId: string,
  scope: string,
): Promise<string> {
  const planId = randomUUID()
  const { error } = await (service.from('workout_plans') as any).insert({
    id: planId,
    user_id: userId,
    name: `E2E personal ${scope}`.slice(0, 120),
    goal: 'Plan personal que debe preservarse.',
    duration_weeks: 1,
    days_per_week: 1,
    difficulty: 'beginner',
    is_active: true,
    generated_by_ai: false,
    plan_context: 'first_plan',
    source_type: 'engine',
    library_slot: 'personal',
    prescription_locked: false,
  })
  assertNoError(error, 'Creating customer personal plan before professional acceptance')
  return planId
}

async function currentProfessionalWorkout(service: SupabaseClient, userId: string): Promise<{ planId: string; workoutId: string }> {
  const { data: plan, error: planError } = await (service.from('workout_plans') as any)
    .select('id').eq('user_id', userId).eq('is_active', true).eq('library_slot', 'professional').eq('prescription_locked', true).maybeSingle()
  assertNoError(planError, 'Reading active professional plan')
  if (!plan?.id) throw new Error('Expected one active professional plan')
  const { data: workout, error: workoutError } = await (service.from('workouts') as any)
    .select('id').eq('user_id', userId).eq('plan_id', plan.id).order('order_in_plan').limit(1).maybeSingle()
  assertNoError(workoutError, 'Reading active professional workout')
  if (!workout?.id) throw new Error('Expected a materialized professional workout')
  return { planId: plan.id, workoutId: workout.id }
}

function policyDate(timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' })
    .format(new Date())
}

function differentPolicyTimeZone(currentTimeZone: string): string {
  const currentDate = policyDate(currentTimeZone)
  const alternative = ['Pacific/Kiritimati', 'Etc/GMT+12'].find(zone => policyDate(zone) !== currentDate)
  if (!alternative) throw new Error('Could not select a separate E2E policy date')
  return alternative
}

/** Builds the relationship, personal library baseline, template and RPC
 * boundaries used by the professional programming browser journey. */
export async function seedTrainerProgrammingFixture(scope: string): Promise<TrainerProgrammingFixture> {
  await assertTrainerProgrammingE2EReady()
  const config = requireE2EConfig(process.env)
  const fixture = await seedTrainerRelationshipsFixture(scope)
  let programmingPublished = false
  try {
    const relationship = await exerciseTrainerRelationshipLifecycle(fixture)
    const personalPlanId = await createTrainerProgrammingPersonalPlan(fixture.service, fixture.client.id, scope)
    const catalog = await publicStrengthExercises(fixture.service, 3)
    const revisionTimeZone = differentPolicyTimeZone(E2E_TIME_ZONE)
    let latestProposal: TrainerProgrammingProposal | null = null
    let latestTemplateWorkoutId: string | null = null

    return {
      ...fixture,
      password: config.password,
      relationshipId: relationship.relationshipId,
      personalPlanId,
      async createTemplateAndPropose(name) {
        const templateId = randomUUID()
        const templateWorkoutId = randomUUID()
        const templateExercises = [randomUUID(), randomUUID()]
        const day = templateDayForMaterializedWeekday(isoTodayForE2ETimeZone())
        const templates = fixture.trainerA.client.from('trainer_program_templates') as any
        const createdTemplate = await templates.insert({
          id: templateId, trainer_user_id: fixture.trainerA.id, name,
          goal: 'Progresar fuerza con control.', description: 'Plantilla E2E inmutable al publicarse.',
          days_per_week: 1, status: 'active',
        })
        assertNoError(createdTemplate.error, 'Creating trainer program template')
        const createdWorkout = await (fixture.trainerA.client.from('trainer_template_workouts') as any).insert({
          id: templateWorkoutId, template_id: templateId, name: 'E2E Día profesional', day_of_week: day, order_in_plan: 1,
        })
        assertNoError(createdWorkout.error, 'Creating trainer template workout')
        latestTemplateWorkoutId = templateWorkoutId
        const createdExercises = await (fixture.trainerA.client.from('trainer_template_exercises') as any).insert([
          { id: templateExercises[0], template_workout_id: templateWorkoutId, exercise_id: catalog[0].id, order_index: 1, sets: 2, reps: 8, weight_kg: 40, target_rpe: 7, rest_seconds: 60, notes: 'Resultado real permitido.' },
          { id: templateExercises[1], template_workout_id: templateWorkoutId, exercise_id: catalog[1].id, order_index: 2, sets: 2, reps: 10, weight_kg: 20, target_rpe: 6, rest_seconds: 45, notes: 'Puede omitirse con motivo.' },
        ])
        assertNoError(createdExercises.error, 'Creating trainer template exercises')
        const proposed = await (fixture.trainerA.client.rpc as any)('propose_trainer_assignment', {
          p_relationship_id: relationship.relationshipId,
          p_template_id: templateId,
          p_change_summary: 'Primera prescripción profesional.',
          p_idempotency_key: randomUUID(),
        })
        assertNoError(proposed.error, 'Proposing trainer assignment')
        const row = requireRpcRow<{ assignment_id: string; assignment_version_id: string; workout_plan_id: string }>(proposed.data, 'Proposing trainer assignment')
        latestProposal = { templateId, assignmentId: row.assignment_id, assignmentVersionId: row.assignment_version_id, planId: row.workout_plan_id }
        programmingPublished = true
        return latestProposal
      },
      async readAcceptedAssignment(assignmentId) {
        const { data: assignment, error: assignmentError } = await (fixture.service.from('trainer_plan_assignments') as any)
          .select('status, active_version_id').eq('id', assignmentId).maybeSingle()
        assertNoError(assignmentError, 'Reading accepted trainer assignment')
        if (assignment?.status !== 'active' || !assignment.active_version_id) throw new Error('Assignment was not atomically accepted')
        const { data: version, error: versionError } = await (fixture.service.from('trainer_assignment_versions') as any)
          .select('materialized_plan_id, snapshot').eq('id', assignment.active_version_id).maybeSingle()
        assertNoError(versionError, 'Reading accepted assignment version')
        if (!version?.materialized_plan_id || !version.snapshot || typeof version.snapshot.name !== 'string') throw new Error('Accepted assignment version is incomplete')
        const { data: personal, error: personalError } = await (fixture.service.from('workout_plans') as any)
          .select('id, is_active').eq('id', personalPlanId).maybeSingle()
        assertNoError(personalError, 'Reading preserved personal plan')
        return {
          planId: version.materialized_plan_id,
          personalPlanIsActive: personal?.is_active === true,
          personalPlanStillExists: Boolean(personal?.id),
          snapshot: { name: version.snapshot.name },
        }
      },
      async authorizeCurrentProfessionalSession() {
        const current = await currentProfessionalWorkout(fixture.service, fixture.client.id)
        const clientSessionId = randomUUID()
        const authorized = await (fixture.client.client.rpc as any)('authorize_session_start', {
          p_client_session_id: clientSessionId, p_workout_id: current.workoutId,
        })
        assertNoError(authorized.error, 'Authorizing professional session')
        const plan = authorized.data?.plan
        if (!plan || plan.id !== current.planId || typeof plan.trainerAssignmentVersionId !== 'string') {
          throw new Error('Professional authorization did not preserve assignment identity')
        }
        return { clientSessionId, workoutId: current.workoutId, planId: current.planId, assignmentVersionId: plan.trainerAssignmentVersionId }
      },
      async saveUnauthorizedProfessionalExercise(authorization, exerciseId) {
        const saved = await (fixture.client.client.rpc as any)('save_session_log_atomic_v3', {
          p_client_session_id: authorization.clientSessionId,
          p_workout_id: authorization.workoutId,
          p_completed_at: new Date().toISOString(), p_duration_minutes: 25, p_mood_rating: 4,
          p_exercise_logs: [{ exercise_id: exerciseId, sets_completed: 1, reps_completed: [1], weights_kg: [1], rpe_values: [1], duration_seconds: null, notes: 'Manipulación directa', skip_reason: null }],
          p_result_snapshot: { version: 1, prs: [], progressions: [] },
        })
        if (!saved.error) throw new Error('Direct professional exercise manipulation unexpectedly persisted')
        throw new Error(saved.error.message)
      },
      async publishRevision(name, changeSummary) {
        if (!latestProposal) throw new Error('A proposal must be accepted before publishing a revision')
        if (!latestTemplateWorkoutId) throw new Error('Revision template workout is missing')
        const changedTemplate = await (fixture.trainerA.client.from('trainer_program_templates') as any)
          .update({ name }).eq('id', latestProposal.templateId).eq('trainer_user_id', fixture.trainerA.id)
        assertNoError(changedTemplate.error, 'Updating trainer template for revision')
        const revisedDay = await (fixture.trainerA.client.from('trainer_template_workouts') as any)
          .update({ day_of_week: templateDayForMaterializedWeekday(isoTodayForTimeZone(revisionTimeZone)) })
          .eq('id', latestTemplateWorkoutId).eq('template_id', latestProposal.templateId)
        assertNoError(revisedDay.error, 'Updating trainer template day for revision B')
        const published = await (fixture.trainerA.client.rpc as any)('publish_trainer_assignment_revision', {
          p_assignment_id: latestProposal.assignmentId, p_template_id: latestProposal.templateId,
          p_change_summary: changeSummary, p_idempotency_key: randomUUID(),
        })
        assertNoError(published.error, 'Publishing trainer assignment revision')
        const row = requireRpcRow<{ assignment_version_id: string; workout_plan_id: string }>(published.data, 'Publishing trainer assignment revision')
        const { data: versions, error } = await (fixture.service.from('trainer_assignment_versions') as any)
          .select('id, version_number, effective_to').eq('assignment_id', latestProposal.assignmentId).order('version_number')
        assertNoError(error, 'Reading professional assignment versions')
        const previous = (versions ?? []).find((version: any) => version.id === latestProposal?.assignmentVersionId)
        const current = (versions ?? []).find((version: any) => version.id === row.assignment_version_id)
        if (!current?.version_number) throw new Error('Revision did not materialize its version')
        return { assignmentVersionId: row.assignment_version_id, planId: row.workout_plan_id, versionNumber: current.version_number, previousVersionEffectiveTo: previous?.effective_to ?? null }
      },
      async readAuthorizedSession(clientSessionId) {
        const { data, error } = await (fixture.service.from('session_authorizations') as any)
          .select('plan_id, session_context_snapshot').eq('client_session_id', clientSessionId).eq('user_id', fixture.client.id).maybeSingle()
        assertNoError(error, 'Reading authorized professional session')
        if (!data?.plan_id) throw new Error('Professional authorization was not recorded')
        return { planId: data.plan_id, assignmentVersionId: data.session_context_snapshot?.plan?.trainerAssignmentVersionId ?? null }
      },
      async saveAuthorizedSessionWithActualResults(authorization) {
        const { data: rows, error: rowsError } = await (fixture.service.from('workout_exercises') as any)
          .select('exercise_id').eq('workout_id', authorization.workoutId).order('order_index')
        assertNoError(rowsError, 'Reading professional prescription exercises')
        if (!rows || rows.length < 2) throw new Error('Professional execution fixture requires two prescribed exercises')
        const payload = {
          p_client_session_id: authorization.clientSessionId,
          p_workout_id: authorization.workoutId,
          p_completed_at: new Date().toISOString(), p_duration_minutes: 32, p_mood_rating: 4,
          p_exercise_logs: [
            { exercise_id: rows[0].exercise_id, sets_completed: 2, reps_completed: [8, 9], weights_kg: [42.5, 45], rpe_values: [7, 8], duration_seconds: null, notes: 'Resultado real', skip_reason: null },
            { exercise_id: rows[1].exercise_id, sets_completed: 0, reps_completed: [], weights_kg: [], rpe_values: [], duration_seconds: null, notes: null, skip_reason: 'dolor localizado' },
          ],
          p_result_snapshot: { version: 1, prs: [], progressions: [] },
        }
        const saved = await (fixture.client.client.rpc as any)('save_session_log_atomic_v3', payload)
        assertNoError(saved.error, 'Saving professional session with actual results')
        const row = requireRpcRow<{ progress_log_id: string; inserted: boolean }>(saved.data, 'Saving professional session')
        const { data: authorizationBeforeRetry, error: authorizationBeforeRetryError } = await (fixture.service.from('session_authorizations') as any)
          .select('consumed_at').eq('client_session_id', authorization.clientSessionId).eq('user_id', fixture.client.id).maybeSingle()
        assertNoError(authorizationBeforeRetryError, 'Reading consumed professional authorization before retry')
        if (!authorizationBeforeRetry?.consumed_at) throw new Error('Professional session save did not consume its authorization')

        const retry = await (fixture.client.client.rpc as any)('save_session_log_atomic_v3', payload)
        assertNoError(retry.error, 'Retrying professional session with the same client session id')
        const retryRow = requireRpcRow<{ progress_log_id: string; inserted: boolean }>(retry.data, 'Retrying professional session')

        const [{ data: authorizationAfterRetry, error: authorizationAfterRetryError }, { count: progressLogCount, error: progressCountError }, { data: exerciseLogs, error: exerciseLogsError }] = await Promise.all([
          (fixture.service.from('session_authorizations') as any)
            .select('consumed_at').eq('client_session_id', authorization.clientSessionId).eq('user_id', fixture.client.id).maybeSingle(),
          (fixture.service.from('progress_logs') as any)
            .select('id', { count: 'exact', head: true }).eq('user_id', fixture.client.id).eq('client_session_id', authorization.clientSessionId),
          (fixture.service.from('exercise_logs') as any)
            .select('exercise_id, sets_completed, reps_completed, weights_kg, rpe_values, notes').eq('progress_log_id', row.progress_log_id),
        ])
        assertNoError(authorizationAfterRetryError, 'Reading consumed professional authorization after retry')
        assertNoError(progressCountError, 'Counting idempotent professional progress logs')
        assertNoError(exerciseLogsError, 'Reading persisted professional exercise evidence')
        const actual = (exerciseLogs ?? []).find((entry: any) => entry.exercise_id === rows[0].exercise_id)
        const skipped = (exerciseLogs ?? []).find((entry: any) => entry.exercise_id === rows[1].exercise_id)
        if (!actual || !skipped) throw new Error('Professional session evidence rows were not persisted exactly once')
        const numeric = (value: unknown): number[] => Array.isArray(value) ? value.map(Number) : []
        return {
          inserted: row.inserted === true,
          progressLogId: row.progress_log_id,
          retryProgressLogId: retryRow.progress_log_id,
          retryInserted: retryRow.inserted === true,
          progressLogCount: progressLogCount ?? 0,
          exerciseLogCount: exerciseLogs?.length ?? 0,
          consumedAtBeforeRetry: authorizationBeforeRetry.consumed_at,
          consumedAtAfterRetry: authorizationAfterRetry?.consumed_at ?? null,
          actualResult: {
            setsCompleted: Number(actual.sets_completed),
            repsCompleted: numeric(actual.reps_completed),
            weightsKg: numeric(actual.weights_kg),
            rpeValues: numeric(actual.rpe_values),
            notes: actual.notes ?? null,
          },
          skipNote: skipped.notes ?? null,
        }
      },
      async moveToDifferentPolicyDate() {
        const { error } = await (fixture.service.from('profiles') as any).update({ timezone: revisionTimeZone }).eq('id', fixture.client.id)
        assertNoError(error, 'Moving fixture to a separate policy date for revision B')
      },
    }
  } catch (error) {
    // Before the first immutable publication the ordinary relationship cleanup
    // remains safe. Afterwards the explicit external-reset acknowledgement is
    // the teardown policy, so do not mask the useful seed failure with a
    // forbidden REST deletion attempt.
    if (!programmingPublished) await cleanupTrainerRelationshipsFixture(fixture)
    throw error
  }
}

async function deleteExactRows(service: SupabaseClient, table: string, column: string, ids: string[], operation: string): Promise<void> {
  if (!ids.length) return
  const { error } = await (service.from(table) as any).delete().in(column, Array.from(new Set(ids)))
  assertNoError(error, operation)
}

/** Removes only rows tied to one dedicated fixture account before recreating it. */
async function cleanupTrainerRelationshipsAccount(service: SupabaseClient, userId: string): Promise<void> {
  const { data: profiles, error: profilesError } = await (service.from('trainer_profiles') as any)
    .select('id').eq('user_id', userId)
  assertNoError(profilesError, 'Reading stale trainer relationship profiles')
  const profileIds = (profiles ?? []).map((profile: { id: string }) => profile.id)
  const { data: relationships, error: relationshipsError } = await (service.from('coaching_relationships') as any)
    .select('id').or(`client_user_id.eq.${userId},trainer_user_id.eq.${userId}`)
  assertNoError(relationshipsError, 'Reading stale trainer relationship rows')
  const relationshipIds = (relationships ?? []).map((relationship: { id: string }) => relationship.id)

  await deleteExactRows(service, 'coaching_consents', 'relationship_id', relationshipIds, 'Removing stale trainer relationship consents')
  await deleteExactRows(service, 'coaching_relationships', 'id', relationshipIds, 'Removing stale trainer relationships')
  const { error: requestError } = await (service.from('coaching_requests') as any)
    .delete().or(`client_user_id.eq.${userId},trainer_user_id.eq.${userId}`)
  assertNoError(requestError, 'Removing stale trainer relationship requests')
  await deleteExactRows(service, 'trainer_service_offerings', 'trainer_profile_id', profileIds, 'Removing stale trainer relationship services')
  await deleteExactRows(service, 'trainer_profiles', 'id', profileIds, 'Removing stale trainer relationship profiles')
  const { error: applicationsError } = await (service.from('trainer_applications') as any).delete().eq('user_id', userId)
  assertNoError(applicationsError, 'Removing stale trainer relationship applications')
  for (const [table, column] of [
    ['product_notifications', 'user_id'],
    ['professional_audit_logs', 'actor_user_id'],
    ['professional_audit_logs', 'subject_user_id'],
    ['admin_audit_logs', 'admin_user_id'],
    ['admin_audit_logs', 'target_user_id'],
  ] as const) {
    const { error } = await (service.from(table) as any).delete().eq(column, userId)
    assertNoError(error, `Removing stale ${table}`)
  }
}

export async function cleanupTrainerRelationshipsFixture(fixture: TrainerRelationshipsFixture): Promise<void> {
  const relationshipIds = Array.from(new Set(fixture.created.relationshipIds))
  const { data: consents, error: consentsError } = relationshipIds.length
    ? await (fixture.service.from('coaching_consents') as any).select('id').in('relationship_id', relationshipIds)
    : { data: [], error: null }
  assertNoError(consentsError, 'Reading exact trainer relationship consents for cleanup')
  fixture.created.consentIds.push(...(consents ?? []).map((consent: { id: string }) => consent.id))
  await deleteExactRows(fixture.service, 'coaching_consents', 'id', fixture.created.consentIds, 'Cleaning exact trainer relationship consents')
  await deleteExactRows(fixture.service, 'coaching_relationships', 'id', relationshipIds, 'Cleaning exact trainer relationships')
  await deleteExactRows(fixture.service, 'coaching_requests', 'id', fixture.created.requestIds, 'Cleaning exact trainer relationship requests')
  await deleteExactRows(fixture.service, 'trainer_service_offerings', 'id', fixture.created.serviceIds, 'Cleaning exact trainer relationship services')
  await deleteExactRows(fixture.service, 'trainer_profiles', 'id', fixture.created.profileIds, 'Cleaning exact trainer relationship profiles')
  await deleteExactRows(fixture.service, 'trainer_applications', 'id', fixture.created.applicationIds, 'Cleaning exact trainer relationship applications')
  for (const userId of fixture.created.userIds) {
    await cleanupTrainerRelationshipsAccount(fixture.service, userId)
    const { error } = await fixture.service.auth.admin.deleteUser(userId)
    assertNoError(error, 'Deleting exact dedicated trainer relationship auth user')
  }
}

function assertNoError(error: QueryError, operation: string): void {
  if (error) throw new Error(`${operation} failed: ${error.message ?? 'unknown error'}`)
}

const TRANSIENT_RETRY_ATTEMPTS = 3
const E2E_TIME_ZONE = 'America/Havana'
const ISO_WEEKDAY_BY_SHORT_NAME: Record<string, number> = {
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
  Sun: 7,
}

function transientDelay(attempt: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, attempt * 500))
}

function isTransientSupabaseError(error: unknown): boolean {
  const cause = error instanceof Error && 'cause' in error
    ? (error as Error & { cause?: unknown }).cause
    : null
  const message = [
    error instanceof Error ? error.message : String(error),
    cause instanceof Error ? cause.message : '',
    typeof cause === 'object' && cause && 'code' in cause
      ? String((cause as { code?: unknown }).code)
      : '',
  ].join(' ')

  return /fetch failed|connect timeout|und_err_connect_timeout|econnreset|etimedout|network/i.test(message)
}

async function retryTransientSupabase<T>(operation: string, action: () => Promise<T>): Promise<T> {
  let lastError: unknown

  for (let attempt = 1; attempt <= TRANSIENT_RETRY_ATTEMPTS; attempt += 1) {
    try {
      return await action()
    } catch (error) {
      lastError = error
      if (!isTransientSupabaseError(error) || attempt === TRANSIENT_RETRY_ATTEMPTS) throw error
      await transientDelay(attempt)
    }
  }

  throw lastError ?? new Error(`${operation} failed`)
}

function isoTodayForE2ETimeZone(now = new Date()): number {
  return isoTodayForTimeZone(E2E_TIME_ZONE, now)
}

function isoTodayForTimeZone(timeZone: string, now = new Date()): number {
  const weekday = new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'short',
  }).format(now)

  const isoWeekday = ISO_WEEKDAY_BY_SHORT_NAME[weekday]
  if (!isoWeekday) {
    throw new Error(`Unable to resolve E2E ISO weekday for ${weekday}`)
  }
  return isoWeekday
}

function templateDayForMaterializedWeekday(weekday: number): number {
  return weekday === 7 ? 1 : weekday + 1
}

function adminClient(config: E2ESeedConfig): SupabaseClient {
  return createClient(config.supabaseUrl, config.serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

async function firstPublicStrengthExercise(supabase: SupabaseClient): Promise<{
  id: string
  name: string
  name_es: string | null
  muscle_groups: string[] | null
  muscle_groups_es: string[] | null
  is_compound: boolean | null
}> {
  const data = await retryTransientSupabase('Loading a public E2E exercise', async () => {
    const { data, error } = await supabase
      .from('exercises')
      .select('id, name, name_es, muscle_groups, muscle_groups_es, is_compound')
      .eq('is_public', true)
      .eq('exercise_type', 'strength')
      .order('name')
      .limit(1)
      .maybeSingle()

    assertNoError(error, 'Loading a public E2E exercise')
    return data
  })
  if (!data) {
    throw new Error('E2E core fixture requires at least one public strength exercise seeded')
  }
  return data as {
    id: string
    name: string
    name_es: string | null
    muscle_groups: string[] | null
    muscle_groups_es: string[] | null
    is_compound: boolean | null
  }
}

async function publicStrengthExercises(
  supabase: SupabaseClient,
  count: number,
): Promise<Array<{ id: string }>> {
  const { data, error } = await supabase
    .from('exercises')
    .select('id')
    .eq('is_public', true)
    .eq('exercise_type', 'strength')
    .order('name')
    .limit(count)
  assertNoError(error, 'Loading public E2E strength exercises')
  if (!data || data.length < count) {
    throw new Error(`Trainer programming E2E requires ${count} public strength exercises seeded`)
  }
  return data as Array<{ id: string }>
}

async function clearProgressLogs(supabase: SupabaseClient, userId: string): Promise<void> {
  await retryTransientSupabase('Clearing E2E progress logs', async () => {
    const { error } = await supabase.from('progress_logs').delete().eq('user_id', userId)
    assertNoError(error, 'Clearing E2E progress logs')
  })
}

async function updateCoreProfile(
  supabase: SupabaseClient,
  userId: string,
  runId: string,
  language: CoreLanguage,
): Promise<void> {
  const username = `e2e_${runId.replace(/[^a-z0-9]+/g, '_').slice(0, 42)}`
  await retryTransientSupabase('Updating E2E core profile', async () => {
    const { error } = await supabase
      .from('profiles')
      .update({
        username,
        full_name: 'Vekira Demo',
        height_cm: 175,
        weight_kg: 70,
        date_of_birth: '1996-01-01',
        gender: 'other',
        fitness_level: 'beginner',
        primary_goal: 'stay_active',
        onboarding_done: true,
        days_per_week: 3,
        session_duration_minutes: 30,
        gym_type: 'home_no_equipment',
        available_equipment: [],
        preferred_workout_days: [isoTodayForE2ETimeZone()],
        cardio_preferences: ['walking'],
        activity_level: 'regularly_active',
        readiness_status: 'cleared',
        readiness_answers: {},
        movement_limitations: [],
        readiness_version: 'e2e-core-product-v1',
        readiness_completed_at: new Date().toISOString(),
        last_check_in_at: new Date().toISOString(),
        language,
        timezone: E2E_TIME_ZONE,
        subscription_tier: 'free',
      })
      .eq('id', userId)

    assertNoError(error, 'Updating E2E core profile')
  })
}

export async function seedCoreProductFixture(language: CoreLanguage = 'es'): Promise<CoreProductFixture> {
  const config = requireE2EConfig(process.env)
  const userId = await seedE2EAccount(config)
  const supabase = adminClient(config)
  await clearProgressLogs(supabase, userId)
  await updateCoreProfile(supabase, userId, config.runId, language)

  const exercise = await firstPublicStrengthExercise(supabase)
  const today = isoTodayForE2ETimeZone()
  const planId = randomUUID()
  const workoutId = randomUUID()

  await retryTransientSupabase('Creating E2E active plan', async () => {
    const { error } = await supabase.from('workout_plans').insert({
    id: planId,
    user_id: userId,
    name: 'E2E Evidence Week',
    description: 'Stable core-product acceptance plan.',
    goal: 'Stay active',
    duration_weeks: 1,
    days_per_week: 3,
    difficulty: 'beginner',
    is_active: true,
    generated_by_ai: false,
    ai_notes: 'Plan estable para validar el flujo principal.',
    week_number: 1,
    plan_context: 'first_plan',
    source_type: 'engine',
    generation_metadata: { source: 'core-product-e2e' },
    })
    assertNoError(error, 'Creating E2E active plan')
  })

  await retryTransientSupabase('Creating E2E workout', async () => {
    const { error } = await supabase.from('workouts').insert({
    id: workoutId,
    plan_id: planId,
    user_id: userId,
    name: 'E2E Full Body',
    focus: 'Piernas · Core',
    day_of_week: today,
    order_in_plan: 1,
    estimated_duration_minutes: 30,
    notes: 'Stable workout for browser acceptance.',
    })
    assertNoError(error, 'Creating E2E workout')
  })

  await retryTransientSupabase('Creating E2E workout exercise', async () => {
    const { error } = await supabase.from('workout_exercises').insert({
    id: randomUUID(),
    workout_id: workoutId,
    exercise_id: exercise.id,
    order_index: 1,
    sets: 2,
    reps: 10,
    duration_seconds: null,
    rest_seconds: 45,
    weight_kg: 40,
    notes: 'Registra una técnica controlada.',
    target_rpe: 7,
    weight_suggestion_basis: 'estimated_from_profile',
    })
    assertNoError(error, 'Creating E2E workout exercise')
  })

  return { userId, planId, workoutId, exerciseId: exercise.id }
}

async function createProgressLogFixture(
  supabase: SupabaseClient,
  fixture: CoreProductFixture,
  progressLogId: string,
  completedAt: string,
): Promise<void> {
  await retryTransientSupabase('Creating E2E progress log', async () => {
    const { error } = await supabase.from('progress_logs').insert({
      id: progressLogId,
      user_id: fixture.userId,
      workout_id: fixture.workoutId,
      completed_at: completedAt,
      duration_minutes: 28,
      mood_rating: 4,
    })
    assertNoError(error, 'Creating E2E progress log')
  })
}

async function createExerciseLogFixture(
  supabase: SupabaseClient,
  fixture: CoreProductFixture,
  progressLogId: string,
): Promise<void> {
  await retryTransientSupabase('Creating E2E exercise log', async () => {
    const { error } = await supabase.from('exercise_logs').insert({
      id: randomUUID(),
      progress_log_id: progressLogId,
      exercise_id: fixture.exerciseId,
      sets_completed: 2,
      reps_completed: [10, 9],
      weights_kg: [35, 35],
      rpe_values: [7, 8],
    })
    assertNoError(error, 'Creating E2E exercise log')
  })
}

export async function seedCoreProgressHistory(
  fixture: CoreProductFixture,
): Promise<{ progressLogId: string }> {
  const config = requireE2EConfig(process.env)
  const supabase = adminClient(config)
  const progressLogId = randomUUID()
  const completedAt = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()

  await createProgressLogFixture(supabase, fixture, progressLogId, completedAt)
  await createExerciseLogFixture(supabase, fixture, progressLogId)

  return { progressLogId }
}

/** An explicit opt-in prevents service-role fixture writes against an unknown target. */
export function isHistoryContinuityE2EEnabled(env: NodeJS.ProcessEnv): boolean {
  return env.E2E_HISTORY_CONTINUITY_ENABLED === 'true'
}

/** Only migration 039 creates this data-free deployment sentinel. */
export function isHistoryContinuitySchemaVersion(value: unknown): value is 39 {
  return value === 39
}

/**
 * Proves the dedicated E2E project has every continuity migration before the
 * fixture performs any write. All probes are SELECTs and expose no row data.
 */
export async function assertHistoryContinuityE2EReady(): Promise<void> {
  const config = requireE2EConfig(process.env)
  if (!isHistoryContinuityE2EEnabled(process.env)) {
    throw new Error('History continuity E2E writes require E2E_HISTORY_CONTINUITY_ENABLED=true')
  }

  const supabase = adminClient(config)
  const probes = await Promise.all([
    supabase.from('progress_logs').select('id, session_context_snapshot').limit(1),
    supabase.from('workout_plans').select('id, family_id, retired_at, superseded_at').limit(1),
    supabase.from('session_authorizations').select('client_session_id').limit(1),
    supabase.rpc('get_plan_history_continuity_schema_version'),
  ])
  const schemaVersion = probes[3].data
  if (probes.some(result => result.error) || !isHistoryContinuitySchemaVersion(schemaVersion)) {
    throw new Error('Continuity migrations 036, 037, 038, and 039 are required for this E2E fixture')
  }
}

async function createHistoryContinuityPlan(
  supabase: SupabaseClient,
  input: { id: string; userId: string; familyId: string; name: string; active: boolean; weekNumber: number },
): Promise<void> {
  await retryTransientSupabase(`Creating ${input.name}`, async () => {
    const { error } = await supabase.from('workout_plans').insert({
      id: input.id,
      user_id: input.userId,
      family_id: input.familyId,
      name: input.name,
      description: 'Dedicated E2E continuity fixture.',
      goal: 'Stay active',
      duration_weeks: 1,
      days_per_week: 1,
      difficulty: 'beginner',
      is_active: input.active,
      generated_by_ai: false,
      ai_notes: 'E2E only.',
      week_number: input.weekNumber,
      plan_context: 'weekly_regeneration',
      source_type: 'engine',
      generation_metadata: { source: 'history-continuity-e2e' },
    })
    assertNoError(error, `Creating ${input.name}`)
  })
}

async function createHistoryContinuityWorkout(
  supabase: SupabaseClient,
  input: { id: string; userId: string; planId: string; name: string; dayOfWeek: number },
): Promise<void> {
  await retryTransientSupabase(`Creating ${input.name}`, async () => {
    const { error } = await supabase.from('workouts').insert({
      id: input.id,
      user_id: input.userId,
      plan_id: input.planId,
      name: input.name,
      focus: 'Piernas',
      day_of_week: input.dayOfWeek,
      order_in_plan: 1,
      estimated_duration_minutes: 30,
      notes: 'Dedicated E2E continuity workout.',
    })
    assertNoError(error, `Creating ${input.name}`)
  })
}

export async function seedHistoryContinuityFixture(
  language: CoreLanguage = 'es',
): Promise<HistoryContinuityFixture> {
  await assertHistoryContinuityE2EReady()
  const config = requireE2EConfig(process.env)
  const userId = await seedE2EAccount(config)
  const supabase = adminClient(config)
  await updateCoreProfile(supabase, userId, config.runId, language)

  const exercise = await firstPublicStrengthExercise(supabase)
  const fixtureNow = new Date()
  const dayOfWeek = isoTodayForE2ETimeZone(fixtureNow)
  const sourcePlanId = randomUUID()
  const sourceFamilyId = randomUUID()
  const sourceWorkoutId = randomUUID()
  const activePlanId = randomUUID()
  const activeFamilyId = randomUUID()
  const activeWorkoutId = randomUUID()
  const progressLogId = randomUUID()
  const fixture: HistoryContinuityFixture = {
    userId,
    progressLogId,
    sourcePlanId,
    sourceWorkoutId,
    activePlanId,
    activeWorkoutId,
  }

  try {
    await createHistoryContinuityPlan(supabase, {
      id: sourcePlanId,
      userId,
      familyId: sourceFamilyId,
      name: 'E2E Continuity Plan A',
      active: true,
      weekNumber: 1,
    })
    await createHistoryContinuityWorkout(supabase, {
      id: sourceWorkoutId,
      userId,
      planId: sourcePlanId,
      name: 'E2E Plan A Legs',
      dayOfWeek,
    })
    await retryTransientSupabase('Creating Plan A exercise', async () => {
      const { error } = await supabase.from('workout_exercises').insert({
        id: randomUUID(),
        workout_id: sourceWorkoutId,
        exercise_id: exercise.id,
        order_index: 1,
        sets: 2,
        reps: 10,
        rest_seconds: 45,
        weight_kg: 35,
        target_rpe: 7,
        weight_suggestion_basis: 'estimated_from_profile',
      })
      assertNoError(error, 'Creating Plan A exercise')
    })

    const completedAt = fixtureNow.toISOString()
    await retryTransientSupabase('Completing Plan A workout', async () => {
      const { error } = await supabase.from('progress_logs').insert({
        id: progressLogId,
        user_id: userId,
        workout_id: sourceWorkoutId,
        completed_at: completedAt,
        duration_minutes: 28,
        mood_rating: 4,
        session_context_snapshot: {
          version: 1,
          workout: { id: sourceWorkoutId, name: 'E2E Plan A Legs', focus: 'Piernas', dayOfWeek },
          plan: { id: sourcePlanId, familyId: sourceFamilyId, name: 'E2E Continuity Plan A', weekNumber: 1 },
          exercises: [{
            exerciseId: exercise.id,
            name: exercise.name,
            nameEs: exercise.name_es,
            muscleGroups: exercise.muscle_groups ?? [],
            muscleGroupsEs: exercise.muscle_groups_es ?? [],
            isCompound: exercise.is_compound ?? false,
          }],
        },
      })
      assertNoError(error, 'Completing Plan A workout')
    })
    await createExerciseLogFixture(supabase, { userId, planId: sourcePlanId, workoutId: sourceWorkoutId, exerciseId: exercise.id }, progressLogId)

    await createHistoryContinuityPlan(supabase, {
      id: activePlanId,
      userId,
      familyId: activeFamilyId,
      name: 'E2E Continuity Plan B',
      active: false,
      weekNumber: 2,
    })
    await createHistoryContinuityWorkout(supabase, {
      id: activeWorkoutId,
      userId,
      planId: activePlanId,
      name: 'E2E Plan B Full Body',
      dayOfWeek,
    })
    await retryTransientSupabase('Activating Plan B and retiring Plan A', async () => {
      const deactivate = await supabase
        .from('workout_plans')
        .update({ is_active: false })
        .eq('id', sourcePlanId)
        .eq('user_id', userId)
      assertNoError(deactivate.error, 'Deactivating Plan A')
      const activate = await supabase
        .from('workout_plans')
        .update({ is_active: true })
        .eq('id', activePlanId)
        .eq('user_id', userId)
      assertNoError(activate.error, 'Activating Plan B')
      const { error } = await supabase
        .from('workout_plans')
        .update({ retired_at: new Date().toISOString() })
        .eq('id', sourcePlanId)
        .eq('user_id', userId)
      assertNoError(error, 'Retiring Plan A')
    })
    await retryTransientSupabase('Detaching Plan A evidence without deleting it', async () => {
      const { error } = await supabase
        .from('progress_logs')
        .update({ workout_id: null })
        .eq('id', progressLogId)
        .eq('user_id', userId)
      assertNoError(error, 'Detaching Plan A evidence without deleting it')
    })

    return fixture
  } catch (error) {
    await cleanupFailedHistoryContinuityFixture(supabase, fixture)
    throw error
  }
}

function historyContinuityCleanupOperations(
  supabase: SupabaseClient,
  fixture: HistoryContinuityFixture,
): Array<() => Promise<void>> {
  return [
    async () => {
      await retryTransientSupabase('Removing scoped E2E continuity evidence', async () => {
        const { error } = await supabase
          .from('progress_logs')
          .delete()
          .eq('id', fixture.progressLogId)
          .eq('user_id', fixture.userId)
        assertNoError(error, 'Removing scoped E2E continuity evidence')
      })
    },
    async () => {
      await retryTransientSupabase('Removing scoped E2E continuity workouts', async () => {
        const { error } = await supabase
          .from('workouts')
          .delete()
          .in('id', [fixture.sourceWorkoutId, fixture.activeWorkoutId])
          .eq('user_id', fixture.userId)
        assertNoError(error, 'Removing scoped E2E continuity workouts')
      })
    },
    async () => {
      await retryTransientSupabase('Removing scoped E2E continuity plans', async () => {
        const { error } = await supabase
          .from('workout_plans')
          .delete()
          .in('id', [fixture.sourcePlanId, fixture.activePlanId])
          .eq('user_id', fixture.userId)
        assertNoError(error, 'Removing scoped E2E continuity plans')
      })
    },
  ]
}

async function cleanupFailedHistoryContinuityFixture(
  supabase: SupabaseClient,
  fixture: HistoryContinuityFixture,
): Promise<void> {
  for (const cleanup of historyContinuityCleanupOperations(supabase, fixture)) {
    try {
      await cleanup()
    } catch {
      // The seed error is more useful than a compensating cleanup failure.
    }
  }
}

export async function cleanupHistoryContinuityFixture(fixture: HistoryContinuityFixture): Promise<void> {
  await assertHistoryContinuityE2EReady()
  const config = requireE2EConfig(process.env)
  const supabase = adminClient(config)

  for (const cleanup of historyContinuityCleanupOperations(supabase, fixture)) {
    await cleanup()
  }
}
