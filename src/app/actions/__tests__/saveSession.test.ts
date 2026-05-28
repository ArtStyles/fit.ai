import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import { createClient } from '@/lib/supabase/server'
import { saveSession, type SaveSessionPayload } from '../saveSession'

const createClientMock = createClient as unknown as Mock

function query(result: { data: unknown; error?: unknown }) {
  const builder: Record<string, unknown> = {
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    gte: vi.fn(() => builder),
    lt: vi.fn(() => builder),
    limit: vi.fn(() => builder),
    maybeSingle: vi.fn(() => Promise.resolve(result)),
    single: vi.fn(() => Promise.resolve(result)),
    insert: vi.fn(() => builder),
    then: (
      resolve: (value: { data: unknown; error?: unknown }) => unknown,
      reject: (reason: unknown) => unknown,
    ) => Promise.resolve(result).then(resolve, reject),
  }

  return builder
}

function createSupabaseMock(results: Record<string, { data: unknown; error?: unknown }[]>) {
  const queues = Object.fromEntries(
    Object.entries(results).map(([table, queue]) => [table, [...queue]]),
  )

  return {
    auth: {
      getUser: vi.fn(() => Promise.resolve({
        data: { user: { id: 'user-1' } },
      })),
    },
    from: vi.fn((table: string) => query(queues[table]?.shift() ?? { data: null })),
  }
}

const payload: SaveSessionPayload = {
  workoutId: 'workout-1',
  startedAt: Date.parse('2026-05-27T15:30:00.000Z'),
  finishedAt: Date.parse('2026-05-27T16:00:00.000Z'),
  moodRating: null,
  exercises: [],
}

const workout = {
  id: 'workout-1',
  name: 'Piernas',
  estimated_duration_minutes: 60,
  focus: 'Lower body',
  day_of_week: 3,
  plan_id: 'plan-1',
}

describe('saveSession access guard', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-05-27T16:00:00.000Z'))
    createClientMock.mockReset()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('rejects unauthenticated users', async () => {
    createClientMock.mockResolvedValue({
      auth: {
        getUser: vi.fn(() => Promise.resolve({ data: { user: null } })),
      },
    })

    await expect(saveSession(payload)).resolves.toMatchObject({
      success: false,
      error: 'No autenticado',
    })
  })

  it('rejects workouts that are not scheduled for today', async () => {
    createClientMock.mockResolvedValue(createSupabaseMock({
      workouts: [{ data: { ...workout, day_of_week: 2 } }],
    }))

    await expect(saveSession(payload)).resolves.toMatchObject({
      success: false,
      error: 'Solo puedes registrar la rutina programada para hoy.',
    })
  })

  it('rejects workouts from inactive plans', async () => {
    createClientMock.mockResolvedValue(createSupabaseMock({
      workouts: [{ data: workout }],
      workout_plans: [{ data: null }],
    }))

    await expect(saveSession(payload)).resolves.toMatchObject({
      success: false,
      error: 'Solo puedes registrar la rutina programada para hoy.',
    })
  })

  it('rejects duplicate completions for the same workout day', async () => {
    createClientMock.mockResolvedValue(createSupabaseMock({
      workouts: [{ data: workout }],
      workout_plans: [{ data: { id: 'plan-1' } }],
      progress_logs: [{ data: [{ id: 'log-1' }] }],
    }))

    await expect(saveSession(payload)).resolves.toMatchObject({
      success: false,
      error: 'Esta rutina ya fue completada hoy.',
    })
  })
})
