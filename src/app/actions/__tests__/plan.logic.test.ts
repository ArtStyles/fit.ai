import { describe, it, expect, vi, beforeEach } from 'vitest'
import { orderedIdsToUpdates } from '../plan.logic'
import * as planLogic from '../plan.logic'

const {
  createClient,
  redirect,
  requireEditableOwnedPlan,
  revalidatePath,
  filterExercisesForUser,
  generateEvidencePlan,
  regenerateEvidencePlan,
} = vi.hoisted(() => ({
  createClient: vi.fn(),
  redirect: vi.fn((url: string) => { throw new Error(`REDIRECT:${url}`) }),
  requireEditableOwnedPlan: vi.fn(),
  revalidatePath: vi.fn(),
  filterExercisesForUser: vi.fn(),
  generateEvidencePlan: vi.fn(),
  regenerateEvidencePlan: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({ createClient }))
vi.mock('@/lib/plans/editability', async () => ({
  ...(await vi.importActual<typeof import('@/lib/plans/editability')>('@/lib/plans/editability')),
  requireEditableOwnedPlan,
}))
vi.mock('next/navigation', () => ({ redirect }))
vi.mock('next/cache', () => ({ revalidatePath }))
vi.mock('@/lib/features/community', () => ({ isCommunityEnabled: () => true, communityUnavailableResult: () => ({ ok: false }) }))
vi.mock('@/lib/ai/filter', async () => ({
  ...(await vi.importActual<typeof import('@/lib/ai/filter')>('@/lib/ai/filter')),
  filterExercisesForUser,
}))
vi.mock('@/lib/training-engine', async () => ({
  ...(await vi.importActual<typeof import('@/lib/training-engine')>('@/lib/training-engine')),
  generateEvidencePlan,
  regenerateEvidencePlan,
}))

function lockedClient() {
  const query = (table: string) => {
    const filters: Record<string, unknown> = {}
    const row = table === 'workouts'
      ? { id: 'workout-1', plan_id: 'locked-plan', name: 'Locked workout', focus: null }
      : { id: 'locked-plan', prescription_locked: true, name: 'Locked plan', goal: null, days_per_week: 3, difficulty: null }
    const builder: any = {
      select: () => builder, eq: (key: string, value: unknown) => { filters[key] = value; return builder }, is: () => builder, order: () => builder, limit: () => builder,
      in: () => builder, maybeSingle: async () => ({ data: filters.generation_request_id ? null : row, error: null }), single: async () => ({ data: row, error: null }),
      update: vi.fn(() => builder), insert: vi.fn(() => builder), delete: vi.fn(() => builder),
    }
    return builder
  }
  return {
    auth: { getUser: vi.fn(async () => ({ data: { user: { id: 'locked-client' } } })) },
    rpc: vi.fn(),
    from: vi.fn(query),
  }
}

function lockedInitialGenerationClient() {
  const metrics = {
    generationRequestLookups: 0,
    profileReads: 0,
    exerciseReads: 0,
  }

  const query = (table: string) => {
    const filters: Record<string, unknown> = {}
    const builder: any = {
      select: () => builder,
      eq: (key: string, value: unknown) => { filters[key] = value; return builder },
      is: () => builder,
      order: () => builder,
      limit: () => builder,
      in: () => builder,
      maybeSingle: async () => {
        if (table === 'workout_plans' && filters.generation_request_id) {
          metrics.generationRequestLookups += 1
          return {
            data: { id: 'existing-plan', name: 'Existing', days_per_week: 3, week_number: 1, generation_metadata: {} },
            error: null,
          }
        }
        return {
          data: { id: 'locked-plan', prescription_locked: true, name: 'Locked plan', ai_notes: null, week_number: 1, family_id: 'family-1' },
          error: null,
        }
      },
      single: async () => {
        if (table === 'profiles') metrics.profileReads += 1
        if (table === 'exercises') metrics.exerciseReads += 1
        return { data: null, error: null }
      },
    }
    return builder
  }

  return {
    supabase: {
      auth: { getUser: vi.fn(async () => ({ data: { user: { id: 'locked-client' } } })) },
      rpc: vi.fn(),
      from: vi.fn(query),
    },
    metrics,
  }
}

function data(values: Record<string, string>) {
  const result = new FormData()
  Object.entries(values).forEach(([key, value]) => result.set(key, value))
  return result
}

function editablePlanClient() {
  const from = vi.fn((table: string) => {
    let selection = ''
    const rows = table === 'workout_exercises'
      ? [{ id: 'row-1', order_index: 1 }, { id: 'row-2', order_index: 2 }]
      : []
    const builder: any = {
      data: rows,
      error: null,
      select: vi.fn((value: string) => { selection = value; return builder }),
      eq: vi.fn(() => builder),
      is: vi.fn(() => builder),
      order: vi.fn(() => builder),
      limit: vi.fn(() => builder),
      in: vi.fn(() => builder),
      update: vi.fn(() => builder),
      insert: vi.fn(() => builder),
      delete: vi.fn(() => builder),
      maybeSingle: vi.fn(async () => {
        if (table === 'workouts') return { data: { id: 'workout-1', plan_id: 'plan-1', user_id: 'user-1' }, error: null }
        if (table === 'exercises') return { data: { id: 'exercise-2' }, error: null }
        if (table === 'workout_exercises' && selection === 'order_index') return { data: { order_index: 2 }, error: null }
        if (table === 'workout_exercises') {
          return {
            data: { id: 'row-1', workout_id: 'workout-1', exercise_id: 'exercise-1', order_index: 1, weight_kg: 20 },
            error: null,
          }
        }
        return { data: null, error: null }
      }),
      then: (resolve: (value: { data: unknown[]; error: null }) => unknown, reject: (reason: unknown) => unknown) => (
        Promise.resolve({ data: rows, error: null }).then(resolve, reject)
      ),
    }
    return builder
  })

  return {
    auth: { getUser: vi.fn(async () => ({ data: { user: { id: 'user-1' } } })) },
    rpc: vi.fn(),
    from,
  }
}

function atomicAdjustmentClient(rpcResult: { data: number | null; error: { message: string } | null } = { data: 2, error: null }) {
  let mutationCalls = 0
  const from = vi.fn((table: string) => {
    const rows = table === 'workout_exercises'
      ? [{ id: 'row-1' }, { id: 'row-2' }, { id: 'row-3' }]
      : []
    const builder: any = {
      select: vi.fn(() => builder),
      eq: vi.fn(() => builder),
      order: vi.fn(() => builder),
      update: vi.fn(() => { mutationCalls += 1; return builder }),
      delete: vi.fn(() => { mutationCalls += 1; return builder }),
      maybeSingle: vi.fn(async () => ({
        data: table === 'workouts'
          ? { id: 'workout-1', name: 'Día A', focus: null, plan_id: 'plan-1' }
          : table === 'workout_plans'
            ? { id: 'plan-1' }
            : null,
        error: null,
      })),
      then: (resolve: (value: { data: unknown[]; error: null }) => unknown, reject: (reason: unknown) => unknown) => (
        Promise.resolve({ data: rows, error: null }).then(resolve, reject)
      ),
    }
    return builder
  })
  const rpc = vi.fn(async () => rpcResult)

  return {
    supabase: {
      auth: { getUser: vi.fn(async () => ({ data: { user: { id: 'user-1' } } })) },
      rpc,
      from,
    },
    rpc,
    mutationCalls: () => mutationCalls,
  }
}

function mismatchedWorkoutSummaryClient() {
  let planMutationCalls = 0
  const workoutFilters: Array<[string, unknown]> = []
  const from = vi.fn((table: string) => {
    const builder: any = {
      update: vi.fn(() => { if (table === 'workout_plans') planMutationCalls += 1; return builder }),
      eq: vi.fn((column: string, value: unknown) => {
        if (table === 'workouts') workoutFilters.push([column, value])
        return builder
      }),
      select: vi.fn(() => builder),
      maybeSingle: vi.fn(async () => ({
        data: table === 'workouts'
          && !workoutFilters.some(([column, value]) => column === 'plan_id' && value === 'plan-1')
          ? { id: 'workout-from-another-plan' }
          : null,
        error: null,
      })),
      then: (resolve: (value: { data: null; error: null }) => unknown, reject: (reason: unknown) => unknown) => (
        Promise.resolve({ data: null, error: null }).then(resolve, reject)
      ),
    }
    return builder
  })

  return {
    supabase: {
      auth: { getUser: vi.fn(async () => ({ data: { user: { id: 'user-1' } } })) },
      rpc: vi.fn(),
      from,
    },
    planMutationCalls: () => planMutationCalls,
    workoutFilters,
  }
}

describe('orderedIdsToUpdates', () => {
  it('asigna order_index 1-based en el orden dado', () => {
    expect(orderedIdsToUpdates(['c', 'a', 'b'])).toEqual([
      { id: 'c', order_index: 1 },
      { id: 'a', order_index: 2 },
      { id: 'b', order_index: 3 },
    ])
  })
  it('devuelve [] con lista vacía', () => {
    expect(orderedIdsToUpdates([])).toEqual([])
  })
})

describe('selectedExerciseIds', () => {
  it('preserves unique multi-selection order and supports the legacy single field', () => {
    const selectedExerciseIds = (planLogic as typeof planLogic & {
      selectedExerciseIds?: (formData: FormData) => string[] | null
    }).selectedExerciseIds
    const multiple = new FormData()
    multiple.append('exerciseIds', 'exercise-b')
    multiple.append('exerciseIds', 'exercise-a')
    multiple.append('exerciseIds', 'exercise-b')
    const legacy = new FormData()
    legacy.set('exerciseId', 'exercise-c')

    expect(selectedExerciseIds?.(multiple)).toEqual(['exercise-b', 'exercise-a'])
    expect(selectedExerciseIds?.(legacy)).toEqual(['exercise-c'])
  })

  it('rejects empty and unreasonably large selections', () => {
    const selectedExerciseIds = (planLogic as typeof planLogic & {
      selectedExerciseIds?: (formData: FormData) => string[] | null
    }).selectedExerciseIds
    const tooMany = new FormData()
    Array.from({ length: 13 }, (_, index) => tooMany.append('exerciseIds', `exercise-${index}`))

    expect(selectedExerciseIds?.(new FormData())).toBeNull()
    expect(selectedExerciseIds?.(tooMany)).toBeNull()
  })
})

describe('trainer prescription action barriers', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    requireEditableOwnedPlan.mockRejectedValue(new Error('PLAN_PRESCRIPTION_LOCKED'))
  })

  it('stops plan mutations at the server guard before RPC or table writes', async () => {
    const supabase = lockedClient()
    createClient.mockResolvedValue(supabase)
    const actions = await import('../plan')

    await expect(actions.deletePlan(data({ planId: 'locked-plan' }))).rejects.toThrow('plan_locked')
    await expect(actions.updatePlanSummary(data({ planId: 'locked-plan', name: 'Nope' }))).rejects.toThrow('plan_locked')
    await expect(actions.addWorkoutExercise(data({ planId: 'locked-plan', workoutId: 'workout-1', exerciseId: 'exercise-1' }))).rejects.toThrow('plan_locked')
    await expect(actions.reorderWorkoutExercises('locked-plan', 'workout-1', [])).resolves.toEqual({ success: false })

    expect(requireEditableOwnedPlan).toHaveBeenCalled()
    expect(supabase.rpc).not.toHaveBeenCalled()
  })

  it('returns locked errors before AI generation, adjustment, or post persistence', async () => {
    const supabase = lockedClient()
    createClient.mockResolvedValue(supabase)
    const [{ previewStructuredPlanAdjustment, applyPlanAdjustment, suggestWorkoutAdjustment, applyWorkoutAdjustment }, { generatePlan }, { createPostFromPlan }] = await Promise.all([
      import('../adjustPlan'), import('../generatePlan'), import('../posts'),
    ])

    await expect(previewStructuredPlanAdjustment('locked-plan', {})).resolves.toMatchObject({ success: false })
    await expect(applyPlanAdjustment('locked-plan', {}, '00000000-0000-4000-8000-000000000002')).resolves.toMatchObject({ success: false })
    await expect(suggestWorkoutAdjustment('workout-1', 'cambia la rutina')).resolves.toMatchObject({ success: false })
    await expect(applyWorkoutAdjustment('workout-1', [])).resolves.toMatchObject({ success: false })
    await expect(generatePlan({ mode: 'weekly_regeneration', previewOnly: true })).resolves.toMatchObject({ success: false })
    await expect(createPostFromPlan('locked-plan')).resolves.toMatchObject({ ok: false })

    expect(requireEditableOwnedPlan).toHaveBeenCalled()
    expect(supabase.rpc).not.toHaveBeenCalled()
  })

  it('rejects a locked initial retry before idempotency lookup, filtering, engine execution, or RPC writes', async () => {
    const { supabase, metrics } = lockedInitialGenerationClient()
    createClient.mockResolvedValue(supabase)
    const { generatePlan } = await import('../generatePlan')

    await expect(generatePlan({ mode: 'initial', requestId: '00000000-0000-4000-8000-000000000004' })).resolves.toMatchObject({ success: false })
    expect(requireEditableOwnedPlan).toHaveBeenCalledWith(supabase, 'locked-client', 'locked-plan')
    expect(metrics.generationRequestLookups).toBe(0)
    expect(metrics.profileReads).toBe(0)
    expect(metrics.exerciseReads).toBe(0)
    expect(filterExercisesForUser).not.toHaveBeenCalled()
    expect(generateEvidencePlan).not.toHaveBeenCalled()
    expect(regenerateEvidencePlan).not.toHaveBeenCalled()
    expect(supabase.rpc).not.toHaveBeenCalled()
  })

})

describe('inline workout editor actions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    requireEditableOwnedPlan.mockResolvedValue(undefined)
    createClient.mockResolvedValue(editablePlanClient())
  })

  it.each([
    ['workout summary', (actions: typeof import('../plan')) => actions.updateWorkoutSummary(data({ planId: 'plan-1', workoutId: 'workout-1', name: 'Día A' }))],
    ['exercise addition', (actions: typeof import('../plan')) => actions.addWorkoutExercise(data({ planId: 'plan-1', workoutId: 'workout-1', exerciseId: 'exercise-2' }))],
    ['exercise details', (actions: typeof import('../plan')) => actions.updateWorkoutExercise(data({ planId: 'plan-1', workoutExerciseId: 'row-1', sets: '3', reps: '12' }))],
    ['exercise replacement', (actions: typeof import('../plan')) => actions.replaceWorkoutExercise(data({ planId: 'plan-1', workoutExerciseId: 'row-1', exerciseId: 'exercise-2' }))],
    ['exercise removal', (actions: typeof import('../plan')) => actions.removeWorkoutExercise(data({ planId: 'plan-1', workoutExerciseId: 'row-1' }))],
    ['exercise movement', (actions: typeof import('../plan')) => actions.moveWorkoutExercise(data({ planId: 'plan-1', workoutExerciseId: 'row-1', direction: 'down' }))],
  ])('revalidates %s without navigating away from the open editor', async (_label, invoke) => {
    const actions = await import('../plan')

    await invoke(actions)

    expect(redirect).not.toHaveBeenCalled()
    expect(revalidatePath).toHaveBeenCalledWith('/plan')
  })

  it('applies normalized workout changes through one atomic RPC without mutation-table loops', async () => {
    const client = atomicAdjustmentClient()
    createClient.mockResolvedValue(client.supabase)
    const { applyWorkoutAdjustment } = await import('../adjustPlan')
    const changes = [
      { type: 'update_exercise' as const, workoutExerciseId: 'row-1', sets: 4 },
      { type: 'remove_exercise' as const, workoutExerciseId: 'row-2' },
    ]

    await expect(applyWorkoutAdjustment('workout-1', changes)).resolves.toEqual({
      success: true,
      appliedCount: 2,
    })
    expect(client.rpc).toHaveBeenCalledOnce()
    expect(client.rpc).toHaveBeenCalledWith('apply_workout_adjustment_atomic', {
      p_workout_id: 'workout-1',
      p_changes: changes,
    })
    expect(client.mutationCalls()).toBe(0)
  })

  it('reports an atomic adjustment failure without attempting fallback writes', async () => {
    const client = atomicAdjustmentClient({ data: null, error: { message: 'forced failure' } })
    createClient.mockResolvedValue(client.supabase)
    const { applyWorkoutAdjustment } = await import('../adjustPlan')

    await expect(applyWorkoutAdjustment('workout-1', [
      { type: 'update_exercise', workoutExerciseId: 'row-1', reps: 12 },
    ])).resolves.toEqual({ success: false, error: 'No se pudieron aplicar todos los cambios' })
    expect(client.rpc).toHaveBeenCalledOnce()
    expect(client.mutationCalls()).toBe(0)
  })

  it('rejects a workout summary whose workout does not belong to the submitted plan', async () => {
    const client = mismatchedWorkoutSummaryClient()
    createClient.mockResolvedValue(client.supabase)
    const actions = await import('../plan')

    await expect(actions.updateWorkoutSummary(data({
      planId: 'plan-1',
      workoutId: 'workout-from-another-plan',
      name: 'Día ajeno',
    }))).rejects.toThrow('REDIRECT:/plan?error=save_failed')
    expect(client.workoutFilters).toContainEqual(['plan_id', 'plan-1'])
    expect(client.planMutationCalls()).toBe(0)
  })
})
