import { describe, expect, it, vi } from 'vitest'
import {
  hasActiveCoachingScope,
  type CoachingScopeRpcClient,
} from '@/lib/coaching/permissions'

function rpcClient(result: { data: boolean | null; error: { message: string } | null }): CoachingScopeRpcClient {
  return {
    rpc: async () => result,
  }
}

describe('hasActiveCoachingScope', () => {
  it('returns the database authorization decision without treating null as a grant', async () => {
    await expect(hasActiveCoachingScope(
      'trainer-1',
      'client-1',
      'training_profile',
      rpcClient({ data: true, error: null }),
    )).resolves.toBe(true)

    await expect(hasActiveCoachingScope(
      'trainer-1',
      'client-1',
      'body_measurements',
      rpcClient({ data: null, error: null }),
    )).resolves.toBe(false)
  })

  it('fails closed when the permission RPC returns an error', async () => {
    await expect(hasActiveCoachingScope(
      'trainer-1',
      'client-1',
      'training_profile',
      rpcClient({ data: null, error: { message: 'permission denied' } }),
    )).resolves.toBe(false)
  })

  it('queries the authorization RPC on each invocation without retaining a previous user decision', async () => {
    const rpc = vi.fn()
      .mockResolvedValueOnce({ data: true, error: null })
      .mockResolvedValueOnce({ data: false, error: null })
    const client: CoachingScopeRpcClient = { rpc }

    await expect(hasActiveCoachingScope('trainer-1', 'client-1', 'body_measurements', client)).resolves.toBe(true)
    await expect(hasActiveCoachingScope('trainer-1', 'client-1', 'body_measurements', client)).resolves.toBe(false)
    expect(rpc).toHaveBeenCalledTimes(2)
  })
})
