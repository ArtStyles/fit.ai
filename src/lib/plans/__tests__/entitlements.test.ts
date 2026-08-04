import { describe, expect, it } from 'vitest'
import { getPlanCreatePolicy } from '../entitlements'

type PlanHead = {
  family_id: string
  retired_at: string | null
  superseded_at: string | null
}

function supabaseMock(tier: 'free' | 'pro' | null, planHeads: PlanHead[]) {
  return {
    from(table: string) {
      if (table === 'profiles') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: { subscription_tier: tier }, error: null }),
            }),
          }),
        }
      }

      if (table === 'workout_plans') {
        const filters: Partial<PlanHead> & { user_id?: string } = {}
        const query = {
          eq(column: 'user_id' | 'family_id', value: string) {
            filters[column] = value
            return query
          },
          is(column: 'retired_at' | 'superseded_at', value: null) {
            filters[column] = value
            return query
          },
          then(resolve: (value: { count: number; data: PlanHead[]; error: null }) => unknown) {
            const data = planHeads.filter(plan => (
              (filters.family_id === undefined || plan.family_id === filters.family_id)
              && (filters.retired_at === undefined || plan.retired_at === filters.retired_at)
              && (filters.superseded_at === undefined || plan.superseded_at === filters.superseded_at)
            ))
            return Promise.resolve(resolve({ count: data.length, data, error: null }))
          },
        }

        return { select: () => query }
      }

      throw new Error(`Unexpected table ${table}`)
    },
  }
}

const head = (familyId: string): PlanHead => ({
  family_id: familyId,
  retired_at: null,
  superseded_at: null,
})

describe('getPlanCreatePolicy', () => {
  it('allows free users with fewer than two current families', async () => {
    await expect(
      getPlanCreatePolicy(supabaseMock('free', [head('family-a')]) as never, 'u1'),
    ).resolves.toMatchObject({
      allowed: true,
      tier: 'free',
      planCount: 1,
      replacingExisting: false,
    })
  })

  it('blocks free users when two current non-retired family heads already exist', async () => {
    const rows = [
      head('family-a'),
      head('family-b'),
      { ...head('family-a'), superseded_at: '2026-08-01T00:00:00.000Z' },
      { ...head('family-c'), retired_at: '2026-08-01T00:00:00.000Z' },
    ]

    await expect(
      getPlanCreatePolicy(supabaseMock('free', rows) as never, 'u1'),
    ).resolves.toMatchObject({ allowed: false, tier: 'free', planCount: 2 })
  })

  it('allows a free user to replace an existing family without consuming another slot', async () => {
    const supabase = supabaseMock('free', [head('family-a'), head('family-b')])

    await expect(
      getPlanCreatePolicy(supabase as never, 'u1', { replacingFamilyId: 'family-a' }),
    ).resolves.toMatchObject({
      allowed: true,
      tier: 'free',
      planCount: 2,
      replacingExisting: true,
    })
  })

  it('does not treat an unknown or retired family as a replacement', async () => {
    const supabase = supabaseMock('free', [
      head('family-a'),
      head('family-b'),
      { ...head('retired-family'), retired_at: '2026-08-01T00:00:00.000Z' },
    ])

    await expect(
      getPlanCreatePolicy(supabase as never, 'u1', { replacingFamilyId: 'retired-family' }),
    ).resolves.toMatchObject({ allowed: false, planCount: 2 })
  })

  it('allows pro users with multiple current families', async () => {
    await expect(
      getPlanCreatePolicy(
        supabaseMock('pro', Array.from({ length: 12 }, (_, index) => head(`family-${index}`))) as never,
        'u1',
      ),
    ).resolves.toMatchObject({
      allowed: true,
      tier: 'pro',
      planCount: 12,
      replacingExisting: false,
    })
  })
})
