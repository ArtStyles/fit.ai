import { describe, expect, it, vi } from 'vitest'
import {
  TRAINER_SECURITY_ID_FIELDS,
  TRAINER_SECURITY_PREFLIGHT_ERROR,
  assertTrainerSecuritySchemaReady,
  isTrainerMarketplaceE2EEnabled,
  probeTrainerSecurityReadOnly,
  requireDeniedGenericOutcome,
  runPreparedTrainerSecurityRace,
  runTrainerSecurityFixtureAfterPreflight,
} from '../../tests/e2e/helpers/trainer-marketplace'

describe('trainer security E2E deployment boundary', () => {
  it('covers the exact nine cross-tenant identifiers', () => {
    expect(TRAINER_SECURITY_ID_FIELDS).toEqual([
      'applicationId',
      'credentialId',
      'requestId',
      'relationshipId',
      'clientId',
      'templateId',
      'assignmentId',
      'planId',
      'progressLogId',
    ])
  })

  it('uses exactly one read-only 057 marker call before marketplace fixture writes', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: 57, error: null })

    await expect(probeTrainerSecurityReadOnly({ rpc })).resolves.toEqual({
      tableError: null,
      marker: 57,
    })

    expect(rpc).toHaveBeenCalledTimes(1)
    expect(rpc).toHaveBeenCalledWith('trainer_security_preflight')
  })

  it('requires every destructive dedicated-project acknowledgement for the full marketplace journey', () => {
    const enabled: NodeJS.ProcessEnv = {
      NODE_ENV: 'test',
      E2E_RUN_ID: 'marketplace-gate-run',
      E2E_TRAINER_RELATIONSHIPS_ENABLED: 'true',
      E2E_TRAINER_PROGRAMMING_ENABLED: 'true',
      E2E_TRAINER_PROGRAMMING_RETENTION_ACK: 'dedicated-project-reset',
      E2E_TRAINER_INSIGHTS_ENABLED: 'true',
      E2E_TRAINER_SECURITY_ENABLED: 'true',
      E2E_TRAINER_MARKETPLACE_ENABLED: 'true',
      COMMUNITY_ENABLED: 'false',
      TRAINER_PAYMENTS_ENABLED: 'false',
      TRAINER_MESSAGING_ENABLED: 'false',
      TRAINER_REVIEWS_ENABLED: 'false',
    }

    expect(isTrainerMarketplaceE2EEnabled(enabled)).toBe(true)
    expect(isTrainerMarketplaceE2EEnabled({ ...enabled, E2E_TRAINER_MARKETPLACE_ENABLED: 'false' })).toBe(false)
    expect(isTrainerMarketplaceE2EEnabled({ ...enabled, E2E_TRAINER_PROGRAMMING_RETENTION_ACK: undefined })).toBe(false)
    expect(isTrainerMarketplaceE2EEnabled({ ...enabled, COMMUNITY_ENABLED: 'true' })).toBe(false)
    expect(isTrainerMarketplaceE2EEnabled({ ...enabled, TRAINER_PAYMENTS_ENABLED: 'true' })).toBe(false)
    expect(isTrainerMarketplaceE2EEnabled({ ...enabled, TRAINER_MESSAGING_ENABLED: 'true' })).toBe(false)
    expect(isTrainerMarketplaceE2EEnabled({ ...enabled, TRAINER_REVIEWS_ENABLED: 'true' })).toBe(false)
    expect(isTrainerMarketplaceE2EEnabled({ ...enabled, STRIPE_SECRET_KEY: 'configured' })).toBe(false)
    expect(isTrainerMarketplaceE2EEnabled({ ...enabled, E2E_RUN_ID: '' })).toBe(false)
    expect(isTrainerMarketplaceE2EEnabled({ ...enabled, NODE_ENV: 'production' })).toBe(false)
  })

  it.each([
    { tableError: { message: 'relation does not exist' }, marker: 57 },
    { tableError: null, marker: null },
    { tableError: null, marker: 44 },
  ])('blocks an incomplete deployment before seed or cleanup: %j', async probe => {
    const seed = vi.fn()
    const cleanup = vi.fn()

    await expect(runTrainerSecurityFixtureAfterPreflight({
      preflight: () => assertTrainerSecuritySchemaReady({
        probeReadOnly: async () => probe,
      }),
      seed,
      cleanup,
    })).rejects.toThrow(TRAINER_SECURITY_PREFLIGHT_ERROR)

    expect(seed).not.toHaveBeenCalled()
    expect(cleanup).not.toHaveBeenCalled()
  })

  it('rejects successful object payloads and requires a concrete generic denial code', () => {
    expect(() => requireDeniedGenericOutcome({ data: { id: 'leaked' }, error: null }))
      .toThrow('IDOR attempt unexpectedly succeeded')
    expect(() => requireDeniedGenericOutcome({ data: [], error: null }))
      .toThrow('IDOR attempt unexpectedly succeeded')
    expect(() => requireDeniedGenericOutcome({ data: null, error: { message: 'not available' } }))
      .toThrow('generic denial code')
    expect(requireDeniedGenericOutcome({
      data: null,
      error: { code: 'P0001', message: 'COACHING_RELATIONSHIP_NOT_FOUND' },
    })).toEqual({ code: 'P0001', domain: 'COACHING_RELATIONSHIP_NOT_FOUND' })
  })

  it('always runs registered cleanup when a partially seeded fixture throws', async () => {
    const cleanup = vi.fn().mockResolvedValue(undefined)

    await expect(runTrainerSecurityFixtureAfterPreflight({
      preflight: async () => undefined,
      seed: async () => { throw new Error('partial seed') },
      cleanup,
    })).rejects.toThrow('partial seed')

    expect(cleanup).toHaveBeenCalledOnce()
  })

  it('always applies the explicit reset policy after a published race assertion fails', async () => {
    const cleanup = vi.fn().mockResolvedValue(undefined)

    await expect(runPreparedTrainerSecurityRace({
      prepare: async () => ({ cleanup }),
      exercise: async () => { throw new Error('assertion failed') },
    })).rejects.toThrow('assertion failed')

    expect(cleanup).toHaveBeenCalledOnce()
  })
})
