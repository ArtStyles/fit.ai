import { describe, expect, it } from 'vitest'
import { getPlanCreatePolicy } from '../entitlements'

function supabaseMock(tier: 'free' | 'pro' | null, planCount: number) {
  return {
    from(table: string) {
      if (table === 'profiles') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: { subscription_tier: tier } }),
            }),
          }),
        }
      }

      if (table === 'workout_plans') {
        return {
          select: () => ({
            eq: async () => ({ count: planCount }),
          }),
        }
      }

      throw new Error(`Unexpected table ${table}`)
    },
  }
}

describe('getPlanCreatePolicy', () => {
  it('allows free users with no saved plans', async () => {
    await expect(getPlanCreatePolicy(supabaseMock('free', 0) as never, 'u1')).resolves.toMatchObject({
      allowed: true,
      tier: 'free',
      replacingExisting: false,
    })
  })

  it('blocks free users when a saved plan already exists', async () => {
    await expect(getPlanCreatePolicy(supabaseMock('free', 1) as never, 'u1')).resolves.toMatchObject({
      allowed: false,
      tier: 'free',
      planCount: 1,
    })
  })

  it('allows free users to replace their existing plan explicitly', async () => {
    await expect(
      getPlanCreatePolicy(supabaseMock('free', 1) as never, 'u1', { replaceExistingForFree: true }),
    ).resolves.toMatchObject({
      allowed: true,
      tier: 'free',
      replacingExisting: true,
    })
  })

  it('allows pro users with multiple saved plans', async () => {
    await expect(getPlanCreatePolicy(supabaseMock('pro', 12) as never, 'u1')).resolves.toMatchObject({
      allowed: true,
      tier: 'pro',
      replacingExisting: false,
    })
  })
})
