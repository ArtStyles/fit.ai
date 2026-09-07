import { beforeEach, describe, expect, it, vi } from 'vitest'

const { createClient, filterExercisesForUser, previewPlanAdjustment } = vi.hoisted(() => ({
  createClient: vi.fn(),
  filterExercisesForUser: vi.fn(),
  previewPlanAdjustment: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({ createClient }))
vi.mock('@/lib/ai/filter', () => ({ filterExercisesForUser }))
vi.mock('@/lib/plans/editability', () => ({ requireEditableOwnedPlan: vi.fn() }))
vi.mock('@/lib/plans/entitlements', () => ({
  getPlanCreatePolicy: vi.fn(async () => ({ allowed: true })),
}))
vi.mock('@/lib/training-engine', async () => ({
  ...(await vi.importActual<typeof import('@/lib/training-engine')>('@/lib/training-engine')),
  previewPlanAdjustment,
}))

function adjustmentClient(
  profileDays = 3,
  workoutDays = [2, 4],
  profilePreferredDays = [1, 3, 5],
) {
  const rpc = vi.fn(async (_name: string, _payload: unknown) => ({ data: 'new-plan', error: null }))
  const from = vi.fn((table: string) => {
    let selection = ''
    const filters: Record<string, unknown> = {}
    const builder: any = {
      select: vi.fn((value: string) => { selection = value; return builder }),
      eq: vi.fn((key: string, value: unknown) => { filters[key] = value; return builder }),
      is: vi.fn(() => builder),
      order: vi.fn(() => builder),
      limit: vi.fn(() => builder),
      in: vi.fn(() => builder),
      maybeSingle: vi.fn(async () => {
        if (table === 'workout_plans' && filters.generation_request_id) return { data: null, error: null }
        return { data: {
          id: 'active-plan', name: 'Active', ai_notes: '', week_number: 1,
          family_id: 'family-1', prescription_locked: false,
        }, error: null }
      }),
      single: vi.fn(async () => ({ data: table === 'profiles' ? {
        fitness_level: 'beginner', primary_goal: 'stay_active', days_per_week: profileDays,
        session_duration_minutes: 60, gym_type: 'full_gym', available_equipment: [],
        injuries: null, gender: null, weight_kg: null, date_of_birth: null,
        preferred_workout_days: profilePreferredDays, language: 'es', cardio_preferences: [],
        readiness_status: 'cleared', readiness_answers: {}, movement_limitations: [],
      } : null, error: null })),
      then: (resolve: (value: { data: unknown[]; error: null }) => unknown) => {
        const rows = table === 'workouts'
          ? selection === 'day_of_week'
            ? workoutDays.map(day_of_week => ({ day_of_week }))
            : workoutDays.map((_, index) => ({
                id: `w${index + 1}`, name: `Day ${index + 1}`, focus: '', order_in_plan: index + 1,
              }))
          : table === 'workout_exercises' ? [] : []
        return Promise.resolve({ data: rows, error: null }).then(resolve)
      },
    }
    return builder
  })
  return { auth: { getUser: vi.fn(async () => ({ data: { user: { id: 'user-1' } } })) }, from, rpc }
}

describe('generatePlan adjustment calendar', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    filterExercisesForUser.mockResolvedValue([{
      id: 'exercise-1', name: 'Walk', muscle_groups: [], equipment: [], exercise_type: 'cardio',
      difficulty: 'beginner', is_compound: false, movement_patterns: [], cardio_modality: 'walking',
      impact_level: 'low', joint_stress_tags: [],
    }])
    previewPlanAdjustment.mockImplementation((input: any) => {
      const days = Array.from({ length: input.profile.daysPerWeek }, (_, index) => ({
        day_number: index + 1, display_name: `Day ${index + 1}`, focus: '', exercises: [],
      }))
      return {
        result: { success: true, plan: { display_name: 'Adjusted', ai_notes: '', days }, issues: [], metadata: {
          engineVersion: 'test', evidenceVersion: 'test', appliedRuleIds: [], warnings: [], generatedAt: '2026-09-07',
        } },
        diff: { daysBefore: 2, daysAfter: days.length, exercisesAdded: [], exercisesRemoved: [], changedPrescriptionCount: 0 },
        warnings: [],
      }
    })
  })

  it('uses active Tue/Thu instead of stale profile count for duration preview and persistence', async () => {
    const client = adjustmentClient()
    createClient.mockResolvedValue(client)
    const { generatePlan } = await import('../generatePlan')
    const intent = { type: 'change_duration' as const, sessionDurationMinutes: 45 as const }

    await expect(generatePlan({ mode: 'plan_adjustment', adjustmentIntent: intent, expectedParentPlanId: 'active-plan', previewOnly: true }))
      .resolves.toMatchObject({ success: true, daysCount: 2, workoutDays: [2, 4] })
    await expect(generatePlan({ mode: 'plan_adjustment', adjustmentIntent: intent, expectedParentPlanId: 'active-plan', requestId: '00000000-0000-4000-8000-000000000009' }))
      .resolves.toMatchObject({ success: true })

    const payload = client.rpc.mock.calls[0]?.[1] as any
    expect(payload.p_plan.days.map((day: { day_of_week: number }) => day.day_of_week)).toEqual([2, 4])
    expect(payload.p_profile_updates).toEqual({ session_duration_minutes: 45 })
    expect(previewPlanAdjustment).toHaveBeenCalledTimes(2)
    expect(previewPlanAdjustment.mock.calls.every(([input]) => input.profile.daysPerWeek === 2)).toBe(true)
  })

  it('does not truncate an active three-day calendar when the profile count is lower', async () => {
    const client = adjustmentClient(2, [2, 4, 6])
    createClient.mockResolvedValue(client)
    const { generatePlan } = await import('../generatePlan')

    await expect(generatePlan({
      mode: 'plan_adjustment',
      adjustmentIntent: { type: 'change_duration', sessionDurationMinutes: 45 },
      expectedParentPlanId: 'active-plan',
      previewOnly: true,
    })).resolves.toMatchObject({ success: true, daysCount: 3, workoutDays: [2, 4, 6] })
    expect(previewPlanAdjustment.mock.calls[0]?.[0].profile.daysPerWeek).toBe(3)
  })

  it('rejects an engine result whose workout count disagrees with the resolved calendar', async () => {
    const client = adjustmentClient()
    createClient.mockResolvedValue(client)
    previewPlanAdjustment.mockImplementationOnce(() => ({
      result: {
        success: true,
        plan: {
          display_name: 'Wrong count', ai_notes: '',
          days: [1, 2, 3].map(day_number => ({ day_number, display_name: `Day ${day_number}`, focus: '', exercises: [] })),
        },
        issues: [],
        metadata: {
          engineVersion: 'test', evidenceVersion: 'test', appliedRuleIds: [], warnings: [], generatedAt: '2026-09-07',
        },
      },
      diff: null,
      warnings: [],
    }))
    const { generatePlan } = await import('../generatePlan')

    await expect(generatePlan({
      mode: 'plan_adjustment',
      adjustmentIntent: { type: 'change_duration', sessionDurationMinutes: 45 },
      expectedParentPlanId: 'active-plan',
      previewOnly: true,
    })).resolves.toMatchObject({
      success: false,
      error: 'El motor devolvió un calendario distinto al ajuste previsualizado.',
    })
    expect(client.rpc).not.toHaveBeenCalled()
  })

  it('persists one resolved day-change calendar and retains it for a later duration adjustment', async () => {
    const { generatePlan } = await import('../generatePlan')
    const dayChangeClient = adjustmentClient(3, [2, 4, 6], [2, 4, 6])
    createClient.mockResolvedValue(dayChangeClient)

    await expect(generatePlan({
      mode: 'plan_adjustment',
      adjustmentIntent: { type: 'change_days', daysPerWeek: 2 },
      expectedParentPlanId: 'active-plan',
      requestId: '00000000-0000-4000-8000-000000000010',
    })).resolves.toMatchObject({ success: true })

    const dayChangePayload = dayChangeClient.rpc.mock.calls[0]?.[1] as any
    expect(dayChangePayload.p_profile_updates).toEqual({
      days_per_week: 2,
      preferred_workout_days: [2, 4],
    })
    expect(dayChangePayload.p_plan.days.map((day: { day_of_week: number }) => day.day_of_week))
      .toEqual([2, 4])

    const persistedWorkoutDays = dayChangePayload.p_plan.days.map(
      (day: { day_of_week: number }) => day.day_of_week,
    )
    const durationClient = adjustmentClient(
      dayChangePayload.p_profile_updates.days_per_week,
      persistedWorkoutDays,
      dayChangePayload.p_profile_updates.preferred_workout_days,
    )
    createClient.mockResolvedValue(durationClient)
    await expect(generatePlan({
      mode: 'plan_adjustment',
      adjustmentIntent: { type: 'change_duration', sessionDurationMinutes: 45 },
      expectedParentPlanId: 'active-plan',
      requestId: '00000000-0000-4000-8000-000000000011',
    })).resolves.toMatchObject({ success: true })

    const durationPayload = durationClient.rpc.mock.calls[0]?.[1] as any
    expect(durationPayload.p_profile_updates).toEqual({ session_duration_minutes: 45 })
    expect(durationPayload.p_plan.days.map((day: { day_of_week: number }) => day.day_of_week))
      .toEqual([2, 4])
  })
})
