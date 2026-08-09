import { expect, test } from './fixtures'
import {
  createTrainerE2EAdminClient,
  isTrainerSecurityE2EEnabled,
} from './helpers/core-product'
import {
  TRAINER_SECURITY_ID_FIELDS,
  assertTrainerSecurityRemoteReady,
  prepareAcceptPublishSuspendRace,
  prepareEndReadEvidenceRace,
  prepareIdempotentProposalRace,
  prepareRevisionRace,
  prepareTwoTrainerAcceptRace,
  runTrainerSecurityFixtureAfterPreflight,
  type PreparedSecurityRace,
} from './helpers/trainer-marketplace'

test.describe.configure({ mode: 'serial' })

function rows(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value) ? value as Array<Record<string, unknown>> : []
}

function successful(results: PromiseSettledResult<{ error: unknown }>[]) {
  return results.filter(result => result.status === 'fulfilled' && !result.value.error).length
}

function activeCount(state: Record<string, unknown>, key: string) {
  return rows(state[key]).filter(row => row.status === 'active' || row.is_active === true).length
}

async function preflightAndSeed<T>(seed: () => Promise<T>): Promise<T> {
  const service = createTrainerE2EAdminClient()
  return runTrainerSecurityFixtureAfterPreflight({
    preflight: () => assertTrainerSecurityRemoteReady(service),
    seed,
  })
}

test('concurrent trainer workflows linearize without duplicate or partial state', async ({ trainerSecurityScope }) => {
  test.skip(!isTrainerSecurityE2EEnabled(process.env),
    'Requires dedicated E2E credentials, migrations 042-045, immutable-reset acknowledgement, and E2E_TRAINER_SECURITY_ENABLED=true.')
  test.setTimeout(900_000)

  // Each scenario owns separately authenticated Supabase clients. The local
  // Docker command is the release evidence while an outdated remote stops in
  // the read-only preflight above, before the first callback below can seed.
  const acceptRace = await preflightAndSeed(() => prepareTwoTrainerAcceptRace(
    `${trainerSecurityScope}-accept`, process.env.E2E_USER_PASSWORD!,
  ))
  const acceptResults = await Promise.allSettled([
    acceptRace.run.trainerA(),
    acceptRace.run.trainerB(),
  ])
  expect(successful(acceptResults as PromiseSettledResult<{ error: unknown }>[])).toBe(1)
  const acceptState = await acceptRace.inspect()
  expect(activeCount(acceptState, 'relationships')).toBe(1)
  expect(rows(acceptState.requests).filter(row => row.status === 'accepted')).toHaveLength(1)

  const proposalRace = await preflightAndSeed(() => prepareIdempotentProposalRace(`${trainerSecurityScope}-proposal`))
  const proposalResults = await Promise.allSettled([
    proposalRace.run.trainerA(),
    proposalRace.run.trainerB(),
  ])
  expect(successful(proposalResults as PromiseSettledResult<{ error: unknown }>[])).toBe(2)
  const proposalObjects = proposalResults
    .filter((result): result is PromiseFulfilledResult<{ data: unknown; error: null }> => result.status === 'fulfilled' && !result.value.error)
    .map(result => JSON.stringify(result.value.data))
  expect(new Set(proposalObjects).size).toBe(1)
  const proposalState = await proposalRace.inspect()
  expect(rows(proposalState.assignments)).toHaveLength(1)
  expect(rows(proposalState.versions)).toHaveLength(1)
  expect(rows(proposalState.plans)).toHaveLength(1)
  expect(rows(proposalState.versions)[0]?.materialized_plan_id).toBeTruthy()

  const transitionRace = await preflightAndSeed(() => prepareAcceptPublishSuspendRace(`${trainerSecurityScope}-transition`))
  const transitionResults = await Promise.allSettled([
    transitionRace.run.accept(),
    transitionRace.run.publish(),
    transitionRace.run.suspend(),
  ])
  expect(successful(transitionResults as PromiseSettledResult<{ error: unknown }>[])).toBeGreaterThanOrEqual(1)
  const transitionState = await transitionRace.inspect()
  expect(activeCount(transitionState, 'assignments')).toBeLessThanOrEqual(1)
  expect(activeCount(transitionState, 'plans')).toBeLessThanOrEqual(1)
  expect(rows(transitionState.versions).every(version => Boolean(version.materialized_plan_id))).toBe(true)

  const revisionRace = await preflightAndSeed(() => prepareRevisionRace(`${trainerSecurityScope}-revision`))
  const revisionResults = await Promise.allSettled([
    revisionRace.run.trainerA(),
    revisionRace.run.trainerB(),
  ])
  expect(successful(revisionResults as PromiseSettledResult<{ error: unknown }>[])).toBe(2)
  const revisionState = await revisionRace.inspect()
  const versionNumbers = rows(revisionState.versions).map(row => Number(row.version_number))
  expect(new Set(versionNumbers).size).toBe(versionNumbers.length)
  expect(activeCount(revisionState, 'versions')).toBe(1)
  expect(activeCount(revisionState, 'plans')).toBe(1)
  expect(rows(revisionState.versions).every(version => Boolean(version.materialized_plan_id))).toBe(true)

  const evidenceRace = await preflightAndSeed(() => prepareEndReadEvidenceRace(`${trainerSecurityScope}-evidence`))
  const evidenceResults = await Promise.allSettled([
    evidenceRace.run.end(),
    evidenceRace.run.read(),
  ])
  expect(successful(evidenceResults as PromiseSettledResult<{ error: unknown }>[])).toBeGreaterThanOrEqual(1)
  const evidenceState = await evidenceRace.inspect()
  expect((evidenceState.relationship as { status?: string } | null)?.status).toBe('ended')
})

type IdorResult = { error: { message?: string } | null; data: unknown }

function genericCode(result: IdorResult) {
  return result.error?.message?.match(/[A-Z][A-Z0-9_]{3,}/)?.[0] ?? 'NO_MATCH'
}

async function idorAttempt(race: PreparedSecurityRace, field: typeof TRAINER_SECURITY_ID_FIELDS[number], id: string): Promise<IdorResult> {
  const actor = race.actors.trainerA ?? race.actors.trainer
  switch (field) {
    case 'applicationId': return (actor.rpc as any)('submit_trainer_application', { p_application_id: id })
    case 'credentialId': return (actor.rpc as any)('prepare_trainer_credential_removal', { p_application_id: id, p_credential_id: id })
    case 'requestId': return (actor.rpc as any)('accept_coaching_request', { request_id: id, idempotency_key: id })
    case 'relationshipId': return (actor.rpc as any)('end_coaching_relationship', { p_relationship_id: id, p_reason: null, p_idempotency_key: id })
    case 'clientId': return (actor.rpc as any)('get_coach_client_insights', { p_client_id: id, p_from_date: '2026-07-01', p_to_date: '2026-08-01' })
    case 'templateId': return (actor.rpc as any)('propose_trainer_assignment', { p_relationship_id: id, p_template_id: id, p_change_summary: null, p_idempotency_key: id })
    case 'assignmentId': return (actor.rpc as any)('accept_trainer_assignment', { p_assignment_id: id, p_idempotency_key: id })
    case 'planId': return (actor.from('workout_plans') as any).update({ name: 'IDOR blocked' }).eq('id', id).select('id')
    case 'progressLogId': return (actor.from('progress_logs') as any).update({ notes: 'IDOR blocked' }).eq('id', id).select('id')
  }
}

test('missing and foreign IDs return the same generic outcome and change zero rows', async ({ trainerSecurityScope }) => {
  test.skip(!isTrainerSecurityE2EEnabled(process.env), 'Requires the dedicated trainer security environment.')
  test.setTimeout(600_000)
  const race = await preflightAndSeed(() => prepareIdempotentProposalRace(`${trainerSecurityScope}-idor`))
  const foreignId = 'aaaaaaaa-0000-4000-8000-000000000001'
  const missingId = 'ffffffff-0000-4000-8000-000000000001'
  const before = await race.inspect()

  for (const field of TRAINER_SECURITY_ID_FIELDS) {
    const [foreign, missing] = await Promise.all([
      idorAttempt(race, field, foreignId),
      idorAttempt(race, field, missingId),
    ])
    expect(genericCode(foreign), field).toBe(genericCode(missing))
    expect(rows(foreign.data), `${field} foreign response`).toHaveLength(0)
    expect(rows(missing.data), `${field} missing response`).toHaveLength(0)
  }

  expect(await race.inspect()).toEqual(before)
})
