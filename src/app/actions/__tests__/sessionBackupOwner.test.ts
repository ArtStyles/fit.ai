import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createClient } from '@/lib/supabase/server'
import * as actions from '../authorizeSession'

const workoutId = '22222222-2222-4222-8222-222222222222'
describe('legacy session backup ownership verification', () => {
  beforeEach(() => vi.clearAllMocks())
  it.each([true, false])('returns the account only when the workout belongs to it: %s', async owned => {
    const filters: Record<string, string> = {}
    const query = {
      select: () => query,
      eq: (key: string, value: string) => { filters[key] = value; return query },
      maybeSingle: async () => ({ data: owned && filters.user_id === 'account-a' && filters.id === workoutId ? { id: workoutId } : null, error: null }),
    }
    vi.mocked(createClient).mockResolvedValue({ auth: { getUser: async () => ({ data: { user: { id: 'account-a' } } }) }, from: () => query } as never)
    expect(await actions.verifySessionBackupOwner(workoutId)).toBe(owned ? 'account-a' : null)
  })
  it('rejects malformed identifiers without a database request', async () => {
    expect(await actions.verifySessionBackupOwner('not-a-uuid')).toBeNull()
    expect(createClient).not.toHaveBeenCalled()
  })
})
