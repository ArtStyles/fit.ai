import { randomUUID } from 'node:crypto'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import {
  seedTrainerInsightsFixture,
  seedTrainerProgrammingFixture,
  seedTrainerRelationshipsFixture,
} from './core-product'

type QueryError = { message?: string } | null

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
  rpc(name: string, args?: Record<string, unknown>): PromiseLike<{ error: QueryError }>
}

export type TrainerSecurityProbeResult = { tableError: QueryError; missingRpc: boolean }

const missingFunction = (error: QueryError) =>
  /Could not find the function|PGRST202/i.test(error?.message ?? '')

/** The only remote operations allowed before the security fixture is created. */
export async function probeTrainerSecurityReadOnly(
  service: TrainerSecurityReadOnlyClient,
): Promise<TrainerSecurityProbeResult> {
  const [tables, ...rpcResults] = await Promise.all([
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
    service.rpc('accept_coaching_request', { request_id: null, idempotency_key: null }),
    service.rpc('end_coaching_relationship', { p_relationship_id: null, p_reason: null, p_idempotency_key: null }),
    service.rpc('propose_trainer_assignment', { p_relationship_id: null, p_template_id: null, p_change_summary: null, p_idempotency_key: null }),
    service.rpc('accept_trainer_assignment', { p_assignment_id: null, p_idempotency_key: null }),
    service.rpc('publish_trainer_assignment_revision', { p_assignment_id: null, p_template_id: null, p_change_summary: null, p_idempotency_key: null }),
    service.rpc('get_coach_client_insights', { p_client_id: null, p_from_date: null, p_to_date: null }),
    service.rpc('prepare_trainer_credential_removal', { p_application_id: null, p_credential_id: null }),
    service.rpc('trainer_security_preflight'),
  ])

  return {
    tableError: tables.find(result => result.error)?.error ?? null,
    missingRpc: rpcResults.some(result => missingFunction(result.error)),
  }
}

export async function assertTrainerSecuritySchemaReady(dependencies: {
  probeReadOnly: () => Promise<TrainerSecurityProbeResult>
}): Promise<void> {
  try {
    const probe = await dependencies.probeReadOnly()
    if (probe.tableError || probe.missingRpc) throw new Error(TRAINER_SECURITY_PREFLIGHT_ERROR)
  } catch {
    throw new Error(TRAINER_SECURITY_PREFLIGHT_ERROR)
  }
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
}

export async function prepareTwoTrainerAcceptRace(scope: string, password: string): Promise<PreparedSecurityRace> {
  const fixture = await seedTrainerRelationshipsFixture(scope)
  const first = await (fixture.client.client.rpc as any)('create_coaching_request', {
    service_id: fixture.trainerA.serviceId, message: 'Security request A', consent_version: 'training-profile-v1', idempotency_key: randomUUID(),
  })
  const second = await (fixture.client.client.rpc as any)('create_coaching_request', {
    service_id: fixture.trainerB.serviceId, message: 'Security request B', consent_version: 'training-profile-v1', idempotency_key: randomUUID(),
  })
  const firstId = first.data?.[0]?.request_id
  const secondId = second.data?.[0]?.request_id
  if (!firstId || !secondId) throw new Error('Could not prepare two-trainer acceptance race')
  fixture.created.requestIds.push(firstId, secondId)
  const trainerA = await independentActor(fixture.trainerA.email, password)
  const trainerB = await independentActor(fixture.trainerB.email, password)
  return {
    actors: { trainerA, trainerB },
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
  }
}

async function programmingRace(scope: string) {
  const fixture = await seedTrainerProgrammingFixture(scope)
  const proposal = await fixture.createTemplateAndPropose('Security concurrent program', `proposal-${scope}`)
  const trainerA = await independentActor(fixture.trainerA.email, fixture.password)
  const trainerB = await independentActor(fixture.trainerA.email, fixture.password)
  const client = await independentActor(fixture.client.email, fixture.password)
  return { fixture, proposal, trainerA, trainerB, client }
}

export async function prepareIdempotentProposalRace(scope: string): Promise<PreparedSecurityRace> {
  const prepared = await programmingRace(scope)
  const args = {
    p_relationship_id: prepared.fixture.relationshipId,
    p_template_id: prepared.proposal.templateId,
    p_change_summary: 'Retry must return the original object',
    p_idempotency_key: prepared.proposal.proposalIdempotencyKey,
  }
  return {
    actors: { trainerA: prepared.trainerA, trainerB: prepared.trainerB },
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
  }
}

export async function prepareAcceptPublishSuspendRace(scope: string): Promise<PreparedSecurityRace> {
  const prepared = await programmingRace(scope)
  return {
    actors: { client: prepared.client, trainer: prepared.trainerA },
    run: {
      accept: () => (prepared.client.rpc as any)('accept_trainer_assignment', { p_assignment_id: prepared.proposal.assignmentId, p_idempotency_key: `accept-${scope}` }),
      publish: () => (prepared.trainerA.rpc as any)('publish_trainer_assignment_revision', { p_assignment_id: prepared.proposal.assignmentId, p_template_id: prepared.proposal.templateId, p_change_summary: 'Concurrent publish', p_idempotency_key: `publish-${scope}` }),
      suspend: () => (prepared.fixture.service.rpc as any)('suspend_account_and_professional', { p_user_id: prepared.fixture.trainerA.id, p_admin_id: prepared.fixture.admin.id, p_reason: 'Security race', p_until: null }),
    },
    inspect: async () => {
      const [{ data: assignments }, { data: versions }, { data: plans }] = await Promise.all([
        (prepared.fixture.service.from('trainer_plan_assignments') as any).select('id,status,active_version_id').eq('id', prepared.proposal.assignmentId),
        (prepared.fixture.service.from('trainer_assignment_versions') as any).select('id,status,materialized_plan_id,version_number').eq('assignment_id', prepared.proposal.assignmentId),
        (prepared.fixture.service.from('workout_plans') as any).select('id,is_active').eq('trainer_assignment_id', prepared.proposal.assignmentId),
      ])
      return { assignments, versions, plans }
    },
  }
}

export async function prepareRevisionRace(scope: string): Promise<PreparedSecurityRace> {
  const prepared = await programmingRace(scope)
  const accepted = await (prepared.client.rpc as any)('accept_trainer_assignment', { p_assignment_id: prepared.proposal.assignmentId, p_idempotency_key: `accept-${scope}` })
  if (accepted.error) throw new Error('Could not prepare revision race')
  const revision = (client: SupabaseClient, suffix: string) => () => (client.rpc as any)('publish_trainer_assignment_revision', {
    p_assignment_id: prepared.proposal.assignmentId, p_template_id: prepared.proposal.templateId,
    p_change_summary: `Concurrent revision ${suffix}`, p_idempotency_key: `revision-${scope}-${suffix}`,
  })
  return {
    actors: { trainerA: prepared.trainerA, trainerB: prepared.trainerB },
    run: { trainerA: revision(prepared.trainerA, 'a'), trainerB: revision(prepared.trainerB, 'b') },
    inspect: async () => {
      const [{ data: versions }, { data: plans }] = await Promise.all([
        (prepared.fixture.service.from('trainer_assignment_versions') as any).select('id,status,materialized_plan_id,version_number').eq('assignment_id', prepared.proposal.assignmentId),
        (prepared.fixture.service.from('workout_plans') as any).select('id,is_active').eq('trainer_assignment_id', prepared.proposal.assignmentId),
      ])
      return { versions, plans }
    },
  }
}

export async function prepareEndReadEvidenceRace(scope: string): Promise<PreparedSecurityRace> {
  const fixture = await seedTrainerInsightsFixture(scope)
  const proposal = await fixture.createTemplateAndPropose('Security evidence program', `proposal-${scope}`)
  const accepted = await (fixture.client.client.rpc as any)('accept_trainer_assignment', { p_assignment_id: proposal.assignmentId, p_idempotency_key: `accept-${scope}` })
  if (accepted.error) throw new Error('Could not prepare evidence race')
  await fixture.prepareInsightsEvidence()
  const trainerA = await independentActor(fixture.trainerA.email, fixture.password)
  const trainerB = await independentActor(fixture.trainerA.email, fixture.password)
  return {
    actors: { trainerA, trainerB },
    run: {
      end: () => (trainerA.rpc as any)('end_coaching_relationship', { p_relationship_id: fixture.relationshipId, p_reason: 'Security evidence race', p_idempotency_key: randomUUID() }),
      read: () => (trainerB.rpc as any)('get_coach_client_insights', { p_client_id: fixture.client.id, p_from_date: new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10), p_to_date: new Date().toISOString().slice(0, 10) }),
    },
    inspect: async () => {
      const { data: relationship } = await (fixture.service.from('coaching_relationships') as any).select('status').eq('id', fixture.relationshipId).maybeSingle()
      return { relationship }
    },
  }
}
