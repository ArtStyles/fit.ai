import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))
vi.mock('next/navigation', () => ({ redirect: vi.fn((path: string) => { throw new Error(`REDIRECT:${path}`) }) }))
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('@/lib/supabase/service', () => ({ createServiceClient: vi.fn() }))

import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { requireAdminUserContext } from '../admin'

const createAuthClient = vi.mocked(createClient)
const createService = vi.mocked(createServiceClient)

describe('trainer marketplace authenticated admin UI boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubEnv('NODE_ENV', 'test')
    vi.stubEnv('E2E_RUN_ID', 'admin-boundary-run')
    vi.stubEnv('E2E_TRAINER_RELATIONSHIPS_ENABLED', 'true')
    vi.stubEnv('E2E_TRAINER_PROGRAMMING_ENABLED', 'true')
    vi.stubEnv('E2E_TRAINER_PROGRAMMING_RETENTION_ACK', 'dedicated-project-reset')
    vi.stubEnv('E2E_TRAINER_INSIGHTS_ENABLED', 'true')
    vi.stubEnv('E2E_TRAINER_SECURITY_ENABLED', 'true')
    vi.stubEnv('E2E_TRAINER_MARKETPLACE_ENABLED', 'true')
    vi.stubEnv('COMMUNITY_ENABLED', 'false')
    vi.stubEnv('TRAINER_PAYMENTS_ENABLED', 'false')
    vi.stubEnv('TRAINER_MESSAGING_ENABLED', 'false')
    vi.stubEnv('TRAINER_REVIEWS_ENABLED', 'false')
  })
  afterEach(() => vi.unstubAllEnvs())

  function arrange(profile: { is_admin: boolean; account_status: string }) {
    const user = {
      id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      email: 'e2e-admin@example.test',
      user_metadata: { e2e_run_id: 'admin-boundary-run', trainer_relationship_role: 'admin' },
    }
    createAuthClient.mockResolvedValue({ auth: { getUser: vi.fn().mockResolvedValue({ data: { user } }) } } as never)
    const maybeSingle = vi.fn().mockResolvedValue({ data: profile, error: null })
    const service = { from: vi.fn(() => ({ select: vi.fn(() => ({ eq: vi.fn(() => ({ maybeSingle })) })) })) }
    createService.mockReturnValue(service as never)
    return { user, service }
  }

  it('admits a real active database admin only for the explicit non-production marketplace run', async () => {
    const arranged = arrange({ is_admin: true, account_status: 'active' })
    await expect(requireAdminUserContext()).resolves.toEqual(arranged)
  })

  it.each([
    { NODE_ENV: 'production', E2E_TRAINER_SECURITY_ENABLED: 'true', E2E_TRAINER_MARKETPLACE_ENABLED: 'true' },
    { NODE_ENV: 'test', E2E_TRAINER_SECURITY_ENABLED: 'false', E2E_TRAINER_MARKETPLACE_ENABLED: 'true' },
    { NODE_ENV: 'test', E2E_TRAINER_SECURITY_ENABLED: 'true', E2E_TRAINER_MARKETPLACE_ENABLED: 'false' },
  ] as const)('keeps the owner-only boundary outside the full E2E gate: %j', async env => {
    arrange({ is_admin: true, account_status: 'active' })
    vi.stubEnv('NODE_ENV', env.NODE_ENV)
    vi.stubEnv('E2E_TRAINER_SECURITY_ENABLED', env.E2E_TRAINER_SECURITY_ENABLED)
    vi.stubEnv('E2E_TRAINER_MARKETPLACE_ENABLED', env.E2E_TRAINER_MARKETPLACE_ENABLED)
    await expect(requireAdminUserContext()).rejects.toThrow('REDIRECT:/dashboard')
  })

  it('rejects a non-admin or suspended synthetic account even with the full E2E gate', async () => {
    arrange({ is_admin: false, account_status: 'suspended' })
    await expect(requireAdminUserContext()).rejects.toThrow('REDIRECT:/dashboard')
  })

  it('rejects an admin whose auth marker is not bound to the exact run', async () => {
    const arranged = arrange({ is_admin: true, account_status: 'active' })
    arranged.user.user_metadata.e2e_run_id = 'different-run'
    await expect(requireAdminUserContext()).rejects.toThrow('REDIRECT:/dashboard')
  })

  it.each([
    ['E2E_TRAINER_RELATIONSHIPS_ENABLED', 'false'],
    ['E2E_TRAINER_PROGRAMMING_ENABLED', 'false'],
    ['E2E_TRAINER_PROGRAMMING_RETENTION_ACK', 'disabled'],
    ['E2E_TRAINER_INSIGHTS_ENABLED', 'false'],
    ['COMMUNITY_ENABLED', 'true'],
    ['TRAINER_PAYMENTS_ENABLED', 'true'],
    ['TRAINER_MESSAGING_ENABLED', 'true'],
    ['TRAINER_REVIEWS_ENABLED', 'true'],
    ['STRIPE_SECRET_KEY', 'configured'],
  ])('rejects the synthetic admin when prerequisite %s is %s', async (name, value) => {
    arrange({ is_admin: true, account_status: 'active' })
    vi.stubEnv(name, value)
    await expect(requireAdminUserContext()).rejects.toThrow('REDIRECT:/dashboard')
  })
})
