import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  createClient,
  requireEditableOwnedPlan,
  findExistingPlanGeneration,
  generatePlan,
} = vi.hoisted(() => ({
  createClient: vi.fn(),
  requireEditableOwnedPlan: vi.fn(),
  findExistingPlanGeneration: vi.fn(),
  generatePlan: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({ createClient }))
vi.mock('@/lib/plans/editability', () => ({ requireEditableOwnedPlan }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('../generatePlan', () => ({ findExistingPlanGeneration, generatePlan }))

function authenticatedClient() {
  return {
    auth: {
      getUser: vi.fn(async () => ({ data: { user: { id: 'athlete-1' } } })),
    },
    from: vi.fn(),
  }
}

describe('locked plan adjustment retries', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    createClient.mockResolvedValue(authenticatedClient())
  })

  it('rejects a locked retry before reading an existing generation', async () => {
    requireEditableOwnedPlan.mockRejectedValue(new Error('PLAN_PRESCRIPTION_LOCKED'))
    findExistingPlanGeneration.mockResolvedValue({ success: true, planId: 'existing-plan' })
    const { applyPlanAdjustment } = await import('../adjustPlan')

    await expect(applyPlanAdjustment(
      'locked-plan',
      { type: 'replace_exercise' },
      '00000000-0000-4000-8000-000000000041',
    )).resolves.toMatchObject({ success: false, error: 'La rutina asignada por tu entrenador solo se puede ejecutar.' })

    expect(findExistingPlanGeneration).not.toHaveBeenCalled()
    expect(generatePlan).not.toHaveBeenCalled()
  })

  it('returns an existing retry for an editable superseded plan without loading or regenerating it', async () => {
    const supabase = authenticatedClient()
    createClient.mockResolvedValue(supabase)
    requireEditableOwnedPlan.mockResolvedValue({ id: 'superseded-plan' })
    findExistingPlanGeneration.mockResolvedValue({ success: true, planId: 'replacement-plan' })
    const { applyPlanAdjustment } = await import('../adjustPlan')

    await expect(applyPlanAdjustment(
      'superseded-plan',
      { type: 'replace_exercise' },
      '00000000-0000-4000-8000-000000000042',
    )).resolves.toEqual({ success: true, appliedCount: 1 })

    expect(requireEditableOwnedPlan).toHaveBeenCalledWith(expect.anything(), 'athlete-1', 'superseded-plan')
    expect(findExistingPlanGeneration).toHaveBeenCalledTimes(1)
    expect(findExistingPlanGeneration).toHaveBeenCalledWith('00000000-0000-4000-8000-000000000042')
    expect(supabase.from).not.toHaveBeenCalled()
    expect(generatePlan).not.toHaveBeenCalled()
  })
})
