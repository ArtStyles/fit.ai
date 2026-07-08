import { describe, expect, it, vi } from 'vitest'
import {
  cleanupE2EAccount,
  cleanupE2EAccountFromEnvironment,
  requireE2EConfig,
  resetE2EAccount,
  type E2EAccountAdmin,
} from '../seed-e2e-account'

describe('requireE2EConfig', () => {
  const valid = {
    NEXT_PUBLIC_SUPABASE_URL: 'https://e2etargetref12345678.supabase.co',
    E2E_SUPABASE_URL: 'https://e2etargetref12345678.supabase.co',
    E2E_SUPABASE_PROJECT_REF: 'e2etargetref12345678',
    SUPABASE_SERVICE_ROLE_KEY: 'service-role-key',
    E2E_RUN_ID: 'run-20260706-a1',
    E2E_USER_EMAIL: 'e2e-run-20260706-a1@example.test',
    E2E_USER_PASSWORD: 'strong-ephemeral-password-1',
  }

  it('refuses an account outside the reserved example.test domain', () => {
    expect(() => requireE2EConfig({
      ...valid,
      E2E_USER_EMAIL: 'person@example.com',
    })).toThrow('E2E_USER_EMAIL must equal e2e-run-20260706-a1@example.test')
  })

  it.each([
    'NEXT_PUBLIC_SUPABASE_URL',
    'E2E_SUPABASE_URL',
    'E2E_SUPABASE_PROJECT_REF',
    'SUPABASE_SERVICE_ROLE_KEY',
    'E2E_RUN_ID',
    'E2E_USER_EMAIL',
    'E2E_USER_PASSWORD',
  ] as const)('requires %s', key => {
    expect(() => requireE2EConfig({ ...valid, [key]: undefined })).toThrow(`${key} is required`)
  })

  it('refuses a project ref that does not match the allowlisted host', () => {
    expect(() => requireE2EConfig({
      ...valid,
      E2E_SUPABASE_PROJECT_REF: 'anotherprojectref1234',
    })).toThrow('E2E_SUPABASE_PROJECT_REF must match the E2E_SUPABASE_URL host')
  })

  it('refuses when the app points at a different Supabase project', () => {
    expect(() => requireE2EConfig({
      ...valid,
      NEXT_PUBLIC_SUPABASE_URL: 'https://productionref123456.supabase.co',
    })).toThrow('NEXT_PUBLIC_SUPABASE_URL must equal E2E_SUPABASE_URL')
  })

  it('requires the run-specific account email to match the sanitized run id', () => {
    expect(() => requireE2EConfig({
      ...valid,
      E2E_RUN_ID: 'PR 42 / attempt 3',
      E2E_USER_EMAIL: 'e2e-some-other-run@example.test',
    })).toThrow('E2E_USER_EMAIL must equal e2e-pr-42-attempt-3@example.test')
  })

  it('refuses overlong run ids instead of truncating them into a collision', () => {
    const longRunId = `run-${'a'.repeat(49)}`
    expect(() => requireE2EConfig({
      ...valid,
      E2E_RUN_ID: longRunId,
      E2E_USER_EMAIL: `e2e-${longRunId}@example.test`,
    })).toThrow('E2E_RUN_ID must sanitize to 48 characters or fewer')
  })
})

describe('resetE2EAccount', () => {
  it('resets only the selected account profile and plan graph', async () => {
    const store: E2EAccountAdmin = {
      findUserByEmail: vi.fn().mockResolvedValue(null),
      createUser: vi.fn(),
      updateUser: vi.fn(),
      removePlanGenerationEvents: vi.fn().mockResolvedValue(undefined),
      removeProgressLogs: vi.fn().mockResolvedValue(undefined),
      removeWorkouts: vi.fn().mockResolvedValue(undefined),
      removeWorkoutPlans: vi.fn().mockResolvedValue(undefined),
      resetProfile: vi.fn().mockResolvedValue(undefined),
      deleteAuthUser: vi.fn().mockResolvedValue(undefined),
    }

    await resetE2EAccount(store, 'user-under-test')

    expect(store.removePlanGenerationEvents).toHaveBeenCalledWith('user-under-test')
    expect(store.removeProgressLogs).toHaveBeenCalledWith('user-under-test')
    expect(store.removeWorkouts).toHaveBeenCalledWith('user-under-test')
    expect(store.removeWorkoutPlans).toHaveBeenCalledWith('user-under-test')
    expect(store.resetProfile).toHaveBeenCalledWith('user-under-test')
    expect(vi.mocked(store.removePlanGenerationEvents).mock.invocationCallOrder[0])
      .toBeLessThan(vi.mocked(store.removeProgressLogs).mock.invocationCallOrder[0])
    expect(vi.mocked(store.removeProgressLogs).mock.invocationCallOrder[0])
      .toBeLessThan(vi.mocked(store.removeWorkoutPlans).mock.invocationCallOrder[0])
    expect(vi.mocked(store.removeWorkouts).mock.invocationCallOrder[0])
      .toBeLessThan(vi.mocked(store.removeWorkoutPlans).mock.invocationCallOrder[0])
  })
})

describe('cleanupE2EAccount', () => {
  const config = requireE2EConfig({
    NEXT_PUBLIC_SUPABASE_URL: 'https://e2etargetref12345678.supabase.co',
    E2E_SUPABASE_URL: 'https://e2etargetref12345678.supabase.co',
    E2E_SUPABASE_PROJECT_REF: 'e2etargetref12345678',
    SUPABASE_SERVICE_ROLE_KEY: 'service-role-key',
    E2E_RUN_ID: 'cleanup-7',
    E2E_USER_EMAIL: 'e2e-cleanup-7@example.test',
    E2E_USER_PASSWORD: 'strong-ephemeral-password-1',
  })

  function admin(): E2EAccountAdmin {
    return {
      findUserByEmail: vi.fn().mockResolvedValue({ id: 'cleanup-user' }),
      createUser: vi.fn(),
      updateUser: vi.fn(),
      removePlanGenerationEvents: vi.fn().mockResolvedValue(undefined),
      removeProgressLogs: vi.fn().mockResolvedValue(undefined),
      removeWorkouts: vi.fn().mockResolvedValue(undefined),
      removeWorkoutPlans: vi.fn().mockResolvedValue(undefined),
      resetProfile: vi.fn().mockResolvedValue(undefined),
      deleteAuthUser: vi.fn().mockResolvedValue(undefined),
    }
  }

  it('resets the exact account before deleting its auth user', async () => {
    const target = admin()
    await cleanupE2EAccount(config, target)

    expect(target.findUserByEmail).toHaveBeenCalledWith(config.email)
    expect(target.deleteAuthUser).toHaveBeenCalledWith('cleanup-user')
    expect(vi.mocked(target.resetProfile).mock.invocationCallOrder[0])
      .toBeLessThan(vi.mocked(target.deleteAuthUser).mock.invocationCallOrder[0])
  })

  it('refuses invalid cleanup configuration before creating an admin client', async () => {
    const connect = vi.fn(() => admin())
    await expect(cleanupE2EAccountFromEnvironment({
      NEXT_PUBLIC_SUPABASE_URL: 'https://e2etargetref12345678.supabase.co',
      E2E_SUPABASE_URL: 'https://e2etargetref12345678.supabase.co',
      E2E_SUPABASE_PROJECT_REF: 'production-project',
      SUPABASE_SERVICE_ROLE_KEY: 'service-role-key',
      E2E_RUN_ID: 'cleanup-7',
      E2E_USER_EMAIL: 'e2e-cleanup-7@example.test',
      E2E_USER_PASSWORD: 'strong-ephemeral-password-1',
    }, connect)).rejects.toThrow('E2E_SUPABASE_PROJECT_REF must match the E2E_SUPABASE_URL host')
    expect(connect).not.toHaveBeenCalled()
  })
})
