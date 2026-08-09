import { describe, expect, it } from 'vitest'
import { isTrainerInsightsE2EEnabled } from '../../tests/e2e/helpers/core-product'

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
})
