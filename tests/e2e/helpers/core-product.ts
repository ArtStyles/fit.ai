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
  const weekday = new Intl.DateTimeFormat('en-US', {
    timeZone: E2E_TIME_ZONE,
    weekday: 'short',
  }).format(now)

  const isoWeekday = ISO_WEEKDAY_BY_SHORT_NAME[weekday]
  if (!isoWeekday) {
    throw new Error(`Unable to resolve E2E ISO weekday for ${weekday}`)
  }
  return isoWeekday
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
