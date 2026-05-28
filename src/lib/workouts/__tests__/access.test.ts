import { describe, expect, it, vi } from 'vitest'
import { getWorkoutStartAccess } from '../access'

const NOW = new Date('2026-05-27T16:00:00.000Z')

function query(result: { data: unknown }) {
  const builder: Record<string, unknown> = {
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    gte: vi.fn(() => builder),
    lt: vi.fn(() => builder),
    limit: vi.fn(() => builder),
    maybeSingle: vi.fn(() => Promise.resolve(result)),
    then: (resolve: (value: { data: unknown }) => unknown, reject: (reason: unknown) => unknown) =>
      Promise.resolve(result).then(resolve, reject),
  }

  return builder
}

function createSupabaseMock(results: Record<string, { data: unknown }[]>) {
  const queues = Object.fromEntries(
    Object.entries(results).map(([table, queue]) => [table, [...queue]]),
  )

  return {
    from: vi.fn((table: string) => query(queues[table]?.shift() ?? { data: null })),
  }
}

const workout = {
  id: 'workout-1',
  name: 'Piernas',
  estimated_duration_minutes: 60,
  focus: 'Lower body',
  day_of_week: 3,
  plan_id: 'plan-1',
}

describe('getWorkoutStartAccess()', () => {
  it('returns not_found when the workout does not belong to the user', async () => {
    const supabase = createSupabaseMock({
      workouts: [{ data: null }],
    })

    await expect(getWorkoutStartAccess({
      supabase,
      userId: 'user-1',
      workoutId: 'workout-1',
      date: NOW,
    })).resolves.toEqual({ allowed: false, reason: 'not_found' })
  })

  it('blocks workouts from previous or future days', async () => {
    const supabase = createSupabaseMock({
      workouts: [{ data: { ...workout, day_of_week: 2 } }],
    })

    await expect(getWorkoutStartAccess({
      supabase,
      userId: 'user-1',
      workoutId: 'workout-1',
      date: NOW,
    })).resolves.toMatchObject({ allowed: false, reason: 'not_today' })
  })

  it('blocks workouts outside the active plan', async () => {
    const supabase = createSupabaseMock({
      workouts: [{ data: workout }],
      workout_plans: [{ data: null }],
    })

    await expect(getWorkoutStartAccess({
      supabase,
      userId: 'user-1',
      workoutId: 'workout-1',
      date: NOW,
    })).resolves.toMatchObject({ allowed: false, reason: 'inactive_plan' })
  })

  it('blocks workouts already completed today', async () => {
    const supabase = createSupabaseMock({
      workouts: [{ data: workout }],
      workout_plans: [{ data: { id: 'plan-1' } }],
      progress_logs: [{ data: [{ id: 'log-1' }] }],
    })

    await expect(getWorkoutStartAccess({
      supabase,
      userId: 'user-1',
      workoutId: 'workout-1',
      date: NOW,
    })).resolves.toMatchObject({ allowed: false, reason: 'completed_today' })
  })

  it('allows the active workout scheduled for today', async () => {
    const supabase = createSupabaseMock({
      workouts: [{ data: workout }],
      workout_plans: [{ data: { id: 'plan-1' } }],
      progress_logs: [{ data: [] }],
    })

    await expect(getWorkoutStartAccess({
      supabase,
      userId: 'user-1',
      workoutId: 'workout-1',
      date: NOW,
    })).resolves.toMatchObject({ allowed: true, workout })
  })
})
