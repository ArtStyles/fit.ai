import { beforeEach, describe, expect, it, vi } from 'vitest'

const { createClient, getPlanCreatePolicy, filterExercisesForUser, generateEvidencePlan } = vi.hoisted(() => ({
  createClient: vi.fn(),
  getPlanCreatePolicy: vi.fn(),
  filterExercisesForUser: vi.fn(),
  generateEvidencePlan: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({ createClient }))
vi.mock('@/lib/plans/entitlements', () => ({ getPlanCreatePolicy }))
vi.mock('@/lib/ai/filter', () => ({ filterExercisesForUser }))
vi.mock('@/lib/training-engine', async () => ({
  ...(await vi.importActual<typeof import('@/lib/training-engine')>('@/lib/training-engine')),
  generateEvidencePlan,
}))

function professionalPrimaryClient(existingGeneration = false) {
  const from = vi.fn((_table: string) => {
    const filters: Record<string, unknown> = {}
    const builder: any = {
      select: () => builder,
      eq: (key: string, value: unknown) => { filters[key] = value; return builder },
      is: () => builder,
      order: () => builder,
      limit: () => builder,
      maybeSingle: async () => ({
        data: filters.generation_request_id
          ? existingGeneration ? { id: 'personal-plan', name: 'Personal plan', days_per_week: 1, week_number: 1, generation_metadata: {} } : null
          : { id: 'professional-plan', family_id: 'professional-family', prescription_locked: true, name: 'Professional plan', week_number: 4 },
        error: null,
      }),
      single: async () => ({
        data: { fitness_level: 'beginner', primary_goal: 'general_fitness', days_per_week: 1, preferred_workout_days: [2] },
        error: null,
      }),
    }
    return builder
  })
  return {
    auth: { getUser: vi.fn(async () => ({ data: { user: { id: 'client-1' } } })) },
    from,
    rpc: vi.fn(async () => ({ data: 'personal-plan', error: null })),
  }
}

describe('personal generation with a professional primary', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getPlanCreatePolicy.mockResolvedValue({ allowed: true })
    filterExercisesForUser.mockResolvedValue([{
      id: 'exercise-1', name: 'Walk', muscle_groups: [], equipment: [], exercise_type: 'cardio',
      difficulty: 'beginner', is_compound: false, movement_patterns: [], cardio_modality: 'walking',
    }])
    generateEvidencePlan.mockReturnValue({
      success: true,
      plan: { display_name: 'Personal plan', ai_notes: '', days: [{ day_number: 1, display_name: 'Day 1', focus: '', exercises: [] }] },
      metadata: { engineVersion: 'test', evidenceVersion: 'test', warnings: [] },
      issues: [],
    })
  })

  it.each(['initial', undefined] as const)('creates a separate parentless personal family for mode %s', async (mode) => {
    const client = professionalPrimaryClient()
    createClient.mockResolvedValue(client)
    const { generatePlan } = await import('../generatePlan')
    const requestId = '00000000-0000-4000-8000-000000000012'

    await expect(generatePlan({ mode, requestId })).resolves.toMatchObject({
      success: true, planId: 'personal-plan', weekNumber: 1,
    })
    expect(getPlanCreatePolicy).toHaveBeenCalledWith(client, 'client-1', { replacingFamilyId: null })
    expect(generateEvidencePlan).toHaveBeenCalledWith(expect.objectContaining({
      weekNumber: 1, previousPlan: null, history: null,
    }))
    expect(client.rpc).toHaveBeenCalledExactlyOnceWith('create_engine_plan_v2', expect.objectContaining({
      p_plan_context: 'first_plan', p_expected_parent_plan_id: null,
      p_generation_request_id: requestId, p_week_number: 1, p_profile_updates: {},
    }))
    expect(client.from.mock.calls.map(([table]) => table)).not.toContain('workouts')
  })

  it('reconciles an existing initial request while a professional plan is selected', async () => {
    const client = professionalPrimaryClient(true)
    createClient.mockResolvedValue(client)
    const { generatePlan } = await import('../generatePlan')

    await expect(generatePlan({ mode: 'initial', requestId: '00000000-0000-4000-8000-000000000012' }))
      .resolves.toMatchObject({ success: true, planId: 'personal-plan' })
    expect(getPlanCreatePolicy).not.toHaveBeenCalled()
    expect(generateEvidencePlan).not.toHaveBeenCalled()
    expect(client.rpc).not.toHaveBeenCalled()
  })
})
