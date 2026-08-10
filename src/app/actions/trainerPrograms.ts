'use server'

import { revalidatePath } from 'next/cache'
import { requireActiveTrainerContext } from '@/lib/coaching/access'

type FieldErrors = Record<string, string>
type Failure = { ok: false; error: string; fieldErrors?: FieldErrors }
type IdResult = { ok: true; templateId: string } | Failure
type WorkoutResult = { ok: true; workoutId: string } | Failure
type ExerciseResult = { ok: true; templateExerciseId: string } | Failure
type ChangeResult = { ok: true } | Failure

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
  const workouts = context.supabase.from('trainer_template_workouts') as any
  const { data, error } = await workouts.select('id, template_id, trainer_program_templates!inner(trainer_user_id)').eq('id', workoutId).eq('trainer_program_templates.trainer_user_id', context.user.id).maybeSingle()
  if (error) return { ok: false as const, result: failure({}, 'No se pudo verificar el entrenamiento.') }
  if (!data) return { ok: false as const, result: failure({}, 'No tienes permiso para modificar este entrenamiento.') }
  return { ok: true as const, workoutId, templateId: data.template_id as string }
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

function workoutInput(formData: FormData) {
  const errors: FieldErrors = {}
  const name = value(formData, 'name')
  if (!name || name.length > 120) errors.name = 'El nombre debe tener entre 1 y 120 caracteres.'
  const day_of_week = parseInteger(formData, 'dayOfWeek', 1, 7, errors)
  const order_in_plan = parseInteger(formData, 'orderInPlan', 1, 7, errors)
  return Object.keys(errors).length ? { ok: false as const, result: failure(errors) } : { ok: true as const, value: { name, day_of_week: day_of_week!, order_in_plan: order_in_plan! } }
}

function exerciseInput(formData: FormData) {
  const errors: FieldErrors = {}
  const exercise_id = value(formData, 'exerciseId')
  if (!validUuid(exercise_id)) errors.exerciseId = 'Selecciona un ejercicio válido.'
  const order_index = parseInteger(formData, 'orderIndex', 1, 30, errors)
  const sets = parseInteger(formData, 'sets', 1, 20, errors)
  const reps = parseInteger(formData, 'reps', 1, 100, errors)
  const weight_kg = parseNullableNumber(formData, 'weightKg', 0, 1000, errors)
  const target_rpe = parseNullableNumber(formData, 'targetRpe', 1, 10, errors)
  const rest_seconds = parseInteger(formData, 'restSeconds', 0, 3600, errors)
  const notes = nullableText(formData, 'notes', 1000, errors)
  return Object.keys(errors).length ? { ok: false as const, result: failure(errors) } : {
    ok: true as const,
    value: { exercise_id, order_index: order_index!, sets: sets!, reps: reps!, weight_kg, target_rpe, rest_seconds: rest_seconds!, notes },
  }
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
  const parsed = workoutInput(formData)
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
  const parsed = workoutInput(formData)
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
  const parsed = exerciseInput(formData)
  if (!parsed.ok) return parsed.result
  const ownership = await ownedWorkout(context, value(formData, 'templateWorkoutId'))
  if (!ownership.ok) return ownership.result
  const { data: exercise, error: exerciseError } = await (context.supabase.from('exercises') as any).select('id').eq('id', parsed.value.exercise_id).maybeSingle()
  if (exerciseError || !exercise) return failure({ exerciseId: 'El ejercicio seleccionado ya no está disponible.' })
  const { data, error } = await (context.supabase.from('trainer_template_exercises') as any)
    .insert({ ...parsed.value, template_workout_id: ownership.workoutId }).select('id').single()
  if (error || !data?.id) return failure({}, 'No se pudo agregar el ejercicio. Revisa el orden indicado.')
  revalidatePrograms()
  return { ok: true, templateExerciseId: data.id }
}

export async function updateTrainerTemplateExercise(formData: FormData): Promise<ExerciseResult> {
  const context = await requireActiveTrainerContext()
  const parsed = exerciseInput(formData)
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
  if (error || !data?.id) return failure({}, 'No se pudo guardar el ejercicio. Revisa el orden indicado.')
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
