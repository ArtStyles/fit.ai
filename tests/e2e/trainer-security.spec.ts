import { expect, test } from './fixtures'
import {
  createTrainerE2EAdminClient,
  isTrainerSecurityE2EEnabled,
} from './helpers/core-product'
import {
  TRAINER_SECURITY_ID_FIELDS,
  assertTrainerSecurityRemoteReady,
  prepareAcceptPublishSuspendRace,
  prepareAuthoritativeIdorRace,
  prepareEndReadEvidenceRace,
  prepareIdempotentProposalRace,
  prepareRevisionRace,
  prepareTwoTrainerAcceptRace,
  requireDeniedGenericOutcome,
  runPreparedTrainerSecurityRace,
  runTrainerSecurityFixtureAfterPreflight,
} from './helpers/trainer-marketplace'

test.describe.configure({ mode: 'serial' })

function rows(value: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) throw new Error('Expected an array result')
  return value as Array<Record<string, unknown>>
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
  await runPreparedTrainerSecurityRace({
    prepare: () => preflightAndSeed(() => prepareTwoTrainerAcceptRace(`${trainerSecurityScope}-accept`, process.env.E2E_USER_PASSWORD!)),
    exercise: async acceptRace => {
      const acceptResults = await Promise.allSettled([acceptRace.run.trainerA(), acceptRace.run.trainerB()])
      expect(successful(acceptResults as PromiseSettledResult<{ error: unknown }>[])).toBe(1)
      const state = await acceptRace.inspect()
      expect(rows(state.relationships)).toHaveLength(1)
      expect(activeCount(state, 'relationships')).toBe(1)
      expect(rows(state.requests).filter(row => row.status === 'accepted')).toHaveLength(1)
      expect(rows(state.requests).filter(row => row.status === 'cancelled')).toHaveLength(1)
    },
  })

  await runPreparedTrainerSecurityRace({
    prepare: () => preflightAndSeed(() => prepareIdempotentProposalRace(`${trainerSecurityScope}-proposal`)),
    exercise: async proposalRace => {
      const proposalResults = await Promise.allSettled([proposalRace.run.trainerA(), proposalRace.run.trainerB()])
      expect(successful(proposalResults as PromiseSettledResult<{ error: unknown }>[])).toBe(2)
      const objects = proposalResults
        .filter((result): result is PromiseFulfilledResult<{ data: unknown; error: null }> => result.status === 'fulfilled' && !result.value.error)
        .map(result => JSON.stringify(result.value.data))
      expect(new Set(objects).size).toBe(1)
      const state = await proposalRace.inspect()
      expect(rows(state.assignments)).toHaveLength(1)
      expect(rows(state.versions)).toHaveLength(1)
      expect(rows(state.plans)).toHaveLength(1)
      expect(rows(state.versions)[0]?.materialized_plan_id).toBeTruthy()
    },
  })

  await runPreparedTrainerSecurityRace({
    prepare: () => preflightAndSeed(() => prepareAcceptPublishSuspendRace(`${trainerSecurityScope}-transition`)),
    exercise: async transitionRace => {
      const results = await Promise.allSettled([transitionRace.run.accept(), transitionRace.run.publish(), transitionRace.run.suspend()])
      expect(results.every(result => result.status === 'fulfilled')).toBe(true)
      const suspendResult = results[2] as PromiseFulfilledResult<{ data: unknown; error: unknown }>
      expect(suspendResult.value.error).toBeNull()
      expect(suspendResult.value.data).toEqual({ accountSuspended: true })
      for (const result of results.slice(0, 2) as PromiseFulfilledResult<{ data: unknown; error: { message?: string } | null }>[]) {
        if (result.value.error) {
          const outcome = requireDeniedGenericOutcome(result.value)
          expect(['TRAINER_ASSIGNMENT_TRAINER_INACTIVE', 'COACHING_TRAINER_NOT_ACTIVE', 'TRAINER_ASSIGNMENT_RELATIONSHIP_INACTIVE']).toContain(outcome.domain)
        }
      }
      const state = await transitionRace.inspect()
      expect((state.account as { account_status?: string })?.account_status).toBe('suspended')
      expect((state.trainerProfile as { status?: string })?.status).toBe('suspended')
      expect((state.relationship as { status?: string })?.status).toBe('paused_by_platform')
      expect(rows(state.consents).every(consent => Boolean(consent.revoked_at))).toBe(true)
      expect(rows(state.assignments)).toHaveLength(1)
      expect(['proposed', 'frozen']).toContain(rows(state.assignments)[0]?.status)
      expect(rows(state.plans).filter(plan => plan.is_active === true)).toHaveLength(0)
      expect(rows(state.versions).every(version => Boolean(version.materialized_plan_id))).toBe(true)
    },
  })

  await runPreparedTrainerSecurityRace({
    prepare: () => preflightAndSeed(() => prepareRevisionRace(`${trainerSecurityScope}-revision`)),
    exercise: async revisionRace => {
      const results = await Promise.allSettled([revisionRace.run.trainerA(), revisionRace.run.trainerB()])
      expect(successful(results as PromiseSettledResult<{ error: unknown }>[])).toBe(2)
      const state = await revisionRace.inspect()
      const versionNumbers = rows(state.versions).map(row => Number(row.version_number))
      expect(new Set(versionNumbers).size).toBe(versionNumbers.length)
      expect(activeCount(state, 'versions')).toBe(1)
      expect(activeCount(state, 'plans')).toBe(1)
      expect(rows(state.versions).every(version => Boolean(version.materialized_plan_id))).toBe(true)
    },
  })

  await runPreparedTrainerSecurityRace({
    prepare: () => preflightAndSeed(() => prepareEndReadEvidenceRace(`${trainerSecurityScope}-evidence`)),
    exercise: async evidenceRace => {
      const results = await Promise.allSettled([evidenceRace.run.end(), evidenceRace.run.read()])
      expect(results[0].status).toBe('fulfilled')
      expect((results[0] as PromiseFulfilledResult<{ error: unknown }>).value.error).toBeNull()
      if (results[1].status === 'fulfilled' && results[1].value.error) requireDeniedGenericOutcome(results[1].value)
      const postCommitRead = await evidenceRace.run.readAfter()
      expect(requireDeniedGenericOutcome(postCommitRead).domain).toBe('COACH_CLIENT_INSIGHTS_UNAVAILABLE')
      const state = await evidenceRace.inspect()
      expect((state.relationship as { status?: string })?.status).toBe('ended')
      expect(rows(state.consents).every(consent => Boolean(consent.revoked_at))).toBe(true)
      expect(rows(state.assignments).every(assignment => assignment.status === 'frozen')).toBe(true)
      expect(rows(state.versions).every(version => version.status === 'frozen' && Boolean(version.materialized_plan_id))).toBe(true)
      expect(rows(state.plans).filter(plan => plan.is_active === true)).toHaveLength(0)
    },
  })
})

test('missing and foreign IDs return the same generic outcome and change zero rows', async ({ trainerSecurityScope }) => {
  test.skip(!isTrainerSecurityE2EEnabled(process.env), 'Requires the dedicated trainer security environment.')
  test.setTimeout(600_000)
  await runPreparedTrainerSecurityRace({
    prepare: () => preflightAndSeed(() => prepareAuthoritativeIdorRace(`${trainerSecurityScope}-idor`)),
    exercise: async race => {
      const before = await race.inspect()
      for (const field of TRAINER_SECURITY_ID_FIELDS) {
        expect(race.foreignIds[field], `${field} foreign ID`).not.toBe(race.missingIds[field])
        const [foreign, missing] = await Promise.all([race.attempt(field, 'foreign'), race.attempt(field, 'missing')])
        expect(requireDeniedGenericOutcome(foreign), field).toEqual(requireDeniedGenericOutcome(missing))
      }
      expect(await race.inspect()).toEqual(before)
    },
  })
})
