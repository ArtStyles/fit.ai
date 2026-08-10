import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))
vi.mock('@supabase/supabase-js', () => ({ createClient: vi.fn() }))
vi.mock('@/lib/supabase/service', () => ({ createServiceClient: vi.fn() }))

import { createClient } from '@supabase/supabase-js'
import { createServiceClient } from '@/lib/supabase/service'
import {
  reinstateTrainerThroughAuthenticatedAdmin,
  suspendTrainerThroughAuthenticatedAdmin,
} from '../trainerSecurityAdmin'

const createAuthClientMock = vi.mocked(createClient)
const createServiceClientMock = vi.mocked(createServiceClient)

describe('trainer security authenticated admin boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co'
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-test-key'
  })

  it('does not create a service client when the bearer token is invalid', async () => {
    createAuthClientMock.mockReturnValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: { message: 'invalid' } }) },
    } as never)

    await expect(suspendTrainerThroughAuthenticatedAdmin({
      accessToken: 'invalid-token',
      targetUserId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2',
      reason: 'Security race',
    })).rejects.toThrow('ADMIN_AUTH_REQUIRED')

    expect(createServiceClientMock).not.toHaveBeenCalled()
  })

  it('validates an active admin before invoking the service-only suspension RPC', async () => {
    const adminId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
    const rpc = vi.fn().mockResolvedValue({ data: [{ account_suspended: true }], error: null })
    const maybeSingle = vi.fn().mockResolvedValue({ data: { is_admin: true, account_status: 'active' }, error: null })
    createAuthClientMock.mockReturnValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: adminId } }, error: null }) },
    } as never)
    createServiceClientMock.mockReturnValue({
      from: vi.fn(() => ({ select: vi.fn(() => ({ eq: vi.fn(() => ({ maybeSingle })) })) })),
      rpc,
    } as never)

    await expect(suspendTrainerThroughAuthenticatedAdmin({
      accessToken: 'verified-token',
      targetUserId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2',
      reason: 'Security race',
    })).resolves.toEqual({ accountSuspended: true })

    expect(rpc).toHaveBeenCalledWith('suspend_account_and_professional', {
      p_user_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2',
      p_admin_id: adminId,
      p_reason: 'Security race',
      p_until: null,
    })
  })

  it('reactivates the account and reinstates the profile only after authenticating an active admin', async () => {
    const adminId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
    const targetId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2'
    const rpc = vi.fn().mockResolvedValue({ data: [{ account_reactivated: true, profile_reinstated: true }], error: null })
    const maybeSingle = vi.fn().mockResolvedValue({ data: { is_admin: true, account_status: 'active' }, error: null })
    const from = vi.fn(() => ({ select: vi.fn(() => ({ eq: vi.fn(() => ({ maybeSingle })) })) }))
    createAuthClientMock.mockReturnValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: adminId } }, error: null }) },
    } as never)
    createServiceClientMock.mockReturnValue({ from, rpc } as never)

    await expect(reinstateTrainerThroughAuthenticatedAdmin({
      accessToken: 'verified-token',
      targetUserId: targetId,
    })).resolves.toEqual({ accountReactivated: true, profileReinstated: true })

    expect(rpc).toHaveBeenCalledWith('reactivate_and_reinstate_trainer', {
      p_user_id: targetId,
      p_admin_id: adminId,
    })
  })
})
