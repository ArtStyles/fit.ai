import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { orderedIdsToUpdates } from '../plan.logic'

const planActions = readFileSync(new URL('../plan.ts', import.meta.url), 'utf8')
const adjustmentActions = readFileSync(new URL('../adjustPlan.ts', import.meta.url), 'utf8')
const generateActions = readFileSync(new URL('../generatePlan.ts', import.meta.url), 'utf8')
const postActions = readFileSync(new URL('../posts.ts', import.meta.url), 'utf8')

const { createClient, redirect, requireEditableOwnedPlan, revalidatePath } = vi.hoisted(() => ({
  createClient: vi.fn(),
  redirect: vi.fn((url: string) => { throw new Error(`REDIRECT:${url}`) }),
  requireEditableOwnedPlan: vi.fn(),
  revalidatePath: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({ createClient }))
vi.mock('@/lib/plans/editability', async () => ({
  ...(await vi.importActual<typeof import('@/lib/plans/editability')>('@/lib/plans/editability')),
  requireEditableOwnedPlan,
}))
vi.mock('next/navigation', () => ({ redirect }))
vi.mock('next/cache', () => ({ revalidatePath }))
vi.mock('@/lib/features/community', () => ({ isCommunityEnabled: () => true, communityUnavailableResult: () => ({ ok: false }) }))

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

function data(values: Record<string, string>) {
  const result = new FormData()
  Object.entries(values).forEach(([key, value]) => result.set(key, value))
  return result
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

describe('trainer prescription action barriers', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    requireEditableOwnedPlan.mockRejectedValue(new Error('PLAN_PRESCRIPTION_LOCKED'))
  })

  it('uses the server-side editable-plan guard for all mutable plan surfaces', () => {
    for (const source of [planActions, adjustmentActions, generateActions, postActions]) {
      expect(source).toContain('requireEditableOwnedPlan')
    }
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

  it('keeps every AI and sharing route behind the common server guard', () => {
    for (const [source, exports] of [
      [adjustmentActions, ['previewStructuredPlanAdjustment', 'applyPlanAdjustment', 'suggestWorkoutAdjustment', 'applyWorkoutAdjustment']],
      [generateActions, ['generatePlan']],
      [postActions, ['createPostFromPlan']],
    ] as const) {
      for (const name of exports) {
        const start = source.indexOf(`export async function ${name}`)
        expect(start, name).toBeGreaterThanOrEqual(0)
        const next = source.indexOf('export async function ', start + 1)
        expect(source.slice(start, next < 0 ? undefined : next), name).toContain('requireEditableOwnedPlan')
      }
    }
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
})
