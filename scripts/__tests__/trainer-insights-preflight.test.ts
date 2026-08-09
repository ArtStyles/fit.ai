import { describe, expect, it, vi } from 'vitest'
import {
  TRAINER_INSIGHTS_PREFLIGHT_ERROR,
  assertTrainerInsightsSchemaReady,
  isTrainerInsightsE2EEnabled,
  probeTrainerInsightsReadOnly,
  runTrainerInsightsFixtureAfterPreflight,
} from '../../tests/e2e/helpers/core-product'

describe('trainer insights E2E opt-in', () => {
  it('requires the dedicated relationship, programming retention, and insights acknowledgements before fixture writes', () => {
    const enabled: NodeJS.ProcessEnv = {
      NODE_ENV: 'test',
      E2E_TRAINER_RELATIONSHIPS_ENABLED: 'true',
      E2E_TRAINER_PROGRAMMING_ENABLED: 'true',
      E2E_TRAINER_PROGRAMMING_RETENTION_ACK: 'dedicated-project-reset',
      E2E_TRAINER_INSIGHTS_ENABLED: 'true',
    }

    expect(isTrainerInsightsE2EEnabled(enabled)).toBe(true)
    expect(isTrainerInsightsE2EEnabled({ ...enabled, E2E_TRAINER_INSIGHTS_ENABLED: 'false' })).toBe(false)
    expect(isTrainerInsightsE2EEnabled({ ...enabled, E2E_TRAINER_PROGRAMMING_RETENTION_ACK: undefined })).toBe(false)
  })

  it.each([
    { label: 'migration 042 prerequisite', prerequisiteError: new Error('missing 042'), probe: { tableError: null, missingRpc: false } },
    { label: 'migration 043 prerequisite', prerequisiteError: new Error('missing 043'), probe: { tableError: null, missingRpc: false } },
    { label: 'migration 044 table', prerequisiteError: null, probe: { tableError: { message: 'table not found' }, missingRpc: false } },
    { label: 'Insights RPC', prerequisiteError: null, probe: { tableError: null, missingRpc: true } },
  ])('blocks $label with the generic deployment error before any fixture callback runs', async ({ prerequisiteError, probe }) => {
    const probeReadOnly = vi.fn().mockResolvedValue(probe)
    const seed = vi.fn()
    const cleanup = vi.fn()

    await expect(runTrainerInsightsFixtureAfterPreflight({
      preflight: () => assertTrainerInsightsSchemaReady({
        assertPrerequisites: async () => {
          if (prerequisiteError) throw prerequisiteError
        },
        probeReadOnly,
      }),
      seed,
      cleanup,
    })).rejects.toThrow(TRAINER_INSIGHTS_PREFLIGHT_ERROR)

    expect(probeReadOnly).toHaveBeenCalledTimes(prerequisiteError ? 0 : 1)
    expect(seed).not.toHaveBeenCalled()
    expect(cleanup).not.toHaveBeenCalled()
  })

  it('uses only select and invalid RPC probes to detect a missing Insights deployment', async () => {
    const limit = vi.fn().mockResolvedValue({ error: null })
    const select = vi.fn(() => ({ limit }))
    const from = vi.fn(() => ({ select }))
    const rpc = vi.fn().mockResolvedValue({ error: { message: 'PGRST202: function not found' } })

    const result = await probeTrainerInsightsReadOnly({ from, rpc })

    expect(result.tableError).toBeNull()
    expect(result.missingRpc).toBe(true)
    expect(from).toHaveBeenCalledTimes(5)
    expect(select).toHaveBeenCalledTimes(5)
    expect(limit).toHaveBeenCalledTimes(5)
    expect(rpc).toHaveBeenCalledTimes(3)
  })
})
