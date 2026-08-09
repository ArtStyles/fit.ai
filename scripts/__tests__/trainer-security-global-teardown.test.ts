import { describe, expect, it, vi } from 'vitest'
import { runGlobalTeardown } from '../../tests/e2e/global-teardown'

describe('trainer security global teardown isolation', () => {
  it('runs general account cleanup even when security preflight blocks fixture cleanup', async () => {
    const cleanupGeneral = vi.fn().mockResolvedValue(true)
    const preflightSecurity = vi.fn().mockRejectedValue(new Error('remote behind'))

    await expect(runGlobalTeardown({
      cleanupGeneral,
      preflightSecurity,
      log: vi.fn(),
    }, { NODE_ENV: 'test', E2E_TRAINER_SECURITY_ENABLED: 'true' })).resolves.toBeUndefined()

    expect(preflightSecurity).toHaveBeenCalledOnce()
    expect(cleanupGeneral).toHaveBeenCalledOnce()
  })
})
