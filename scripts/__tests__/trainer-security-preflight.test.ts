import { describe, expect, it, vi } from 'vitest'
import {
  TRAINER_SECURITY_ID_FIELDS,
  TRAINER_SECURITY_PREFLIGHT_ERROR,
  assertTrainerSecuritySchemaReady,
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

  it('uses only SELECT and the read-only 045 marker for migrations 042-045', async () => {
    const limit = vi.fn().mockResolvedValue({ error: null })
    const select = vi.fn(() => ({ limit }))
    const from = vi.fn(() => ({ select }))
    const rpc = vi.fn().mockResolvedValue({ data: 45, error: null })

    await expect(probeTrainerSecurityReadOnly({ from, rpc })).resolves.toEqual({
      tableError: null,
      marker: 45,
    })

    expect(from).toHaveBeenCalledTimes(10)
    expect(select).toHaveBeenCalledTimes(10)
    expect(limit).toHaveBeenCalledTimes(10)
    expect(rpc).toHaveBeenCalledTimes(1)
    expect(rpc).toHaveBeenCalledWith('trainer_security_preflight')
  })

  it.each([
    { tableError: { message: 'relation does not exist' }, marker: 45 },
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
      prepare: async () => ({ cleanup, resetPolicy: 'dedicated-project-reset' as const }),
      exercise: async () => { throw new Error('assertion failed') },
    })).rejects.toThrow('assertion failed')

    expect(cleanup).toHaveBeenCalledOnce()
  })
})
