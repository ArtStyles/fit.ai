import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import { createClient } from '@/lib/supabase/server'
import { parseSessionResultSnapshot } from '@/lib/session/resultSnapshot'
import { saveSession, type SaveSessionPayload } from '../saveSession'

const createClientMock = createClient as unknown as Mock

function query(result: { data: unknown; error?: unknown }) {
  const builder: Record<string, unknown> = {
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    in: vi.fn(() => builder),
    neq: vi.fn(() => builder),
    not: vi.fn(() => builder),
    gte: vi.fn(() => builder),
    lt: vi.fn(() => builder),
    limit: vi.fn(() => builder),
    order: vi.fn(() => builder),
    maybeSingle: vi.fn(() => Promise.resolve(result)),
    single: vi.fn(() => Promise.resolve(result)),
    insert: vi.fn(() => builder),
    update: vi.fn(() => builder),
    delete: vi.fn(() => builder),
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
    rpc: vi.fn(() => Promise.resolve({
      data: null,
      error: {
        code: 'PGRST202',
        message: 'Could not find the function public.save_session_log_atomic_v2 in the schema cache',
      },
    })),
  }
}

function missingAtomicRpcs() {
  return vi.fn((rpcName: string) => Promise.resolve({
    data: null,
    error: {
      code: 'PGRST202',
      message: `Could not find the function public.${rpcName} in the schema cache`,
    },
  }))
}

const payload: SaveSessionPayload = {
  clientSessionId: '11111111-1111-4111-8111-111111111111',
  workoutId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  startedAt: Date.parse('2026-05-27T15:30:00.000Z'),
  finishedAt: Date.parse('2026-05-27T16:00:00.000Z'),
  moodRating: null,
  exercises: [],
}

const fallbackPayload: SaveSessionPayload = {
  ...payload,
  exercises: [{
    workoutExerciseId: 'session-exercise',
    exerciseId: '22222222-2222-4222-8222-222222222222',
    name: 'Press Banca',
    isCompound: false,
    targetSets: 1,
    targetReps: 8,
    targetRpe: 7,
    source: 'ad_hoc',
    sets: [{ weightKg: '10', reps: '8', rpe: 7, completed: true }],
    status: 'completed',
  }],
}

const winnerId = '55555555-5555-4555-8555-555555555555'
const winnerCompletedAt = '2026-05-27T16:00:00.000Z'

function historicalRow({
  id,
  completedAt,
  weightKg,
}: {
  id: string
  completedAt: string
  weightKg: number
}) {
  return {
    exercise_id: fallbackPayload.exercises[0].exerciseId,
    weights_kg: [weightKg],
    reps_completed: [8],
    progress_log_id: id,
    progress_logs: { user_id: 'user-1', completed_at: completedAt },
  }
}

const storedSnapshot = {
  version: 1,
  prs: [{ exerciseName: 'Press Banca', weightKg: 80, kind: 'weight' as const }],
  progressions: [{
    exerciseId: 'exercise-1',
    exerciseName: 'Press Banca',
    progressionType: 'weight' as const,
    currentWeightKg: 80,
    nextWeightKg: 82.5,
    currentTargetReps: null,
    nextTargetReps: null,
    action: 'increase' as const,
    reason: 'Completaste el objetivo.',
    confidence: 'high' as const,
  }],
}

function successfulSaveMock({
  existingId = null,
  rpcData = [{ progress_log_id: 'log-new', inserted: true, result_snapshot: storedSnapshot }],
  rpcError = null,
}: {
  existingId?: string | null
  rpcData?: Array<{ progress_log_id: string; inserted: boolean; result_snapshot: unknown }> | null
  rpcError?: { code?: string | null; message: string } | null
} = {}) {
  const supabase: any = createSupabaseMock({
    progress_logs: existingId
      ? [{ data: {
          id: existingId,
          workout_id: payload.workoutId,
          session_result_snapshot: storedSnapshot,
        } }]
      : [{ data: null }, { data: [] }, { data: [] }],
    profiles: [{ data: { timezone: 'UTC' } }],
    workouts: [{ data: workout }],
    workout_plans: [{ data: { id: 'plan-1' } }],
  }) as any
  supabase.rpc = vi.fn(() => Promise.resolve({ data: rpcData, error: rpcError }))
  return supabase
}

const workout = {
  id: payload.workoutId,
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

  it('validates a stored presentation snapshot', () => {
    expect(parseSessionResultSnapshot(storedSnapshot)).toEqual(storedSnapshot)
    expect(parseSessionResultSnapshot({ version: 1, prs: 'bad', progressions: [] })).toBeNull()
  })

  it('returns the stored presentation snapshot for the normal winner', async () => {
    const supabase = successfulSaveMock()
    createClientMock.mockResolvedValue(supabase)

    await expect(saveSession(payload)).resolves.toMatchObject({
      success: true,
      progressLogId: 'log-new',
      prs: storedSnapshot.prs,
      progressions: storedSnapshot.progressions,
    })
    expect(supabase.rpc).toHaveBeenCalledWith('save_session_log_atomic_v2', expect.objectContaining({
      p_result_snapshot: { version: 1, prs: [], progressions: [] },
    }))
  })

  it('saves an authorized session after its source plan is no longer active', async () => {
    const supabase: any = createSupabaseMock({
      progress_logs: [{ data: null }],
    })
    supabase.rpc = vi.fn(() => Promise.resolve({
      data: [{ progress_log_id: 'log-authorized', inserted: true, result_snapshot: storedSnapshot }],
      error: null,
    }))
    createClientMock.mockResolvedValue(supabase)

    await expect(saveSession(payload)).resolves.toMatchObject({
      success: true,
      progressLogId: 'log-authorized',
    })
    expect(supabase.rpc).toHaveBeenCalledWith('save_session_log_atomic_v2', expect.objectContaining({
      p_client_session_id: payload.clientSessionId,
      p_workout_id: payload.workoutId,
    }))
    expect(supabase.from).not.toHaveBeenCalledWith('profiles')
    expect(supabase.from).not.toHaveBeenCalledWith('workout_plans')
  })

  it('fails closed when v2 rejects an unclaimed session', async () => {
    const supabase: any = createSupabaseMock({
      progress_logs: [{ data: null }],
    })
    supabase.rpc = vi.fn(() => Promise.resolve({
      data: null,
      error: { message: 'SESSION_AUTHORIZATION_REQUIRED' },
    }))
    createClientMock.mockResolvedValue(supabase)

    await expect(saveSession(payload)).resolves.toMatchObject({
      success: false,
      progressLogId: null,
      error: 'SESSION_AUTHORIZATION_REQUIRED',
    })
    expect(supabase.rpc).toHaveBeenCalledTimes(1)
    expect(supabase.rpc).toHaveBeenCalledWith('save_session_log_atomic_v2', expect.any(Object))
    expect(supabase.from).not.toHaveBeenCalledWith('workout_plans')
  })

  it('returns the existing completed log on a lost-response retry without replaying side effects', async () => {
    const supabase = successfulSaveMock({ existingId: 'log-existing' })
    createClientMock.mockResolvedValue(supabase)

    await expect(saveSession(payload)).resolves.toMatchObject({
      success: true,
      progressLogId: 'log-existing',
      prs: storedSnapshot.prs,
      progressions: storedSnapshot.progressions,
    })
    expect(supabase.rpc).not.toHaveBeenCalled()
  })

  it.each([null, 'workout-other'])(
    'rejects an existing client session bound to workout %s',
    async existingWorkoutId => {
      const supabase: any = createSupabaseMock({
        progress_logs: [{
          data: {
            id: 'log-existing',
            workout_id: existingWorkoutId,
            session_result_snapshot: storedSnapshot,
          },
        }],
      })
      createClientMock.mockResolvedValue(supabase)

      await expect(saveSession(payload)).resolves.toMatchObject({
        success: false,
        progressLogId: null,
        error: expect.stringContaining('otro entrenamiento'),
      })
      expect(supabase.rpc).not.toHaveBeenCalled()
    },
  )

  it('rejects a non-UUID workout before reading progress', async () => {
    const supabase = createSupabaseMock({})
    createClientMock.mockResolvedValue(supabase)

    await expect(saveSession({ ...payload, workoutId: 'workout-invalid' })).resolves.toMatchObject({
      success: false,
      progressLogId: null,
      error: 'Identificador de sesión inválido',
    })
    expect(supabase.from).not.toHaveBeenCalled()
  })

  it('does not treat a different missing RPC name as the v2 rollout signal', async () => {
    const supabase: any = createSupabaseMock({ progress_logs: [{ data: null }] })
    supabase.rpc = vi.fn(() => Promise.resolve({
      data: null,
      error: {
        code: 'PGRST202',
        message: 'Could not find the function public.save_session_log_atomic in the schema cache',
      },
    }))
    createClientMock.mockResolvedValue(supabase)

    await expect(saveSession(payload)).resolves.toMatchObject({ success: false })
    expect(supabase.rpc).toHaveBeenCalledTimes(1)
    expect(supabase.from).not.toHaveBeenCalledWith('profiles')
  })

  it('does not fall back when a v2 error mentions the function without PGRST202', async () => {
    const supabase: any = createSupabaseMock({ progress_logs: [{ data: null }] })
    supabase.rpc = vi.fn(() => Promise.resolve({
      data: null,
      error: {
        code: '42501',
        message: 'permission denied for function public.save_session_log_atomic_v2',
      },
    }))
    createClientMock.mockResolvedValue(supabase)

    await expect(saveSession(payload)).resolves.toMatchObject({ success: false })
    expect(supabase.rpc).toHaveBeenCalledTimes(1)
    expect(supabase.from).not.toHaveBeenCalledWith('profiles')
  })

  it('applies progression side effects only for the original winner', async () => {
    const winner: any = createSupabaseMock({
      progress_logs: [{ data: null }, { data: [] }, { data: [] }],
      profiles: [{ data: { timezone: 'UTC' } }],
      workouts: [
        { data: { plan_id: 'plan-1' } },
        { data: [{ id: 'workout-1' }] },
      ],
      workout_plans: [{ data: { id: 'plan-1' } }],
      workout_exercises: [{ data: null, error: null }],
    })
    winner.rpc = vi.fn(() => Promise.resolve({
      data: [{ progress_log_id: 'log-new', inserted: true, result_snapshot: storedSnapshot }],
      error: null,
    }))
    const retried = successfulSaveMock({ existingId: 'log-new' })
    createClientMock.mockResolvedValueOnce(winner).mockResolvedValueOnce(retried)

    await expect(saveSession(payload)).resolves.toMatchObject({ success: true })
    await expect(saveSession(payload)).resolves.toMatchObject({ success: true })

    expect(winner.from.mock.calls.filter(([table]: [string]) => table === 'workout_exercises')).toHaveLength(1)
    expect(retried.from).not.toHaveBeenCalledWith('workout_exercises')
  })

  it('returns the winner of a duplicate-constraint race without a second detail insert', async () => {
    const supabase = successfulSaveMock({
      rpcData: [{ progress_log_id: 'log-winner', inserted: false, result_snapshot: storedSnapshot }],
    })
    createClientMock.mockResolvedValue(supabase)

    await expect(saveSession(payload)).resolves.toMatchObject({
      success: true,
      progressLogId: 'log-winner',
      prs: storedSnapshot.prs,
      progressions: storedSnapshot.progressions,
    })
    expect(supabase.rpc).toHaveBeenCalledTimes(1)
    expect(supabase.from).not.toHaveBeenCalledWith('exercise_logs')
  })

  it('reconstructs an invalid duplicate-race snapshot from history strictly before the winner', async () => {
    const supabase: any = createSupabaseMock({
      progress_logs: [
        { data: null },
        { data: { id: winnerId, completed_at: winnerCompletedAt, session_result_snapshot: null } },
        { data: null, error: null },
      ],
      profiles: [{ data: { timezone: 'UTC' } }],
      workouts: [{ data: workout }],
      workout_plans: [{ data: { id: 'plan-1' } }],
      exercise_logs: [
        { data: [] },
        { data: [
          historicalRow({
            id: '11111111-1111-4111-8111-111111111111',
            completedAt: '2026-05-27T15:00:00.000Z',
            weightKg: 8,
          }),
          historicalRow({ id: winnerId, completedAt: winnerCompletedAt, weightKg: 10 }),
          historicalRow({
            id: '88888888-8888-4888-8888-888888888888',
            completedAt: winnerCompletedAt,
            weightKg: 20,
          }),
          historicalRow({
            id: '99999999-9999-4999-8999-999999999999',
            completedAt: '2026-05-28T16:00:00.000Z',
            weightKg: 30,
          }),
        ] },
      ],
    })
    supabase.rpc = vi.fn(() => Promise.resolve({
      data: [{ progress_log_id: winnerId, inserted: false, result_snapshot: null }],
      error: null,
    }))
    createClientMock.mockResolvedValue(supabase)

    await expect(saveSession(fallbackPayload)).resolves.toMatchObject({
      success: true,
      progressLogId: winnerId,
      prs: [{ exerciseName: 'Press Banca', weightKg: 10, kind: 'weight' }],
    })

    const historyQuery = supabase.from.mock.results
      .filter((_: unknown, index: number) => supabase.from.mock.calls[index][0] === 'exercise_logs')
      .at(-1).value
    expect(historyQuery.lt).toHaveBeenCalledWith('progress_logs.completed_at', winnerCompletedAt)
    expect(historyQuery.neq).toHaveBeenCalledWith('progress_log_id', winnerId)

    const backfillQuery = supabase.from.mock.results
      .filter((_: unknown, index: number) => supabase.from.mock.calls[index][0] === 'progress_logs')
      .at(-1).value
    expect(backfillQuery.update).toHaveBeenCalledWith(expect.objectContaining({
      session_result_snapshot: expect.objectContaining({ version: 1 }),
    }))
    expect(backfillQuery.eq).toHaveBeenCalledWith('id', winnerId)
    expect(backfillQuery.eq).toHaveBeenCalledWith('user_id', 'user-1')
    expect(backfillQuery.eq).toHaveBeenCalledWith('client_session_id', payload.clientSessionId)
    expect(supabase.from).not.toHaveBeenCalledWith('workout_exercises')
  })

  it.each([
    ['missing', null],
    ['invalid', { version: 1, prs: 'bad', progressions: [] }],
  ])('reconstructs and backfills %s results using only history strictly before the winner', async (_label, resultSnapshot) => {
    const supabase: any = createSupabaseMock({
      progress_logs: [
        { data: {
          id: winnerId,
          workout_id: payload.workoutId,
          session_result_snapshot: resultSnapshot,
        } },
        { data: { id: winnerId, completed_at: winnerCompletedAt, session_result_snapshot: resultSnapshot } },
        { data: null, error: null },
      ],
      exercise_logs: [{ data: [
        historicalRow({
          id: '11111111-1111-4111-8111-111111111111',
          completedAt: '2026-05-27T15:00:00.000Z',
          weightKg: 8,
        }),
        historicalRow({ id: winnerId, completedAt: winnerCompletedAt, weightKg: 10 }),
        historicalRow({
          id: '88888888-8888-4888-8888-888888888888',
          completedAt: winnerCompletedAt,
          weightKg: 20,
        }),
        historicalRow({
          id: '99999999-9999-4999-8999-999999999999',
          completedAt: '2026-05-28T16:00:00.000Z',
          weightKg: 30,
        }),
      ] }],
    })
    createClientMock.mockResolvedValue(supabase)

    const result = await saveSession(fallbackPayload)
    expect(result).toMatchObject({
      success: true,
      progressLogId: winnerId,
      prs: [{ exerciseName: 'Press Banca', weightKg: 10, kind: 'weight' }],
    })
    expect(result.progressions).toHaveLength(1)

    const historyQuery = supabase.from.mock.results[2].value
    expect(historyQuery.lt).toHaveBeenCalledWith('progress_logs.completed_at', winnerCompletedAt)
    expect(historyQuery.neq).toHaveBeenCalledWith('progress_log_id', winnerId)

    const ownerQuery = supabase.from.mock.results[1].value
    expect(ownerQuery.eq).toHaveBeenCalledWith('id', winnerId)
    expect(ownerQuery.eq).toHaveBeenCalledWith('user_id', 'user-1')
    expect(ownerQuery.eq).toHaveBeenCalledWith('client_session_id', payload.clientSessionId)

    const backfillQuery = supabase.from.mock.results[3].value
    expect(backfillQuery.update).toHaveBeenCalledWith(expect.objectContaining({
      session_result_snapshot: expect.objectContaining({ version: 1 }),
    }))
    expect(backfillQuery.eq).toHaveBeenCalledWith('id', winnerId)
    expect(backfillQuery.eq).toHaveBeenCalledWith('user_id', 'user-1')
    expect(backfillQuery.eq).toHaveBeenCalledWith('client_session_id', payload.clientSessionId)
    expect(supabase.from).not.toHaveBeenCalledWith('workouts')
    expect(supabase.from).not.toHaveBeenCalledWith('workout_exercises')
  })

  it.each([null, 'not-a-date'])('fails closed when the authoritative timestamp is %s', async completedAt => {
    const supabase: any = createSupabaseMock({
      progress_logs: [
        { data: {
          id: winnerId,
          workout_id: payload.workoutId,
          session_result_snapshot: null,
        } },
        { data: { id: winnerId, completed_at: completedAt, session_result_snapshot: null } },
      ],
    })
    createClientMock.mockResolvedValue(supabase)

    await expect(saveSession(fallbackPayload)).resolves.toMatchObject({
      success: false,
      progressLogId: null,
      error: expect.stringContaining('resultado'),
    })
    expect(supabase.from).not.toHaveBeenCalledWith('exercise_logs')
    expect(supabase.from.mock.calls.filter(([table]: [string]) => table === 'progress_logs')).toHaveLength(2)
  })

  it('uses an atomic boundary so a detail failure can retry the same idempotency key', async () => {
    const failed = successfulSaveMock({ rpcData: null, rpcError: { message: 'detail rejected' } })
    const retried = successfulSaveMock()
    createClientMock.mockResolvedValueOnce(failed).mockResolvedValueOnce(retried)

    await expect(saveSession(payload)).resolves.toMatchObject({ success: false, error: 'detail rejected' })
    await expect(saveSession(payload)).resolves.toMatchObject({ success: true, progressLogId: 'log-new' })
    expect(failed.rpc).toHaveBeenCalledWith('save_session_log_atomic_v2', expect.objectContaining({
      p_client_session_id: payload.clientSessionId,
    }))
    expect(retried.rpc).toHaveBeenCalledTimes(1)
  })

  it('falls back to direct idempotent inserts when the atomic RPC is not deployed', async () => {
    const supabase: any = createSupabaseMock({
      progress_logs: [
        { data: null },
        { data: [] },
        { data: [] },
        { data: { id: 'log-new', session_result_snapshot: storedSnapshot } },
      ],
      profiles: [{ data: { timezone: 'UTC' } }],
      workouts: [
        { data: workout },
        { data: { plan_id: 'plan-1' } },
        { data: [{ id: 'workout-1' }] },
      ],
      workout_plans: [
        { data: { id: 'plan-1' } },
        { data: { id: 'plan-1' } },
      ],
      exercise_logs: [
        { data: [] },
        { data: null, error: null },
      ],
      workout_exercises: [{ data: null, error: null }],
    })
    supabase.rpc = missingAtomicRpcs()
    createClientMock.mockResolvedValue(supabase)

    await expect(saveSession(fallbackPayload)).resolves.toMatchObject({
      success: true,
      progressLogId: 'log-new',
      prs: storedSnapshot.prs,
      progressions: storedSnapshot.progressions,
    })
    expect(supabase.rpc).toHaveBeenCalledWith('save_session_log_atomic', expect.objectContaining({
      p_client_session_id: payload.clientSessionId,
    }))
    expect(supabase.from).toHaveBeenCalledWith('progress_logs')
    expect(supabase.from).toHaveBeenCalledWith('exercise_logs')
  })

  it('writes immutable session context with a direct fallback insert', async () => {
    const emptyResultSnapshot = { version: 1, prs: [], progressions: [] }
    const supabase: any = createSupabaseMock({
      progress_logs: [
        { data: null },
        { data: [] },
        { data: [] },
        { data: { id: 'log-context', session_result_snapshot: emptyResultSnapshot }, error: null },
      ],
      profiles: [{ data: { timezone: 'UTC' } }],
      workouts: [
        { data: workout },
        { data: {
          id: '11111111-1111-4111-8111-111111111111',
          name: 'Piernas',
          focus: 'Lower body',
          day_of_week: 3,
          plan: {
            id: '22222222-2222-4222-8222-222222222222',
            family_id: '33333333-3333-4333-8333-333333333333',
            name: 'Strength block',
            week_number: 2,
          },
        } },
      ],
      workout_plans: [{ data: { id: 'plan-1' } }],
      workout_exercises: [{ data: [{
        exercise_id: '44444444-4444-4444-8444-444444444444',
        order_index: 0,
        exercise: {
          name: 'Back squat',
          name_es: 'Sentadilla trasera',
          muscle_groups: ['quadriceps'],
          muscle_groups_es: ['cuádriceps'],
          is_compound: true,
        },
      }] }],
    })
    supabase.rpc = missingAtomicRpcs()
    createClientMock.mockResolvedValue(supabase)

    await expect(saveSession(payload)).resolves.toMatchObject({
      success: true,
      progressLogId: 'log-context',
    })

    const progressQueries = supabase.from.mock.results
      .filter((_: unknown, index: number) => supabase.from.mock.calls[index][0] === 'progress_logs')
      .map((result: { value: any }) => result.value)
    const insert = progressQueries.at(-1).insert.mock.calls[0][0]

    expect(insert.session_context_snapshot).toEqual({
      version: 1,
      workout: {
        id: '11111111-1111-4111-8111-111111111111',
        name: 'Piernas',
        focus: 'Lower body',
        dayOfWeek: 3,
      },
      plan: {
        id: '22222222-2222-4222-8222-222222222222',
        familyId: '33333333-3333-4333-8333-333333333333',
        name: 'Strength block',
        weekNumber: 2,
      },
      exercises: [{
        exerciseId: '44444444-4444-4444-8444-444444444444',
        name: 'Back squat',
        nameEs: 'Sentadilla trasera',
        muscleGroups: ['quadriceps'],
        muscleGroupsEs: ['cuádriceps'],
        isCompound: true,
      }],
    })
  })

  it.each(['client_session_id', 'session_result_snapshot'])(
    'falls back to a legacy progress log insert when %s is not deployed',
    async missingColumn => {
      const supabase: any = createSupabaseMock({
        progress_logs: [
          { data: null },
          { data: [] },
          { data: [] },
          {
            data: null,
            error: { message: `Could not find the '${missingColumn}' column of 'progress_logs' in the schema cache` },
          },
          { data: { id: 'log-legacy' }, error: null },
        ],
        profiles: [{ data: { timezone: 'UTC' } }],
        workouts: [{ data: workout }],
        workout_plans: [{ data: { id: 'plan-1' } }],
      })
      supabase.rpc = missingAtomicRpcs()
      createClientMock.mockResolvedValue(supabase)

      await expect(saveSession(payload)).resolves.toMatchObject({
        success: true,
        progressLogId: 'log-legacy',
        prs: [],
        progressions: [],
      })

      const progressQueries = supabase.from.mock.results
        .map((result: { value: any }) => result.value)
        .filter((queryBuilder: any) => queryBuilder.insert.mock.calls.length > 0)
      const modernInsert = progressQueries.at(-2).insert.mock.calls[0][0]
      const legacyInsert = progressQueries.at(-1).insert.mock.calls[0][0]

      expect(modernInsert).toHaveProperty('client_session_id', payload.clientSessionId)
      expect(modernInsert).toHaveProperty('session_result_snapshot')
      expect(legacyInsert).not.toHaveProperty('client_session_id')
      expect(legacyInsert).not.toHaveProperty('session_result_snapshot')
      expect(legacyInsert).not.toHaveProperty('session_context_snapshot')
    },
  )

  it('retries without context when only the snapshot column is not deployed', async () => {
    const emptyResultSnapshot = { version: 1, prs: [], progressions: [] }
    const supabase: any = createSupabaseMock({
      progress_logs: [
        { data: null },
        { data: [] },
        { data: [] },
        {
          data: null,
          error: { message: "Could not find the 'session_context_snapshot' column of 'progress_logs' in the schema cache" },
        },
        { data: { id: 'log-without-context', session_result_snapshot: emptyResultSnapshot }, error: null },
      ],
      profiles: [{ data: { timezone: 'UTC' } }],
      workouts: [{ data: workout }],
      workout_plans: [{ data: { id: 'plan-1' } }],
    })
    supabase.rpc = missingAtomicRpcs()
    createClientMock.mockResolvedValue(supabase)

    await expect(saveSession(payload)).resolves.toMatchObject({
      success: true,
      progressLogId: 'log-without-context',
    })

    const progressQueries = supabase.from.mock.results
      .map((result: { value: any }) => result.value)
      .filter((queryBuilder: any) => queryBuilder.insert.mock.calls.length > 0)
    const fullInsert = progressQueries.at(-2).insert.mock.calls[0][0]
    const contextCompatibleInsert = progressQueries.at(-1).insert.mock.calls[0][0]

    expect(fullInsert).toHaveProperty('session_context_snapshot')
    expect(contextCompatibleInsert).toHaveProperty('client_session_id', payload.clientSessionId)
    expect(contextCompatibleInsert).toHaveProperty('session_result_snapshot')
    expect(contextCompatibleInsert).not.toHaveProperty('session_context_snapshot')
  })

  it('rolls back a direct fallback progress log when detail insert fails so retry can persist cleanly', async () => {
    const failed: any = createSupabaseMock({
      progress_logs: [
        { data: null },
        { data: [] },
        { data: [] },
        { data: { id: 'log-partial', session_result_snapshot: storedSnapshot }, error: null },
        { data: null, error: null },
      ],
      profiles: [{ data: { timezone: 'UTC' } }],
      workouts: [{ data: workout }],
      workout_plans: [{ data: { id: 'plan-1' } }],
      exercise_logs: [
        { data: [] },
        { data: null, error: { message: 'detail rejected' } },
      ],
    })
    failed.rpc = missingAtomicRpcs()

    const retried: any = createSupabaseMock({
      progress_logs: [
        { data: null },
        { data: [] },
        { data: [] },
        { data: { id: 'log-retry', session_result_snapshot: storedSnapshot }, error: null },
      ],
      profiles: [{ data: { timezone: 'UTC' } }],
      workouts: [
        { data: workout },
        { data: { plan_id: 'plan-1' } },
        { data: [{ id: 'workout-1' }] },
      ],
      workout_plans: [
        { data: { id: 'plan-1' } },
        { data: { id: 'plan-1' } },
      ],
      exercise_logs: [
        { data: [] },
        { data: null, error: null },
      ],
      workout_exercises: [{ data: null, error: null }],
    })
    retried.rpc = missingAtomicRpcs()
    createClientMock.mockResolvedValueOnce(failed).mockResolvedValueOnce(retried)

    await expect(saveSession(fallbackPayload)).resolves.toMatchObject({
      success: false,
      error: 'detail rejected',
    })
    const rollbackQuery = failed.from.mock.results
      .map((result: { value: any }) => result.value)
      .find((queryBuilder: any) => queryBuilder.delete.mock.calls.length > 0)
    expect(rollbackQuery).toBeDefined()
    expect(rollbackQuery.delete).toHaveBeenCalled()
    expect(rollbackQuery.eq).toHaveBeenCalledWith('id', 'log-partial')
    expect(rollbackQuery.eq).toHaveBeenCalledWith('user_id', 'user-1')

    await expect(saveSession(fallbackPayload)).resolves.toMatchObject({
      success: true,
      progressLogId: 'log-retry',
    })
  })
})
