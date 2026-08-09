import { describe, expect, it, vi } from 'vitest'
import {
  TRAINER_SECURITY_ID_FIELDS,
  TRAINER_SECURITY_PREFLIGHT_ERROR,
  assertTrainerSecuritySchemaReady,
  probeTrainerSecurityReadOnly,
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

  it('uses only SELECT and intentionally-invalid RPC probes for migrations 042-045', async () => {
    const limit = vi.fn().mockResolvedValue({ error: null })
    const select = vi.fn(() => ({ limit }))
    const from = vi.fn(() => ({ select }))
    const rpc = vi.fn().mockResolvedValue({ error: { message: 'P0001: invalid arguments' } })

    await expect(probeTrainerSecurityReadOnly({ from, rpc })).resolves.toEqual({
      tableError: null,
      missingRpc: false,
    })

    expect(from).toHaveBeenCalledTimes(10)
    expect(select).toHaveBeenCalledTimes(10)
    expect(limit).toHaveBeenCalledTimes(10)
    expect(rpc).toHaveBeenCalledTimes(8)
  })

  it.each([
    { tableError: { message: 'relation does not exist' }, missingRpc: false },
    { tableError: null, missingRpc: true },
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
})
