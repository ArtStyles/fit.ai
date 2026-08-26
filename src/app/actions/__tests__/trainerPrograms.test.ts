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

function supabaseFixture(options: {
  ownedTemplate?: boolean
  ownedWorkout?: boolean
  exerciseExists?: boolean
  rpcData?: unknown
  rpcError?: { message?: string; code?: string } | null
} = {}) {
  const state = { ownedTemplate: options.ownedTemplate ?? true, ownedWorkout: options.ownedWorkout ?? true, exerciseExists: options.exerciseExists ?? true }
  const insert = vi.fn(() => ({ select: () => ({ single: async () => ({ data: { id: ids.template }, error: null }) }) }))
  const mutation: any = {
    eq: vi.fn(() => mutation),
    select: vi.fn(() => ({ single: async () => ({ data: { id: ids.template }, error: null }) })),
  }
  const update = vi.fn(() => mutation)
  const defaultRpcData = {
    templateWorkoutId: ids.workout,
    exercises: [
      { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', exerciseId: ids.exercise, orderIndex: 2 },
      { id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', exerciseId: '44444444-4444-4444-8444-444444444444', orderIndex: 3 },
    ],
  }
  const rpc = vi.fn(async () => ({ data: options.rpcData ?? defaultRpcData, error: options.rpcError ?? null }))
  const query = (data: unknown) => {
    const chain: any = {
      select: vi.fn(() => chain),
      eq: vi.fn(() => chain),
      maybeSingle: vi.fn(async () => ({ data, error: null })),
      insert,
      update,
      delete: vi.fn(() => ({ eq: async () => ({ error: null }) })),
    }
    return chain
  }
  const from = vi.fn((table: string) => {
    if (table === 'trainer_template_workouts') return query(state.ownedWorkout ? { id: ids.workout, template_id: ids.template } : null)
    if (table === 'trainer_template_exercises') return query(state.ownedWorkout ? { id: ids.exercise } : null)
    if (table === 'exercises') return query(state.exerciseExists ? { id: ids.exercise } : null)
    return query(state.ownedTemplate ? { id: ids.template } : null)
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

  it('appends repeated exercise ids with server-owned defaults and no client order', async () => {
    const supabase = supabaseFixture()
    requireActiveTrainerContext.mockResolvedValue({ user: { id: 'trainer-user-1' }, supabase })
    const { addTrainerTemplateExercises } = await import('../trainerPrograms')
    const data = form({ templateWorkoutId: ids.workout })
    data.append('exerciseId', ids.exercise)
    data.append('exerciseId', '44444444-4444-4444-8444-444444444444')
    data.set('orderIndex', '1')

    await expect(addTrainerTemplateExercises(data)).resolves.toMatchObject({
      ok: true,
      exercises: [
        { exerciseId: ids.exercise, orderIndex: 2 },
        { exerciseId: '44444444-4444-4444-8444-444444444444', orderIndex: 3 },
      ],
    })
    expect(supabase.rpc).toHaveBeenCalledWith('append_trainer_template_exercises', {
      p_template_workout_id: ids.workout,
      p_exercises: [
        { exerciseId: ids.exercise, sets: 3, reps: 10, weightKg: null, targetRpe: 7, restSeconds: 60, notes: null },
        { exerciseId: '44444444-4444-4444-8444-444444444444', sets: 3, reps: 10, weightKg: null, targetRpe: 7, restSeconds: 60, notes: null },
      ],
    })
    expect(JSON.stringify(supabase.rpc.mock.calls)).not.toContain('orderIndex')
    expect(revalidatePath).toHaveBeenCalledWith(`/coach/programs/${ids.template}`)
  })

  it('keeps the one-exercise compatibility action order-free', async () => {
    const supabase = supabaseFixture({ rpcData: {
      templateWorkoutId: ids.workout,
      exercises: [{ id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', exerciseId: ids.exercise, orderIndex: 2 }],
    } })
    requireActiveTrainerContext.mockResolvedValue({ user: { id: 'trainer-user-1' }, supabase })
    const { addTrainerTemplateExercise } = await import('../trainerPrograms')

    await expect(addTrainerTemplateExercise(form({
      templateWorkoutId: ids.workout,
      exerciseId: ids.exercise,
      sets: '4',
      reps: '8',
      weightKg: '20',
      targetRpe: '8',
      restSeconds: '90',
      notes: 'Controlado',
    }))).resolves.toEqual({ ok: true, templateExerciseId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' })
    expect(supabase.rpc).toHaveBeenCalledWith('append_trainer_template_exercises', {
      p_template_workout_id: ids.workout,
      p_exercises: [{ exerciseId: ids.exercise, sets: 4, reps: 8, weightKg: 20, targetRpe: 8, restSeconds: 90, notes: 'Controlado' }],
    })
  })

  it.each([
    ['empty', []],
    ['duplicate', [ids.exercise, ids.exercise]],
    ['more than 30', Array.from({ length: 31 }, (_, index) => `40000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`)],
  ])('rejects a %s batch selection before calling the RPC', async (_label, exerciseIds) => {
    const supabase = supabaseFixture()
    requireActiveTrainerContext.mockResolvedValue({ user: { id: 'trainer-user-1' }, supabase })
    const { addTrainerTemplateExercises } = await import('../trainerPrograms')
    const data = form({ templateWorkoutId: ids.workout })
    exerciseIds.forEach(exerciseId => data.append('exerciseId', exerciseId))

    await expect(addTrainerTemplateExercises(data)).resolves.toMatchObject({
      ok: false,
      fieldErrors: { exerciseId: 'Selecciona entre 1 y 30 ejercicios válidos.' },
    })
    expect(supabase.rpc).not.toHaveBeenCalled()
  })

  it.each([
    ['TRAINER_TEMPLATE_OWNER_REQUIRED', 'No tienes permiso para modificar este entrenamiento.'],
    ['TRAINER_TEMPLATE_BATCH_INVALID', 'La selección de ejercicios no es válida.'],
    ['TRAINER_TEMPLATE_BATCH_EXERCISE_UNAVAILABLE', 'Uno de los ejercicios ya no está disponible.'],
    ['TRAINER_TEMPLATE_BATCH_LIMIT', 'Este día no puede superar 30 ejercicios.'],
  ])('maps the %s RPC failure without exposing its database details', async (databaseError, message) => {
    const supabase = supabaseFixture({ rpcError: { message: databaseError } })
    requireActiveTrainerContext.mockResolvedValue({ user: { id: 'trainer-user-1' }, supabase })
    const { addTrainerTemplateExercises } = await import('../trainerPrograms')
    const data = form({ templateWorkoutId: ids.workout })
    data.append('exerciseId', ids.exercise)

    await expect(addTrainerTemplateExercises(data)).resolves.toEqual({ ok: false, error: message })
  })

  it('rejects a malformed RPC batch response instead of reporting a partial success', async () => {
    const supabase = supabaseFixture({ rpcData: { templateWorkoutId: ids.workout, exercises: [{ id: ids.exercise, exerciseId: 'not-a-uuid', orderIndex: 2 }] } })
    requireActiveTrainerContext.mockResolvedValue({ user: { id: 'trainer-user-1' }, supabase })
    const { addTrainerTemplateExercises } = await import('../trainerPrograms')
    const data = form({ templateWorkoutId: ids.workout })
    data.append('exerciseId', ids.exercise)

    await expect(addTrainerTemplateExercises(data)).resolves.toEqual({ ok: false, error: 'No se pudo agregar los ejercicios.' })
  })

  it('rejects an incomplete RPC batch response instead of reporting a partial success', async () => {
    const supabase = supabaseFixture({ rpcData: {
      templateWorkoutId: ids.workout,
      exercises: [{ id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', exerciseId: ids.exercise, orderIndex: 2 }],
    } })
    requireActiveTrainerContext.mockResolvedValue({ user: { id: 'trainer-user-1' }, supabase })
    const { addTrainerTemplateExercises } = await import('../trainerPrograms')
    const data = form({ templateWorkoutId: ids.workout })
    data.append('exerciseId', ids.exercise)
    data.append('exerciseId', '44444444-4444-4444-8444-444444444444')

    await expect(addTrainerTemplateExercises(data)).resolves.toEqual({ ok: false, error: 'No se pudo agregar los ejercicios.' })
  })

  it('accepts a normalized UUID returned for an uppercase selected identifier', async () => {
    const selectedExerciseId = 'abcdefab-cdef-4abc-8abc-abcdefabcdef'
    const supabase = supabaseFixture({ rpcData: {
      templateWorkoutId: ids.workout,
      exercises: [{ id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', exerciseId: selectedExerciseId, orderIndex: 2 }],
    } })
    requireActiveTrainerContext.mockResolvedValue({ user: { id: 'trainer-user-1' }, supabase })
    const { addTrainerTemplateExercises } = await import('../trainerPrograms')
    const data = form({ templateWorkoutId: ids.workout })
    data.append('exerciseId', selectedExerciseId.toUpperCase())

    await expect(addTrainerTemplateExercises(data)).resolves.toEqual({
      ok: true,
      exercises: [{ id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', exerciseId: selectedExerciseId, orderIndex: 2 }],
    })
  })

  it('accepts a normalized workout UUID returned for an uppercase workout identifier', async () => {
    const selectedWorkoutId = 'abcdefab-cdef-4abc-8abc-abcdefabcdef'
    const supabase = supabaseFixture({ rpcData: {
      templateWorkoutId: selectedWorkoutId,
      exercises: [{ id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', exerciseId: ids.exercise, orderIndex: 2 }],
    } })
    requireActiveTrainerContext.mockResolvedValue({ user: { id: 'trainer-user-1' }, supabase })
    const { addTrainerTemplateExercises } = await import('../trainerPrograms')
    const data = form({ templateWorkoutId: selectedWorkoutId.toUpperCase() })
    data.append('exerciseId', ids.exercise)

    await expect(addTrainerTemplateExercises(data)).resolves.toMatchObject({ ok: true })
    expect(revalidatePath).toHaveBeenCalledWith(`/coach/programs/${ids.template}`)
  })

  it('rejects mixed-case aliases before calling the RPC', async () => {
    const selectedExerciseId = 'abcdefab-cdef-4abc-8abc-abcdefabcdef'
    const supabase = supabaseFixture()
    requireActiveTrainerContext.mockResolvedValue({ user: { id: 'trainer-user-1' }, supabase })
    const { addTrainerTemplateExercises } = await import('../trainerPrograms')
    const data = form({ templateWorkoutId: ids.workout })
    data.append('exerciseId', selectedExerciseId)
    data.append('exerciseId', selectedExerciseId.toUpperCase())

    await expect(addTrainerTemplateExercises(data)).resolves.toMatchObject({
      ok: false,
      fieldErrors: { exerciseId: 'Selecciona entre 1 y 30 ejercicios válidos.' },
    })
    expect(supabase.rpc).not.toHaveBeenCalled()
  })

  it('updates a workout without accepting a client-owned plan order', async () => {
    const supabase = supabaseFixture()
    requireActiveTrainerContext.mockResolvedValue({ user: { id: 'trainer-user-1' }, supabase })
    const { updateTrainerTemplateWorkout } = await import('../trainerPrograms')

    await expect(updateTrainerTemplateWorkout(form({ templateWorkoutId: ids.workout, name: 'Día A', dayOfWeek: '1' }))).resolves.toEqual({ ok: true, workoutId: ids.workout })
    expect(supabase.update).toHaveBeenCalledWith({ name: 'Día A', day_of_week: 1 })
    expect(JSON.stringify(supabase.update.mock.calls)).not.toContain('order_in_plan')
  })

  it('updates an exercise without accepting a client-owned exercise order', async () => {
    const supabase = supabaseFixture()
    requireActiveTrainerContext.mockResolvedValue({ user: { id: 'trainer-user-1' }, supabase })
    const { updateTrainerTemplateExercise } = await import('../trainerPrograms')

    await expect(updateTrainerTemplateExercise(form({
      templateExerciseId: ids.exercise,
      exerciseId: ids.exercise,
      sets: '3',
      reps: '10',
      weightKg: '',
      targetRpe: '7',
      restSeconds: '60',
      notes: '',
    }))).resolves.toEqual({ ok: true, templateExerciseId: ids.exercise })
    expect(supabase.update).toHaveBeenCalledWith({ exercise_id: ids.exercise, sets: 3, reps: 10, weight_kg: null, target_rpe: 7, rest_seconds: 60, notes: null })
    expect(JSON.stringify(supabase.update.mock.calls)).not.toContain('order_index')
  })

  it('ignores malicious client order values during workout and exercise updates', async () => {
    const supabase = supabaseFixture()
    requireActiveTrainerContext.mockResolvedValue({ user: { id: 'trainer-user-1' }, supabase })
    const { updateTrainerTemplateWorkout, updateTrainerTemplateExercise } = await import('../trainerPrograms')

    await expect(updateTrainerTemplateWorkout(form({
      templateWorkoutId: ids.workout,
      name: 'Día A',
      dayOfWeek: '1',
      orderInPlan: '999',
    }))).resolves.toEqual({ ok: true, workoutId: ids.workout })
    await expect(updateTrainerTemplateExercise(form({
      templateExerciseId: ids.exercise,
      exerciseId: ids.exercise,
      sets: '3',
      reps: '10',
      weightKg: '',
      targetRpe: '7',
      restSeconds: '60',
      notes: '',
      orderIndex: '999',
    }))).resolves.toEqual({ ok: true, templateExerciseId: ids.exercise })

    expect(supabase.update).toHaveBeenNthCalledWith(1, { name: 'Día A', day_of_week: 1 })
    expect(supabase.update).toHaveBeenNthCalledWith(2, {
      exercise_id: ids.exercise,
      sets: 3,
      reps: 10,
      weight_kg: null,
      target_rpe: 7,
      rest_seconds: 60,
      notes: null,
    })
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
