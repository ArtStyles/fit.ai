import { beforeEach, describe, expect, it, vi } from 'vitest'

const { requireActiveTrainerContext, revalidatePath } = vi.hoisted(() => ({
  requireActiveTrainerContext: vi.fn(),
  revalidatePath: vi.fn(),
}))

vi.mock('server-only', () => ({}))
vi.mock('@/lib/coaching/access', () => ({ requireActiveTrainerContext }))
vi.mock('next/cache', () => ({ revalidatePath }))

const ids = {
  template: '11111111-1111-4111-8111-111111111111',
  workout: '22222222-2222-4222-8222-222222222222',
  exercise: '33333333-3333-4333-8333-333333333333',
}

function form(values: Record<string, string>) {
  const result = new FormData()
  Object.entries(values).forEach(([key, value]) => result.set(key, value))
  return result
}

function supabaseFixture(options: { ownedTemplate?: boolean; ownedWorkout?: boolean; exerciseExists?: boolean } = {}) {
  const state = { ownedTemplate: options.ownedTemplate ?? true, ownedWorkout: options.ownedWorkout ?? true, exerciseExists: options.exerciseExists ?? true }
  const insert = vi.fn(() => ({ select: () => ({ single: async () => ({ data: { id: ids.template }, error: null }) }) }))
  const update = vi.fn(() => ({ eq: () => ({ eq: () => ({ select: () => ({ single: async () => ({ data: { id: ids.template }, error: null }) }) }) }) }))
  const rpc = vi.fn(async () => ({ data: { changed: true }, error: null }))
  const chain: any = {
    select: vi.fn(() => chain), eq: vi.fn(() => chain), maybeSingle: vi.fn(async () => ({
      data: state.ownedTemplate ? { id: ids.template } : null, error: null,
    })), insert, update,
  }
  const from = vi.fn((table: string) => {
    if (table === 'trainer_template_workouts') {
      return { ...chain, maybeSingle: vi.fn(async () => ({ data: state.ownedWorkout ? { id: ids.workout, template_id: ids.template } : null, error: null })) }
    }
    if (table === 'exercises') return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: state.exerciseExists ? { id: ids.exercise } : null, error: null }) }) }) }
    return chain
  })
  return { from, insert, update, rpc }
}

describe('trainer program actions', () => {
  beforeEach(() => vi.clearAllMocks())

  it('creates a template for the signed-in active trainer, never a submitted trainer id', async () => {
    const supabase = supabaseFixture()
    requireActiveTrainerContext.mockResolvedValue({ user: { id: 'trainer-user-1' }, supabase })
    const { createTrainerProgram } = await import('../trainerPrograms')

    await expect(createTrainerProgram(form({ name: 'Fuerza base', goal: 'Ganar fuerza', description: '', daysPerWeek: '3', trainerUserId: 'attacker' }))).resolves.toEqual({ ok: true, templateId: ids.template })
    expect(supabase.insert).toHaveBeenCalledWith(expect.objectContaining({ trainer_user_id: 'trainer-user-1', name: 'Fuerza base', days_per_week: 3 }))
    expect(JSON.stringify(supabase.insert.mock.calls)).not.toContain('attacker')
  })

  it('rejects invalid prescription limits before it writes an exercise', async () => {
    const supabase = supabaseFixture()
    requireActiveTrainerContext.mockResolvedValue({ user: { id: 'trainer-user-1' }, supabase })
    const { addTrainerTemplateExercise } = await import('../trainerPrograms')

    await expect(addTrainerTemplateExercise(form({ templateWorkoutId: ids.workout, exerciseId: ids.exercise, sets: '21', reps: '10', weightKg: '', targetRpe: '', restSeconds: '60', notes: '' }))).resolves.toMatchObject({ ok: false, fieldErrors: { sets: expect.any(String) } })
    expect(supabase.from).not.toHaveBeenCalledWith('exercises')
  })

  it('does not write a workout outside the signed-in trainer template ownership boundary', async () => {
    const supabase = supabaseFixture({ ownedTemplate: false })
    requireActiveTrainerContext.mockResolvedValue({ user: { id: 'trainer-user-1' }, supabase })
    const { createTrainerTemplateWorkout } = await import('../trainerPrograms')

    await expect(createTrainerTemplateWorkout(form({ templateId: ids.template, name: 'Día A', dayOfWeek: '1', orderInPlan: '1' }))).resolves.toEqual({ ok: false, error: 'No tienes permiso para modificar esta rutina.' })
    expect(supabase.insert).not.toHaveBeenCalled()
  })

  it('reorders through an atomic RPC rather than direct sequential updates', async () => {
    const supabase = supabaseFixture()
    requireActiveTrainerContext.mockResolvedValue({ user: { id: 'trainer-user-1' }, supabase })
    const { reorderTrainerTemplateWorkouts } = await import('../trainerPrograms')

    await expect(reorderTrainerTemplateWorkouts(form({ templateId: ids.template, workoutIds: `${ids.workout},44444444-4444-4444-8444-444444444444` }))).resolves.toEqual({ ok: true })
    expect(supabase.rpc).toHaveBeenCalledWith('reorder_trainer_template_workouts', expect.objectContaining({ p_template_id: ids.template }))
    expect(supabase.update).not.toHaveBeenCalled()
  })

  it('keeps trainer program actions separated from client workout plans', async () => {
    const source = await import('node:fs/promises').then(fs => fs.readFile(new URL('../trainerPrograms.ts', import.meta.url), 'utf8'))
    expect(source).not.toContain(".from('workout_plans')")
    expect(source).not.toContain('from("workout_plans")')
  })
})
