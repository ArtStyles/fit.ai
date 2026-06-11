import { describe, expect, it, vi } from 'vitest'
import { getWorkoutStartAccess } from '../access'

const NOW = new Date('2026-05-27T16:00:00.000Z') // miércoles (ISO 3) en America/Havana

function query(result: { data: unknown }) {
  const builder: Record<string, unknown> = {
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    not: vi.fn(() => builder),
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

  it('blocks workouts outside the recovery window', async () => {
    // Domingo (ISO 7) quedó a 3 días; viernes (ISO 5) aún no llega
    for (const dayOfWeek of [7, 5]) {
      const supabase = createSupabaseMock({
        workouts: [{ data: { ...workout, day_of_week: dayOfWeek } }],
      })

      await expect(getWorkoutStartAccess({
        supabase,
        userId: 'user-1',
        workoutId: 'workout-1',
        date: NOW,
      })).resolves.toMatchObject({ allowed: false, reason: 'not_today' })
    }
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
      progress_logs: [{ data: [] }, { data: [] }],
    })

    await expect(getWorkoutStartAccess({
      supabase,
      userId: 'user-1',
      workoutId: 'workout-1',
      date: NOW,
    })).resolves.toMatchObject({
      allowed: true,
      workout,
      window: { status: 'today' },
    })
  })

  it('allows recovering a missed workout within the window', async () => {
    const supabase = createSupabaseMock({
      workouts: [{ data: { ...workout, day_of_week: 1 } }],
      workout_plans: [{ data: { id: 'plan-1' } }],
      progress_logs: [{ data: [] }, { data: [] }],
    })

    await expect(getWorkoutStartAccess({
      supabase,
      userId: 'user-1',
      workoutId: 'workout-1',
      date: NOW,
    })).resolves.toMatchObject({
      allowed: true,
      window: { status: 'recoverable', daysLate: 2, scheduledDate: '2026-05-25' },
    })
  })

  it('blocks recovery when the workout was already logged since its scheduled day', async () => {
    const supabase = createSupabaseMock({
      workouts: [{ data: { ...workout, day_of_week: 2 } }],
      workout_plans: [{ data: { id: 'plan-1' } }],
      progress_logs: [{ data: [{ id: 'log-1' }] }],
    })

    await expect(getWorkoutStartAccess({
      supabase,
      userId: 'user-1',
      workoutId: 'workout-1',
      date: NOW,
    })).resolves.toMatchObject({ allowed: false, reason: 'already_completed' })
  })

  it('enforces one session per day even for recoveries', async () => {
    const supabase = createSupabaseMock({
      workouts: [{ data: { ...workout, day_of_week: 2 } }],
      workout_plans: [{ data: { id: 'plan-1' } }],
      progress_logs: [{ data: [] }, { data: [{ id: 'log-other' }] }],
    })

    await expect(getWorkoutStartAccess({
      supabase,
      userId: 'user-1',
      workoutId: 'workout-1',
      date: NOW,
    })).resolves.toMatchObject({ allowed: false, reason: 'another_session_today' })
  })

  it('enforces one session per day for the workout scheduled today', async () => {
    const supabase = createSupabaseMock({
      workouts: [{ data: workout }],
      workout_plans: [{ data: { id: 'plan-1' } }],
      progress_logs: [{ data: [] }, { data: [{ id: 'log-other' }] }],
    })

    await expect(getWorkoutStartAccess({
      supabase,
      userId: 'user-1',
      workoutId: 'workout-1',
      date: NOW,
    })).resolves.toMatchObject({ allowed: false, reason: 'another_session_today' })
  })

  it('resolves "today" in the user timezone', async () => {
    // 2026-05-28T02:00Z: aún miércoles 27 en La Habana, ya jueves 28 en Madrid
    const lateNight = new Date('2026-05-28T02:00:00.000Z')
    const thursdayWorkout = { ...workout, day_of_week: 4 }

    const inMadrid = createSupabaseMock({
      workouts: [{ data: thursdayWorkout }],
      workout_plans: [{ data: { id: 'plan-1' } }],
      progress_logs: [{ data: [] }, { data: [] }],
    })

    await expect(getWorkoutStartAccess({
      supabase: inMadrid,
      userId: 'user-1',
      workoutId: 'workout-1',
      date: lateNight,
      timeZone: 'Europe/Madrid',
    })).resolves.toMatchObject({ allowed: true, window: { status: 'today' } })

    const inHavana = createSupabaseMock({
      workouts: [{ data: thursdayWorkout }],
    })

    await expect(getWorkoutStartAccess({
      supabase: inHavana,
      userId: 'user-1',
      workoutId: 'workout-1',
      date: lateNight,
      timeZone: 'America/Havana',
    })).resolves.toMatchObject({ allowed: false, reason: 'not_today' })
  })
})
