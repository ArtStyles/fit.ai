import { describe, expect, it } from 'vitest'
import { getFreePlanIdsToRemove, getPlanCreatePolicy } from '../entitlements'

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

  it('allows free users with one saved plan', async () => {
    await expect(getPlanCreatePolicy(supabaseMock('free', 1) as never, 'u1')).resolves.toMatchObject({
      allowed: true,
      tier: 'free',
      planCount: 1,
      replacingExisting: false,
    })
  })

  it('blocks free users when two saved plans already exist', async () => {
    await expect(getPlanCreatePolicy(supabaseMock('free', 2) as never, 'u1')).resolves.toMatchObject({
      allowed: false,
      tier: 'free',
      planCount: 2,
    })
  })

  it('allows free users to replace a plan explicitly at the limit', async () => {
    await expect(
      getPlanCreatePolicy(supabaseMock('free', 2) as never, 'u1', { replaceExistingForFree: true }),
    ).resolves.toMatchObject({
      allowed: true,
      tier: 'free',
      replacingExisting: true,
    })
  })

  it('marks regeneration as replacement below the limit', async () => {
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

describe('getFreePlanIdsToRemove', () => {
  const plans = [
    { id: 'old-active', created_at: '2026-01-02T00:00:00.000Z' },
    { id: 'other-plan', created_at: '2026-01-01T00:00:00.000Z' },
    { id: 'new-plan', created_at: '2026-01-03T00:00:00.000Z' },
  ]

  it('removes the replaced plan and preserves the other saved plan', () => {
    expect(getFreePlanIdsToRemove(plans, 'new-plan', 'old-active')).toEqual(['old-active'])
  })

  it('does not remove plans while the account is within the free limit', () => {
    expect(getFreePlanIdsToRemove(plans.slice(0, 2), 'old-active')).toEqual([])
  })

  it('removes a replaced plan even when the resulting count is below the limit', () => {
    expect(getFreePlanIdsToRemove(
      [plans[0], plans[2]],
      'new-plan',
      'old-active',
    )).toEqual(['old-active'])
  })
})
