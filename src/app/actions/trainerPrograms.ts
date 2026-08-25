'use server'

import { revalidatePath } from 'next/cache'
import { requireActiveTrainerContext } from '@/lib/coaching/access'

type FieldErrors = Record<string, string>
type Failure = { ok: false; error: string; fieldErrors?: FieldErrors }
type IdResult = { ok: true; templateId: string } | Failure
type WorkoutResult = { ok: true; workoutId: string } | Failure
type ExerciseResult = { ok: true; templateExerciseId: string } | Failure
type AppendedExercise = { id: string; exerciseId: string; orderIndex: number }
type ExerciseBatchResult = { ok: true; exercises: AppendedExercise[] } | Failure
type ChangeResult = { ok: true } | Failure

const DEFAULT_TEMPLATE_PRESCRIPTION = {
  sets: 3,
  reps: 10,
  weightKg: null,
  targetRpe: 7,
  restSeconds: 60,
  notes: null,
} as const

const BATCH_ERROR_MESSAGES: Record<string, string> = {
  TRAINER_TEMPLATE_OWNER_REQUIRED: 'No tienes permiso para modificar este entrenamiento.',
  TRAINER_TEMPLATE_BATCH_INVALID: 'La selección de ejercicios no es válida.',
  TRAINER_TEMPLATE_BATCH_EXERCISE_UNAVAILABLE: 'Uno de los ejercicios ya no está disponible.',
  TRAINER_TEMPLATE_BATCH_LIMIT: 'Este día no puede superar 30 ejercicios.',
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function value(formData: FormData, field: string) {
  const candidate = formData.get(field)
  return typeof candidate === 'string' ? candidate.trim() : ''
}

function nullableText(formData: FormData, field: string, max: number, errors: FieldErrors): string | null {
  const candidate = value(formData, field)
  if (!candidate) return null
  if (candidate.length > max) errors[field] = `No puede superar ${max} caracteres.`
  return candidate || null
}

function validUuid(candidate: string) {
  return UUID.test(candidate)
}

function parseInteger(formData: FormData, field: string, min: number, max: number, errors: FieldErrors) {
  const raw = value(formData, field)
  const parsed = Number(raw)
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    errors[field] = `Usa un valor entero entre ${min} y ${max}.`
    return null
  }
  return parsed
}

function parseNullableNumber(formData: FormData, field: string, min: number, max: number, errors: FieldErrors) {
  const raw = value(formData, field)
  if (!raw) return null
  const parsed = Number(raw)
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) {
    errors[field] = `Usa un valor entre ${min} y ${max}.`
    return null
  }
  return parsed
}

function failure(fieldErrors: FieldErrors, message = 'Revisa los campos de la rutina.'): Failure {
  return { ok: false, error: message, ...(Object.keys(fieldErrors).length ? { fieldErrors } : {}) }
}

function revalidatePrograms(templateId?: string) {
  revalidatePath('/coach/programs')
  if (templateId) revalidatePath(`/coach/programs/${templateId}`)
}

async function ownedTemplate(context: Awaited<ReturnType<typeof requireActiveTrainerContext>>, templateId: string) {
  if (!validUuid(templateId)) return { ok: false as const, result: failure({ templateId: 'La rutina no es válida.' }) }
  const templates = context.supabase.from('trainer_program_templates') as any
  const { data, error } = await templates.select('id').eq('id', templateId).eq('trainer_user_id', context.user.id).maybeSingle()
  if (error) return { ok: false as const, result: failure({}, 'No se pudo verificar la rutina.') }
  if (!data) return { ok: false as const, result: failure({}, 'No tienes permiso para modificar esta rutina.') }
  return { ok: true as const, templateId }
}

async function ownedWorkout(context: Awaited<ReturnType<typeof requireActiveTrainerContext>>, workoutId: string) {
  if (!validUuid(workoutId)) return { ok: false as const, result: failure({ templateWorkoutId: 'El entrenamiento no es válido.' }) }
  const normalizedWorkoutId = workoutId.toLowerCase()
  const workouts = context.supabase.from('trainer_template_workouts') as any
  const { data, error } = await workouts.select('id, template_id, trainer_program_templates!inner(trainer_user_id)').eq('id', normalizedWorkoutId).eq('trainer_program_templates.trainer_user_id', context.user.id).maybeSingle()
  if (error) return { ok: false as const, result: failure({}, 'No se pudo verificar el entrenamiento.') }
  if (!data) return { ok: false as const, result: failure({}, 'No tienes permiso para modificar este entrenamiento.') }
  return { ok: true as const, workoutId: normalizedWorkoutId, templateId: data.template_id as string }
}

function templateInput(formData: FormData) {
  const errors: FieldErrors = {}
  const name = value(formData, 'name')
  if (!name || name.length > 120) errors.name = 'El nombre debe tener entre 1 y 120 caracteres.'
  const daysPerWeek = parseInteger(formData, 'daysPerWeek', 1, 7, errors)
  const goal = nullableText(formData, 'goal', 240, errors)
  const description = nullableText(formData, 'description', 2000, errors)
  return Object.keys(errors).length ? { ok: false as const, result: failure(errors) } : { ok: true as const, value: { name, goal, description, days_per_week: daysPerWeek! } }
}

function createWorkoutInput(formData: FormData) {
  const errors: FieldErrors = {}
  const name = value(formData, 'name')
  if (!name || name.length > 120) errors.name = 'El nombre debe tener entre 1 y 120 caracteres.'
  const day_of_week = parseInteger(formData, 'dayOfWeek', 1, 7, errors)
  const order_in_plan = parseInteger(formData, 'orderInPlan', 1, 7, errors)
  return Object.keys(errors).length ? { ok: false as const, result: failure(errors) } : { ok: true as const, value: { name, day_of_week: day_of_week!, order_in_plan: order_in_plan! } }
}

function updateWorkoutInput(formData: FormData) {
  const errors: FieldErrors = {}
  const name = value(formData, 'name')
  if (!name || name.length > 120) errors.name = 'El nombre debe tener entre 1 y 120 caracteres.'
  const day_of_week = parseInteger(formData, 'dayOfWeek', 1, 7, errors)
  return Object.keys(errors).length ? { ok: false as const, result: failure(errors) } : { ok: true as const, value: { name, day_of_week: day_of_week! } }
}

function createExerciseInput(formData: FormData) {
  const errors: FieldErrors = {}
  const exercise_id = value(formData, 'exerciseId')
  if (!validUuid(exercise_id)) errors.exerciseId = 'Selecciona un ejercicio válido.'
  const sets = parseInteger(formData, 'sets', 1, 20, errors)
  const reps = parseInteger(formData, 'reps', 1, 100, errors)
  const weight_kg = parseNullableNumber(formData, 'weightKg', 0, 1000, errors)
  const target_rpe = parseNullableNumber(formData, 'targetRpe', 1, 10, errors)
  const rest_seconds = parseInteger(formData, 'restSeconds', 0, 3600, errors)
  const notes = nullableText(formData, 'notes', 1000, errors)
  return Object.keys(errors).length ? { ok: false as const, result: failure(errors) } : {
    ok: true as const,
    value: { exercise_id, sets: sets!, reps: reps!, weight_kg, target_rpe, rest_seconds: rest_seconds!, notes },
  }
}

function updateExerciseInput(formData: FormData) {
  const errors: FieldErrors = {}
  const exercise_id = value(formData, 'exerciseId')
  if (!validUuid(exercise_id)) errors.exerciseId = 'Selecciona un ejercicio válido.'
  const sets = parseInteger(formData, 'sets', 1, 20, errors)
  const reps = parseInteger(formData, 'reps', 1, 100, errors)
  const weight_kg = parseNullableNumber(formData, 'weightKg', 0, 1000, errors)
  const target_rpe = parseNullableNumber(formData, 'targetRpe', 1, 10, errors)
  const rest_seconds = parseInteger(formData, 'restSeconds', 0, 3600, errors)
  const notes = nullableText(formData, 'notes', 1000, errors)
  return Object.keys(errors).length ? { ok: false as const, result: failure(errors) } : {
    ok: true as const,
    value: { exercise_id, sets: sets!, reps: reps!, weight_kg, target_rpe, rest_seconds: rest_seconds!, notes },
  }
}

function repeatedUuidValues(formData: FormData, field: string, maximum: number) {
  const ids = formData.getAll(field)
    .filter((candidate): candidate is string => typeof candidate === 'string')
    .map(candidate => candidate.trim().toLowerCase())
    .filter(Boolean)
  return ids.length > 0
    && ids.length <= maximum
    && new Set(ids).size === ids.length
    && ids.every(validUuid)
    ? ids
    : null
}

function batchErrorMessage(error: unknown) {
  if (!error || typeof error !== 'object') return null
  const values = Object.values(error as Record<string, unknown>).filter((value): value is string => typeof value === 'string')
  return Object.entries(BATCH_ERROR_MESSAGES).find(([code]) => values.some(value => value.includes(code)))?.[1] ?? null
}

function appendedExercises(data: unknown, workoutId: string, expectedExerciseIds: string[]): AppendedExercise[] | null {
  if (!data || typeof data !== 'object') return null
  const result = data as { templateWorkoutId?: unknown; exercises?: unknown }
  if (result.templateWorkoutId !== workoutId || !Array.isArray(result.exercises) || result.exercises.length !== expectedExerciseIds.length) return null
  const expected = new Set(expectedExerciseIds.map(exerciseId => exerciseId.toLowerCase()))
  return result.exercises.every((exercise): exercise is AppendedExercise => (
    Boolean(exercise)
    && typeof exercise === 'object'
    && validUuid((exercise as AppendedExercise).id)
    && validUuid((exercise as AppendedExercise).exerciseId)
    && expected.has((exercise as AppendedExercise).exerciseId.toLowerCase())
    && Number.isInteger((exercise as AppendedExercise).orderIndex)
    && (exercise as AppendedExercise).orderIndex >= 1
    && (exercise as AppendedExercise).orderIndex <= 30
  )) && new Set(result.exercises.map(exercise => exercise.exerciseId.toLowerCase())).size === expected.size ? result.exercises : null
}

async function appendTemplateExerciseDrafts(
  context: Awaited<ReturnType<typeof requireActiveTrainerContext>>,
  ownership: { workoutId: string; templateId: string },
  drafts: Array<{ exerciseId: string; sets: number; reps: number; weightKg: number | null; targetRpe: number | null; restSeconds: number; notes: string | null }>,
): Promise<ExerciseBatchResult> {
  const { data, error } = await (context.supabase.rpc as any)('append_trainer_template_exercises', {
    p_template_workout_id: ownership.workoutId,
    p_exercises: drafts,
  })
  if (error) return failure({}, batchErrorMessage(error) ?? 'No se pudo agregar los ejercicios.')
  const exercises = appendedExercises(data, ownership.workoutId, drafts.map(draft => draft.exerciseId))
  if (!exercises) return failure({}, 'No se pudo agregar los ejercicios.')
  revalidatePrograms(ownership.templateId)
  return { ok: true, exercises }
}

export async function createTrainerProgram(formData: FormData): Promise<IdResult> {
  const context = await requireActiveTrainerContext()
  const parsed = templateInput(formData)
  if (!parsed.ok) return parsed.result
  const { data, error } = await (context.supabase.from('trainer_program_templates') as any)
    .insert({ ...parsed.value, trainer_user_id: context.user.id, status: 'draft' }).select('id').single()
  if (error || !data?.id) return failure({}, 'No se pudo crear la rutina.')
  revalidatePrograms(data.id)
  return { ok: true, templateId: data.id }
}

export async function updateTrainerProgram(formData: FormData): Promise<IdResult> {
  const context = await requireActiveTrainerContext()
  const parsed = templateInput(formData)
  if (!parsed.ok) return parsed.result
  const ownership = await ownedTemplate(context, value(formData, 'templateId'))
  if (!ownership.ok) return ownership.result
  const { data, error } = await (context.supabase.from('trainer_program_templates') as any)
    .update(parsed.value).eq('id', ownership.templateId).eq('trainer_user_id', context.user.id).select('id').single()
  if (error || !data?.id) return failure({}, 'No se pudo guardar la rutina.')
  revalidatePrograms(ownership.templateId)
  return { ok: true, templateId: ownership.templateId }
}

export async function archiveTrainerProgram(formData: FormData): Promise<ChangeResult> {
  const context = await requireActiveTrainerContext()
  const ownership = await ownedTemplate(context, value(formData, 'templateId'))
  if (!ownership.ok) return ownership.result
  const { error } = await (context.supabase.from('trainer_program_templates') as any)
    .update({ status: 'archived' }).eq('id', ownership.templateId).eq('trainer_user_id', context.user.id)
  if (error) return failure({}, 'No se pudo archivar la rutina.')
  revalidatePrograms(ownership.templateId)
  return { ok: true }
}

export async function createTrainerTemplateWorkout(formData: FormData): Promise<WorkoutResult> {
  const context = await requireActiveTrainerContext()
  const parsed = createWorkoutInput(formData)
  if (!parsed.ok) return parsed.result
  const ownership = await ownedTemplate(context, value(formData, 'templateId'))
  if (!ownership.ok) return ownership.result
  const { data, error } = await (context.supabase.from('trainer_template_workouts') as any)
    .insert({ ...parsed.value, template_id: ownership.templateId }).select('id').single()
  if (error || !data?.id) return failure({}, 'No se pudo crear el entrenamiento. Revisa que el día y el orden no estén repetidos.')
  revalidatePrograms(ownership.templateId)
  return { ok: true, workoutId: data.id }
}

export async function updateTrainerTemplateWorkout(formData: FormData): Promise<WorkoutResult> {
  const context = await requireActiveTrainerContext()
  const parsed = updateWorkoutInput(formData)
  if (!parsed.ok) return parsed.result
  const ownership = await ownedWorkout(context, value(formData, 'templateWorkoutId'))
  if (!ownership.ok) return ownership.result
  const { data, error } = await (context.supabase.from('trainer_template_workouts') as any)
    .update(parsed.value).eq('id', ownership.workoutId).select('id').single()
  if (error || !data?.id) return failure({}, 'No se pudo guardar el entrenamiento. Revisa que el día y el orden no estén repetidos.')
  revalidatePrograms(ownership.templateId)
  return { ok: true, workoutId: ownership.workoutId }
}

export async function deleteTrainerTemplateWorkout(formData: FormData): Promise<ChangeResult> {
  const context = await requireActiveTrainerContext()
  const ownership = await ownedWorkout(context, value(formData, 'templateWorkoutId'))
  if (!ownership.ok) return ownership.result
  const { error } = await (context.supabase.from('trainer_template_workouts') as any).delete().eq('id', ownership.workoutId)
  if (error) return failure({}, 'No se pudo eliminar el entrenamiento.')
  revalidatePrograms(ownership.templateId)
  return { ok: true }
}

export async function addTrainerTemplateExercise(formData: FormData): Promise<ExerciseResult> {
  const context = await requireActiveTrainerContext()
  const parsed = createExerciseInput(formData)
  if (!parsed.ok) return parsed.result
  const ownership = await ownedWorkout(context, value(formData, 'templateWorkoutId'))
  if (!ownership.ok) return ownership.result
  const { exercise_id, sets, reps, weight_kg, target_rpe, rest_seconds, notes } = parsed.value
  const result = await appendTemplateExerciseDrafts(context, ownership, [{
    exerciseId: exercise_id,
    sets,
    reps,
    weightKg: weight_kg,
    targetRpe: target_rpe,
    restSeconds: rest_seconds,
    notes,
  }])
  if (!result.ok) return result
  return { ok: true, templateExerciseId: result.exercises[0].id }
}

export async function addTrainerTemplateExercises(formData: FormData): Promise<ExerciseBatchResult> {
  const context = await requireActiveTrainerContext()
  const ownership = await ownedWorkout(context, value(formData, 'templateWorkoutId'))
  if (!ownership.ok) return ownership.result
  const exerciseIds = repeatedUuidValues(formData, 'exerciseId', 30)
  if (!exerciseIds) return failure({ exerciseId: 'Selecciona entre 1 y 30 ejercicios válidos.' })
  return appendTemplateExerciseDrafts(context, ownership, exerciseIds.map(exerciseId => ({
    exerciseId,
    ...DEFAULT_TEMPLATE_PRESCRIPTION,
  })))
}

export async function updateTrainerTemplateExercise(formData: FormData): Promise<ExerciseResult> {
  const context = await requireActiveTrainerContext()
  const parsed = updateExerciseInput(formData)
  if (!parsed.ok) return parsed.result
  const templateExerciseId = value(formData, 'templateExerciseId')
  if (!validUuid(templateExerciseId)) return failure({ templateExerciseId: 'El ejercicio no es válido.' })
  const exercises = context.supabase.from('trainer_template_exercises') as any
  const { data: existing, error: existingError } = await exercises.select('id, trainer_template_workouts!inner(id, trainer_program_templates!inner(trainer_user_id))').eq('id', templateExerciseId).eq('trainer_template_workouts.trainer_program_templates.trainer_user_id', context.user.id).maybeSingle()
  if (existingError) return failure({}, 'No se pudo verificar el ejercicio.')
  if (!existing) return failure({}, 'No tienes permiso para modificar este ejercicio.')
  const { data: catalogExercise, error: catalogError } = await (context.supabase.from('exercises') as any).select('id').eq('id', parsed.value.exercise_id).eq('is_public', true).maybeSingle()
  if (catalogError || !catalogExercise) return failure({ exerciseId: 'El ejercicio seleccionado ya no está disponible.' })
  const { data, error } = await exercises.update(parsed.value).eq('id', templateExerciseId).select('id').single()
  if (error || !data?.id) return failure({}, 'No se pudo guardar el ejercicio.')
  revalidatePrograms()
  return { ok: true, templateExerciseId }
}

export async function deleteTrainerTemplateExercise(formData: FormData): Promise<ChangeResult> {
  const context = await requireActiveTrainerContext()
  const templateExerciseId = value(formData, 'templateExerciseId')
  if (!validUuid(templateExerciseId)) return failure({ templateExerciseId: 'El ejercicio no es válido.' })
  const exercises = context.supabase.from('trainer_template_exercises') as any
  const { data: existing, error: existingError } = await exercises.select('id, trainer_template_workouts!inner(id, trainer_program_templates!inner(trainer_user_id))').eq('id', templateExerciseId).eq('trainer_template_workouts.trainer_program_templates.trainer_user_id', context.user.id).maybeSingle()
  if (existingError) return failure({}, 'No se pudo verificar el ejercicio.')
  if (!existing) return failure({}, 'No tienes permiso para modificar este ejercicio.')
  const { error } = await exercises.delete().eq('id', templateExerciseId)
  if (error) return failure({}, 'No se pudo eliminar el ejercicio.')
  revalidatePrograms()
  return { ok: true }
}

function idsFromList(formData: FormData, field: string) {
  const ids = value(formData, field).split(',').map(item => item.trim()).filter(Boolean)
  return ids.length > 0 && new Set(ids).size === ids.length && ids.every(validUuid) ? ids : null
}

export async function reorderTrainerTemplateWorkouts(formData: FormData): Promise<ChangeResult> {
  const context = await requireActiveTrainerContext()
  const ownership = await ownedTemplate(context, value(formData, 'templateId'))
  if (!ownership.ok) return ownership.result
  const workoutIds = idsFromList(formData, 'workoutIds')
  if (!workoutIds) return failure({ workoutIds: 'El nuevo orden no es válido.' })
  const { error } = await (context.supabase.rpc as any)('reorder_trainer_template_workouts', { p_template_id: ownership.templateId, p_workout_ids: workoutIds })
  if (error) return failure({}, 'No se pudo reordenar los entrenamientos.')
  revalidatePrograms()
  return { ok: true }
}

export async function reorderTrainerTemplateExercises(formData: FormData): Promise<ChangeResult> {
  const context = await requireActiveTrainerContext()
  const ownership = await ownedWorkout(context, value(formData, 'templateWorkoutId'))
  if (!ownership.ok) return ownership.result
  const exerciseIds = idsFromList(formData, 'templateExerciseIds')
  if (!exerciseIds) return failure({ templateExerciseIds: 'El nuevo orden no es válido.' })
  const { error } = await (context.supabase.rpc as any)('reorder_trainer_template_exercises', { p_template_workout_id: ownership.workoutId, p_template_exercise_ids: exerciseIds })
  if (error) return failure({}, 'No se pudo reordenar los ejercicios.')
  revalidatePrograms()
  return { ok: true }
}
