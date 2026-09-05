import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  requireAppUserContext: vi.fn(),
  getWorkoutStartAccess: vi.fn(),
}))

vi.mock('@/lib/auth/server', () => ({
  requireAppUserContext: mocks.requireAppUserContext,
}))

vi.mock('@/lib/workouts/access', () => ({
  getWorkoutStartAccess: mocks.getWorkoutStartAccess,
}))

vi.mock('@/lib/features/community', () => ({
  isCommunityEnabled: () => false,
}))

vi.mock('../SessionClient', () => ({
  SessionClient: ({ prescriptionLocked }: { prescriptionLocked: boolean }) => (
    <div data-session-client data-prescription-locked={String(prescriptionLocked)} />
  ),
}))

import SessionPage from '../page'

function createSupabase(planLookup: { data: unknown; error: unknown }) {
  return {
    from: vi.fn((table: string) => {
      if (table === 'workout_exercises') {
        return {
          select: () => ({
            eq: () => ({
              order: () => Promise.resolve({ data: [] }),
            }),
          }),
        }
      }

      if (table === 'exercises') {
        return {
          select: () => ({
            eq: () => ({
              order: () => ({
                limit: () => Promise.resolve({ data: [] }),
              }),
            }),
          }),
        }
      }

      if (table === 'progress_logs') {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                order: () => ({
                  limit: () => ({
                    maybeSingle: () => Promise.resolve({ data: null }),
                  }),
                }),
              }),
            }),
          }),
        }
      }

      if (table === 'workout_plans') {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                maybeSingle: () => Promise.resolve(planLookup),
              }),
            }),
          }),
        }
      }

      throw new Error(`Unexpected table: ${table}`)
    }),
  }
}

describe('session page plan prescription lookup', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it.each([
    ['the lookup fails', { data: { prescription_locked: false }, error: { message: 'lookup failed' } }],
    ['the plan row is absent', { data: null, error: null }],
    ['the lock value is absent', { data: { prescription_locked: null }, error: null }],
  ])('fails closed when a workout has a plan and %s', async (_case, planLookup) => {
    const supabase = createSupabase(planLookup)
    mocks.requireAppUserContext.mockResolvedValue({
      supabase,
      user: { id: 'user-1' },
      profile: { language: 'es', timezone: 'America/Havana' },
    })
    mocks.getWorkoutStartAccess.mockResolvedValue({
      allowed: true,
      workout: {
        id: 'workout-1',
        plan_id: 'plan-1',
        name: 'Rutina profesional',
        estimated_duration_minutes: 45,
      },
    })

    const html = renderToStaticMarkup(await SessionPage({ params: { workoutId: 'workout-1' } }))

    expect(html).toContain('role="alert"')
    expect(html).toContain('No pudimos verificar las indicaciones de esta rutina')
    expect(html).not.toContain('data-session-client')
  })

  it('keeps the personal workout flow when there is no plan', async () => {
    const supabase = createSupabase({ data: null, error: null })
    mocks.requireAppUserContext.mockResolvedValue({
      supabase,
      user: { id: 'user-1' },
      profile: { language: 'es', timezone: 'America/Havana' },
    })
    mocks.getWorkoutStartAccess.mockResolvedValue({
      allowed: true,
      workout: {
        id: 'workout-1',
        plan_id: null,
        name: 'Rutina personal',
        estimated_duration_minutes: 30,
      },
    })

    const html = renderToStaticMarkup(await SessionPage({ params: { workoutId: 'workout-1' } }))

    expect(html).toContain('data-session-client')
    expect(html).toContain('data-prescription-locked="false"')
    expect(html).not.toContain('role="alert"')
    expect(supabase.from).not.toHaveBeenCalledWith('workout_plans')
  })
})
