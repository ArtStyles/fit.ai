import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import { revalidatePath } from 'next/cache'
import { requireAdminUserContext } from '@/lib/auth/admin'

vi.mock('@/lib/auth/admin', () => ({ requireAdminUserContext: vi.fn() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('next/navigation', () => ({ redirect: vi.fn((path: string) => { throw new Error(`REDIRECT:${path}`) }) }))

import { reactivateUser, setUserSubscription, suspendUser } from '../admin'

const requireAdminUserContextMock = requireAdminUserContext as unknown as Mock
const ADMIN_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const TARGET_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2'

function form(values: Record<string, string>): FormData {
  const data = new FormData()
  for (const [key, value] of Object.entries(values)) data.set(key, value)
  return data
}

function serviceForRpc() {
  const rpc = vi.fn().mockResolvedValue({ data: [{ changed: true }], error: null })
  const update = vi.fn()
  const eq = vi.fn().mockResolvedValue({ error: null })
  const insert = vi.fn().mockResolvedValue({ error: null })
  update.mockReturnValue({ eq })
  const service = {
    auth: { admin: { getUserById: vi.fn().mockResolvedValue({ data: { user: { id: TARGET_ID, email: 'member@example.test' } }, error: null }) } },
    rpc,
    from: vi.fn((table: string) => table === 'profiles' ? { update } : { insert }),
  }
  return { service, rpc, update }
}

describe('trainer-aware administrative suspension', () => {
  beforeEach(() => vi.clearAllMocks())

  it('keeps invalid user action input in the user-management route', async () => {
    await expect(setUserSubscription(form({ targetUserId: TARGET_ID, tier: 'enterprise' })))
      .rejects.toThrow('REDIRECT:/admin/users?error=admin_invalid_action')

    await expect(suspendUser(form({ targetUserId: TARGET_ID, reason: 'No', duration: '7' })))
      .rejects.toThrow('REDIRECT:/admin/users?error=admin_suspension_fields')
  })

  it('revalidates the user directory and overview after a subscription change', async () => {
    const { service, rpc } = serviceForRpc()
    requireAdminUserContextMock.mockResolvedValue({ user: { id: ADMIN_ID }, service })

    await expect(setUserSubscription(form({ targetUserId: TARGET_ID, tier: 'pro' })))
      .rejects.toThrow('REDIRECT:/admin/users?notice=admin_pro_granted')

    expect(rpc).toHaveBeenCalledWith('set_subscription_tier_atomic', {
      p_user_id: TARGET_ID,
      p_subscription_tier: 'pro',
    })
    expect(revalidatePath).toHaveBeenCalledWith('/admin/users')
    expect(revalidatePath).toHaveBeenCalledWith('/admin')
  })

  it('uses the atomic suspension RPC instead of a direct profile update', async () => {
    const { service, rpc, update } = serviceForRpc()
    requireAdminUserContextMock.mockResolvedValue({ user: { id: ADMIN_ID }, service })

    await expect(suspendUser(form({ targetUserId: TARGET_ID, reason: 'Incumplimiento de normas', duration: '7' })))
      .rejects.toThrow('REDIRECT:/admin/users?notice=admin_user_suspended')

    expect(rpc).toHaveBeenCalledWith('suspend_account_and_professional', expect.objectContaining({
      p_user_id: TARGET_ID,
      p_admin_id: ADMIN_ID,
      p_reason: 'Incumplimiento de normas',
      p_until: expect.any(String),
    }))
    expect(update).not.toHaveBeenCalled()
    expect(revalidatePath).toHaveBeenCalledWith('/admin/users')
    expect(revalidatePath).toHaveBeenCalledWith('/admin')
  })

  it('reactivates only the global account and does not reinstate a trainer profile', async () => {
    const { service, update } = serviceForRpc()
    requireAdminUserContextMock.mockResolvedValue({ user: { id: ADMIN_ID }, service })

    await expect(reactivateUser(form({ targetUserId: TARGET_ID })))
      .rejects.toThrow('REDIRECT:/admin/users?notice=admin_user_reactivated')

    expect(update).toHaveBeenCalledWith({
      account_status: 'active',
      suspension_reason: null,
      suspended_at: null,
      suspended_until: null,
      suspended_by: null,
    })
    expect(service.rpc).not.toHaveBeenCalledWith('reinstate_trainer_profile', expect.anything())
    expect(revalidatePath).toHaveBeenCalledWith('/admin/users')
    expect(revalidatePath).toHaveBeenCalledWith('/admin')
  })
})
