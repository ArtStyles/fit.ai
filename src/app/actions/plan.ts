'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { orderedIdsToUpdates } from './plan.logic'

function asNullableString(value: FormDataEntryValue | null): string | null {
  const text = typeof value === 'string' ? value.trim() : ''
  return text.length > 0 ? text : null
}

function asPositiveInteger(value: FormDataEntryValue | null): number | null {
  const parsed = Number.parseInt(typeof value === 'string' ? value : '', 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null
}

function asIntegerInRange(
  value: FormDataEntryValue | null,
  min: number,
  max: number,
  fallback: number | null = null,
): number | null {
  const parsed = Number.parseInt(typeof value === 'string' ? value : '', 10)
  if (!Number.isFinite(parsed)) return fallback
  if (parsed < min || parsed > max) return fallback
  return parsed
}

function asNullableNumber(value: FormDataEntryValue | null): number | null {
  const parsed = Number.parseFloat(typeof value === 'string' ? value.replace(',', '.') : '')
  if (!Number.isFinite(parsed) || parsed < 0) return null
  return Math.round(parsed * 100) / 100
}

function asMoveDirection(value: FormDataEntryValue | null): 'up' | 'down' | null {
  return value === 'up' || value === 'down' ? value : null
}

async function touchManualPlan(supabase: Awaited<ReturnType<typeof createClient>>, planId: string, userId: string) {
  await (supabase.from('workout_plans') as any)
    .update({
      plan_context: 'manual_update',
      manually_updated_at: new Date().toISOString(),
    })
    .eq('id', planId)
    .eq('user_id', userId)
}

async function getOwnedWorkout(
  supabase: Awaited<ReturnType<typeof createClient>>,
  workoutId: string,
  userId: string,
) {
  const { data } = await (supabase.from('workouts') as any)
    .select('id, plan_id, user_id')
    .eq('id', workoutId)
    .eq('user_id', userId)
    .maybeSingle()

  return data as { id: string; plan_id: string | null; user_id: string } | null
}

async function getOwnedWorkoutExercise(
  supabase: Awaited<ReturnType<typeof createClient>>,
  workoutExerciseId: string,
) {
  const { data } = await (supabase.from('workout_exercises') as any)
    .select('id, workout_id, exercise_id, order_index, weight_kg')
    .eq('id', workoutExerciseId)
    .maybeSingle()

  return data as {
    id: string
    workout_id: string
    exercise_id: string
    order_index: number
    weight_kg: number | null
  } | null
}

async function exerciseExists(supabase: Awaited<ReturnType<typeof createClient>>, exerciseId: string) {
  const { data } = await (supabase.from('exercises') as any)
    .select('id')
    .eq('id', exerciseId)
    .eq('is_public', true)
    .maybeSingle()

  return Boolean(data)
}

async function normalizeWorkoutExerciseOrder(
  supabase: Awaited<ReturnType<typeof createClient>>,
  workoutId: string,
) {
  const { data } = await (supabase.from('workout_exercises') as any)
    .select('id, order_index')
    .eq('workout_id', workoutId)
    .order('order_index', { ascending: true })
    .order('id', { ascending: true })

  const rows = (data ?? []) as { id: string; order_index: number }[]

  await Promise.all(
    rows.map((row, index) =>
      (supabase.from('workout_exercises') as any)
        .update({ order_index: index + 1 })
        .eq('id', row.id),
    ),
  )
}

function revalidatePlanSurfaces(workoutId?: string | null) {
  revalidatePath('/plan')
  revalidatePath('/dashboard')
  if (workoutId) revalidatePath(`/session/${workoutId}`)
}

export async function updatePlanSummary(formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login?error=auth_required')

  const planId = asNullableString(formData.get('planId'))
  const name = asNullableString(formData.get('name'))

  if (!planId || !name) redirect('/plan?error=missing_fields')

  const { error } = await (supabase.from('workout_plans') as any)
    .update({
      name,
      description: asNullableString(formData.get('description')),
      goal: asNullableString(formData.get('goal')),
      plan_context: 'manual_update',
      manually_updated_at: new Date().toISOString(),
    })
    .eq('id', planId)
    .eq('user_id', user.id)

  if (error) redirect('/plan?error=save_failed')

  revalidatePath('/plan')
  revalidatePath('/dashboard')
  redirect('/plan?notice=plan_saved')
}

export async function updateWorkoutSummary(formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login?error=auth_required')

  const workoutId = asNullableString(formData.get('workoutId'))
  const planId = asNullableString(formData.get('planId'))
  const name = asNullableString(formData.get('name'))

  if (!workoutId || !name) redirect('/plan?error=missing_fields')

  const { error } = await (supabase.from('workouts') as any)
    .update({
      name,
      focus: asNullableString(formData.get('focus')),
      estimated_duration_minutes: asPositiveInteger(formData.get('estimatedDurationMinutes')),
    })
    .eq('id', workoutId)
    .eq('user_id', user.id)

  if (error) redirect('/plan?error=save_failed')

  if (planId) {
    await (supabase.from('workout_plans') as any)
      .update({
        plan_context: 'manual_update',
        manually_updated_at: new Date().toISOString(),
      })
      .eq('id', planId)
      .eq('user_id', user.id)
  }

  revalidatePath('/plan')
  revalidatePath('/dashboard')
  redirect('/plan?notice=workout_saved')
}

export async function addWorkoutExercise(formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login?error=auth_required')

  const planId = asNullableString(formData.get('planId'))
  const workoutId = asNullableString(formData.get('workoutId'))
  const exerciseId = asNullableString(formData.get('exerciseId'))

  if (!planId || !workoutId || !exerciseId) redirect('/plan?error=missing_fields')

  const workout = await getOwnedWorkout(supabase, workoutId, user.id)
  if (!workout || workout.plan_id !== planId) redirect('/plan?error=save_failed')

  const validExercise = await exerciseExists(supabase, exerciseId)
  if (!validExercise) redirect('/plan?error=missing_fields')

  const { data: lastExercise } = await (supabase.from('workout_exercises') as any)
    .select('order_index')
    .eq('workout_id', workoutId)
    .order('order_index', { ascending: false })
    .limit(1)
    .maybeSingle()

  const nextOrder = Number.isFinite(lastExercise?.order_index)
    ? Number(lastExercise.order_index) + 1
    : 1

  const { error } = await (supabase.from('workout_exercises') as any)
    .insert({
      workout_id: workoutId,
      exercise_id: exerciseId,
      order_index: nextOrder,
      sets: asIntegerInRange(formData.get('sets'), 1, 12, 3),
      reps: asIntegerInRange(formData.get('reps'), 1, 100, 10),
      rest_seconds: asIntegerInRange(formData.get('restSeconds'), 0, 600, 60),
      weight_kg: asNullableNumber(formData.get('weightKg')),
      target_rpe: asIntegerInRange(formData.get('targetRpe'), 1, 10, 8),
      notes: asNullableString(formData.get('notes')),
      weight_suggestion_basis: 'user_baseline_pending',
    })

  if (error) redirect('/plan?error=save_failed')

  await touchManualPlan(supabase, planId, user.id)
  revalidatePlanSurfaces(workoutId)
  redirect('/plan?notice=exercise_added')
}

export async function updateWorkoutExercise(formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login?error=auth_required')

  const planId = asNullableString(formData.get('planId'))
  const workoutExerciseId = asNullableString(formData.get('workoutExerciseId'))

  if (!planId || !workoutExerciseId) redirect('/plan?error=missing_fields')

  const row = await getOwnedWorkoutExercise(supabase, workoutExerciseId)
  if (!row) redirect('/plan?error=save_failed')

  const workout = await getOwnedWorkout(supabase, row.workout_id, user.id)
  if (!workout || workout.plan_id !== planId) redirect('/plan?error=save_failed')

  const { error } = await (supabase.from('workout_exercises') as any)
    .update({
      sets: asIntegerInRange(formData.get('sets'), 1, 12, null),
      reps: asIntegerInRange(formData.get('reps'), 1, 100, null),
      rest_seconds: asIntegerInRange(formData.get('restSeconds'), 0, 600, null),
      weight_kg: asNullableNumber(formData.get('weightKg')),
      target_rpe: asIntegerInRange(formData.get('targetRpe'), 1, 10, null),
      notes: asNullableString(formData.get('notes')),
      weight_suggestion_basis: 'user_baseline_pending',
    })
    .eq('id', workoutExerciseId)

  if (error) redirect('/plan?error=save_failed')

  await touchManualPlan(supabase, planId, user.id)
  revalidatePlanSurfaces(row.workout_id)
  redirect('/plan?notice=exercise_updated')
}

export async function replaceWorkoutExercise(formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login?error=auth_required')

  const planId = asNullableString(formData.get('planId'))
  const workoutExerciseId = asNullableString(formData.get('workoutExerciseId'))
  const exerciseId = asNullableString(formData.get('exerciseId'))

  if (!planId || !workoutExerciseId || !exerciseId) redirect('/plan?error=missing_fields')

  const row = await getOwnedWorkoutExercise(supabase, workoutExerciseId)
  if (!row) redirect('/plan?error=save_failed')

  const workout = await getOwnedWorkout(supabase, row.workout_id, user.id)
  if (!workout || workout.plan_id !== planId) redirect('/plan?error=save_failed')

  const validExercise = await exerciseExists(supabase, exerciseId)
  if (!validExercise) redirect('/plan?error=missing_fields')

  const { error } = await (supabase.from('workout_exercises') as any)
    .update({
      exercise_id: exerciseId,
      weight_kg: null,
      weight_suggestion_basis: 'user_baseline_pending',
    })
    .eq('id', workoutExerciseId)

  if (error) redirect('/plan?error=save_failed')

  await touchManualPlan(supabase, planId, user.id)
  revalidatePlanSurfaces(row.workout_id)
  redirect('/plan?notice=exercise_replaced')
}

export async function removeWorkoutExercise(formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login?error=auth_required')

  const planId = asNullableString(formData.get('planId'))
  const workoutExerciseId = asNullableString(formData.get('workoutExerciseId'))

  if (!planId || !workoutExerciseId) redirect('/plan?error=missing_fields')

  const row = await getOwnedWorkoutExercise(supabase, workoutExerciseId)
  if (!row) redirect('/plan?error=save_failed')

  const workout = await getOwnedWorkout(supabase, row.workout_id, user.id)
  if (!workout || workout.plan_id !== planId) redirect('/plan?error=save_failed')

  const { error } = await (supabase.from('workout_exercises') as any)
    .delete()
    .eq('id', workoutExerciseId)

  if (error) redirect('/plan?error=save_failed')

  await normalizeWorkoutExerciseOrder(supabase, row.workout_id)
  await touchManualPlan(supabase, planId, user.id)
  revalidatePlanSurfaces(row.workout_id)
  redirect('/plan?notice=exercise_removed')
}

export async function moveWorkoutExercise(formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login?error=auth_required')

  const planId = asNullableString(formData.get('planId'))
  const workoutExerciseId = asNullableString(formData.get('workoutExerciseId'))
  const direction = asMoveDirection(formData.get('direction'))

  if (!planId || !workoutExerciseId || !direction) redirect('/plan?error=missing_fields')

  const row = await getOwnedWorkoutExercise(supabase, workoutExerciseId)
  if (!row) redirect('/plan?error=save_failed')

  const workout = await getOwnedWorkout(supabase, row.workout_id, user.id)
  if (!workout || workout.plan_id !== planId) redirect('/plan?error=save_failed')

  const { data } = await (supabase.from('workout_exercises') as any)
    .select('id, order_index')
    .eq('workout_id', row.workout_id)
    .order('order_index', { ascending: true })
    .order('id', { ascending: true })

  const rows = ((data ?? []) as { id: string; order_index: number }[])
  const currentIndex = rows.findIndex(item => item.id === workoutExerciseId)
  const targetIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1

  if (currentIndex < 0 || targetIndex < 0 || targetIndex >= rows.length) {
    redirect('/plan?notice=exercise_moved')
  }

  const reordered = [...rows]
  const current = reordered[currentIndex]
  reordered[currentIndex] = reordered[targetIndex]
  reordered[targetIndex] = current

  const updates = await Promise.all(
    reordered.map((item, index) =>
      (supabase.from('workout_exercises') as any)
        .update({ order_index: index + 1 })
        .eq('id', item.id),
    ),
  )

  if (updates.some(result => result.error)) redirect('/plan?error=save_failed')

  await touchManualPlan(supabase, planId, user.id)
  revalidatePlanSurfaces(row.workout_id)
  redirect('/plan?notice=exercise_moved')
}

export async function reorderWorkoutExercises(
  planId: string,
  workoutId: string,
  orderedIds: string[],
): Promise<{ success: boolean }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false }

  const workout = await getOwnedWorkout(supabase, workoutId, user.id)
  if (!workout || workout.plan_id !== planId) return { success: false }

  const { data } = await (supabase.from('workout_exercises') as any)
    .select('id')
    .eq('workout_id', workoutId)

  const owned = new Set(((data ?? []) as { id: string }[]).map(r => r.id))
  if (orderedIds.length !== owned.size || !orderedIds.every(id => owned.has(id))) {
    return { success: false }
  }

  await Promise.all(
    orderedIdsToUpdates(orderedIds).map(u =>
      (supabase.from('workout_exercises') as any)
        .update({ order_index: u.order_index })
        .eq('id', u.id)
        .eq('workout_id', workoutId),
    ),
  )

  await touchManualPlan(supabase, planId, user.id)
  revalidatePlanSurfaces(workoutId)
  return { success: true }
}
