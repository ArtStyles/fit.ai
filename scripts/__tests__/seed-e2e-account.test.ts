import { describe, expect, it, vi } from 'vitest'
import {
  requireE2EConfig,
  resetE2EAccount,
  type E2EAccountStore,
} from '../seed-e2e-account'

describe('requireE2EConfig', () => {
  const valid = {
    NEXT_PUBLIC_SUPABASE_URL: 'https://project.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'service-role-key',
    E2E_USER_EMAIL: 'activation@example.test',
    E2E_USER_PASSWORD: 'strong-ephemeral-password',
  }

  it('refuses an account outside the reserved example.test domain', () => {
    expect(() => requireE2EConfig({
      ...valid,
      E2E_USER_EMAIL: 'person@example.com',
    })).toThrow('E2E_USER_EMAIL must end in @example.test')
  })

  it.each([
    'NEXT_PUBLIC_SUPABASE_URL',
    'SUPABASE_SERVICE_ROLE_KEY',
    'E2E_USER_EMAIL',
    'E2E_USER_PASSWORD',
  ] as const)('requires %s', key => {
    expect(() => requireE2EConfig({ ...valid, [key]: undefined })).toThrow(`${key} is required`)
  })
})

describe('resetE2EAccount', () => {
  it('resets only the selected account profile and plan graph', async () => {
    const store: E2EAccountStore = {
      removePlanGenerationEvents: vi.fn().mockResolvedValue(undefined),
      removeWorkouts: vi.fn().mockResolvedValue(undefined),
      removeWorkoutPlans: vi.fn().mockResolvedValue(undefined),
      resetProfile: vi.fn().mockResolvedValue(undefined),
    }

    await resetE2EAccount(store, 'user-under-test')

    expect(store.removePlanGenerationEvents).toHaveBeenCalledWith('user-under-test')
    expect(store.removeWorkouts).toHaveBeenCalledWith('user-under-test')
    expect(store.removeWorkoutPlans).toHaveBeenCalledWith('user-under-test')
    expect(store.resetProfile).toHaveBeenCalledWith('user-under-test')
    expect(vi.mocked(store.removePlanGenerationEvents).mock.invocationCallOrder[0])
      .toBeLessThan(vi.mocked(store.removeWorkoutPlans).mock.invocationCallOrder[0])
    expect(vi.mocked(store.removeWorkouts).mock.invocationCallOrder[0])
      .toBeLessThan(vi.mocked(store.removeWorkoutPlans).mock.invocationCallOrder[0])
  })
})
