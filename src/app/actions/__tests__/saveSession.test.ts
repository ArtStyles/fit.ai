import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import { createClient } from '@/lib/supabase/server'
import { saveSession, type SaveSessionPayload } from '../saveSession'

const createClientMock = createClient as unknown as Mock

function query(result: { data: unknown; error?: unknown }) {
  const builder: Record<string, unknown> = {
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    in: vi.fn(() => builder),
    not: vi.fn(() => builder),
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
    rpc: vi.fn(() => Promise.resolve({ data: null, error: { message: 'mock rpc' } })),
  }
}

const payload: SaveSessionPayload = {
  clientSessionId: '11111111-1111-4111-8111-111111111111',
  workoutId: 'workout-1',
  startedAt: Date.parse('2026-05-27T15:30:00.000Z'),
  finishedAt: Date.parse('2026-05-27T16:00:00.000Z'),
  moodRating: null,
  exercises: [],
}

function successfulSaveMock({
  existingId = null,
  rpcData = [{ progress_log_id: 'log-new', inserted: true }],
  rpcError = null,
}: {
  existingId?: string | null
  rpcData?: Array<{ progress_log_id: string; inserted: boolean }> | null
  rpcError?: { message: string } | null
} = {}) {
  const supabase: any = createSupabaseMock({
    progress_logs: existingId
      ? [{ data: { id: existingId } }]
      : [{ data: null }, { data: [] }, { data: [] }],
    profiles: [{ data: { timezone: 'UTC' } }],
    workouts: [{ data: workout }],
    workout_plans: [{ data: { id: 'plan-1' } }],
  }) as any
  supabase.rpc = vi.fn(() => Promise.resolve({ data: rpcData, error: rpcError }))
  return supabase
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

  it('rejects workouts outside the recovery window', async () => {
    // Viernes (ISO 5) todavía no llega con "hoy" = miércoles
    createClientMock.mockResolvedValue(createSupabaseMock({
      progress_logs: [{ data: null }],
      workouts: [{ data: { ...workout, day_of_week: 5 } }],
    }))

    await expect(saveSession(payload)).resolves.toMatchObject({
      success: false,
      error: 'Solo puedes registrar la rutina de hoy o recuperar una sesión perdida reciente.',
    })
  })

  it('rejects workouts from inactive plans', async () => {
    createClientMock.mockResolvedValue(createSupabaseMock({
      progress_logs: [{ data: null }],
      workouts: [{ data: workout }],
      workout_plans: [{ data: null }],
    }))

    await expect(saveSession(payload)).resolves.toMatchObject({
      success: false,
      error: 'Solo puedes registrar la rutina de hoy o recuperar una sesión perdida reciente.',
    })
  })

  it('rejects duplicate completions for the same workout day', async () => {
    createClientMock.mockResolvedValue(createSupabaseMock({
      workouts: [{ data: workout }],
      workout_plans: [{ data: { id: 'plan-1' } }],
      progress_logs: [{ data: null }, { data: [{ id: 'log-1' }] }],
    }))

    await expect(saveSession(payload)).resolves.toMatchObject({
      success: false,
      error: 'Esta rutina ya fue completada hoy.',
    })
  })

  it('rejects recoveries when the workout was already logged since its scheduled day', async () => {
    createClientMock.mockResolvedValue(createSupabaseMock({
      workouts: [{ data: { ...workout, day_of_week: 2 } }],
      workout_plans: [{ data: { id: 'plan-1' } }],
      progress_logs: [{ data: null }, { data: [{ id: 'log-1' }] }],
    }))

    await expect(saveSession(payload)).resolves.toMatchObject({
      success: false,
      error: 'Esta rutina ya fue registrada desde su día programado.',
    })
  })

  it('rejects implausible weights before touching the database', async () => {
    const supabase = createSupabaseMock({})
    createClientMock.mockResolvedValue(supabase)

    await expect(saveSession({
      ...payload,
      exercises: [{
        workoutExerciseId: 'we-1',
        exerciseId: 'ex-1',
        name: 'Press Banca',
        sets: [{ weightKg: '1500', reps: '10', rpe: 7, completed: true }],
        status: 'completed',
      }],
    })).resolves.toMatchObject({
      success: false,
      error: expect.stringContaining('Press Banca'),
    })

    expect(supabase.from).not.toHaveBeenCalledWith('progress_logs')
  })

  it('rejects implausible rep counts', async () => {
    createClientMock.mockResolvedValue(createSupabaseMock({}))

    await expect(saveSession({
      ...payload,
      exercises: [{
        workoutExerciseId: 'we-1',
        exerciseId: 'ex-1',
        name: 'Curl',
        sets: [{ weightKg: '10', reps: '250', rpe: 7, completed: true }],
        status: 'completed',
      }],
    })).resolves.toMatchObject({
      success: false,
      error: expect.stringContaining('Curl'),
    })
  })

  it('ignores implausible values on sets that were not completed', async () => {
    // El set inválido no está completado → la validación no debe dispararlo.
    // El guardado sigue su curso y falla después por mocks vacíos, pero no
    // con el error de validación.
    createClientMock.mockResolvedValue(createSupabaseMock({
      workouts: [{ data: workout }],
      workout_plans: [{ data: { id: 'plan-1' } }],
      progress_logs: [{ data: null }, { data: [] }, { data: [] }],
    }))

    const result = await saveSession({
      ...payload,
      exercises: [{
        workoutExerciseId: 'we-1',
        exerciseId: 'ex-1',
        name: 'Press Banca',
        sets: [{ weightKg: '9999', reps: '10', rpe: 7, completed: false }],
        status: 'completed',
      }],
    })

    expect(result.error).not.toMatch(/Press Banca/)
  })

  it('rejects a second session in the same day', async () => {
    createClientMock.mockResolvedValue(createSupabaseMock({
      workouts: [{ data: workout }],
      workout_plans: [{ data: { id: 'plan-1' } }],
      progress_logs: [{ data: null }, { data: [] }, { data: [{ id: 'log-other' }] }],
    }))

    await expect(saveSession(payload)).resolves.toMatchObject({
      success: false,
      error: 'Ya registraste una sesión hoy. Máximo una sesión por día.',
    })
  })
})

describe('saveSession idempotency', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-05-27T16:00:00.000Z'))
    createClientMock.mockReset()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns the existing completed log on a lost-response retry without replaying side effects', async () => {
    const supabase = successfulSaveMock({ existingId: 'log-existing' })
    createClientMock.mockResolvedValue(supabase)

    await expect(saveSession(payload)).resolves.toMatchObject({
      success: true,
      progressLogId: 'log-existing',
      prs: [],
      progressions: [],
    })
    expect(supabase.rpc).not.toHaveBeenCalled()
  })

  it('returns the winner of a duplicate-constraint race without a second detail insert', async () => {
    const supabase = successfulSaveMock({
      rpcData: [{ progress_log_id: 'log-winner', inserted: false }],
    })
    createClientMock.mockResolvedValue(supabase)

    await expect(saveSession(payload)).resolves.toMatchObject({
      success: true,
      progressLogId: 'log-winner',
    })
    expect(supabase.rpc).toHaveBeenCalledTimes(1)
  })

  it('uses an atomic boundary so a detail failure can retry the same idempotency key', async () => {
    const failed = successfulSaveMock({ rpcData: null, rpcError: { message: 'detail rejected' } })
    const retried = successfulSaveMock()
    createClientMock.mockResolvedValueOnce(failed).mockResolvedValueOnce(retried)

    await expect(saveSession(payload)).resolves.toMatchObject({ success: false, error: 'detail rejected' })
    await expect(saveSession(payload)).resolves.toMatchObject({ success: true, progressLogId: 'log-new' })
    expect(failed.rpc).toHaveBeenCalledWith('save_session_log_atomic', expect.objectContaining({
      p_client_session_id: payload.clientSessionId,
    }))
    expect(retried.rpc).toHaveBeenCalledTimes(1)
  })
})
