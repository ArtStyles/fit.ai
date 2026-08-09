'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { generateAdjustment } from '@/lib/ai/adjustmentGenerator'
import { summarizeChanges, validateAdjustmentChanges } from '@/lib/ai/adjustments'
import { loadCoachContextText } from '@/lib/ai/coachContextLoader'
import { checkUserRateLimit, checkGlobalDailyBudget } from '@/lib/ai/rate-limits'
import type { AdjustmentChange, AdjustmentContext } from '@/lib/ai/adjustments'
import { isHealthChangeRequest } from '@/lib/ai/healthRequest'
import { findExistingPlanGeneration, generatePlan } from './generatePlan'
import type { CardioModality, PlanAdjustmentIntent } from '@/lib/training-engine'
import {
  validatePlanAdjustmentIntent,
  type PlanAdjustmentOptions,
  type PlanAdjustmentPreviewSummary,
} from '@/lib/plans/adjustmentIntent'
import { requireEditableOwnedPlan } from '@/lib/plans/editability'

export interface SuggestAdjustmentResult {
  success: boolean
  suggestion?: string
  changes?: AdjustmentChange[]
  changesSummary?: string[]
  isMock?: boolean
  error?: string
}

export interface ApplyAdjustmentResult {
  success: boolean
  appliedCount?: number
  error?: string
}

export interface SuggestPlanAdjustmentResult {
  success: boolean
  intent?: PlanAdjustmentIntent
  preview?: PlanAdjustmentPreviewSummary
  error?: string
}

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>

type WorkoutExerciseRow = {
  id: string
  sets: number | null
  reps: number | null
  target_rpe: number | null
  exercise: { name: string } | { name: string }[] | null
}

async function getOwnedActivePlan(
  supabase: SupabaseServerClient,
  userId: string,
  planId: string,
): Promise<{ id: string } | null> {
  const { data: plan } = await (supabase
    .from('workout_plans') as any)
    .select('id')
    .eq('id', planId)
    .eq('user_id', userId)
    .eq('is_active', true)
    .maybeSingle() as { data: { id: string } | null }

  if (!plan) return null
  try {
    await requireEditableOwnedPlan(supabase, userId, plan.id)
    return plan
  } catch {
    return null
  }
}

async function loadPlanAdjustmentOptions(
  supabase: SupabaseServerClient,
  userId: string,
  planId: string,
): Promise<PlanAdjustmentOptions> {
  const [profileResult, workoutsResult] = await Promise.all([
    (supabase.from('profiles') as any)
      .select('days_per_week, session_duration_minutes, available_equipment, cardio_preferences')
      .eq('id', userId)
      .single(),
    (supabase.from('workouts') as any)
      .select('id')
      .eq('plan_id', planId)
      .eq('user_id', userId),
  ])

  const profile = profileResult.data as {
    days_per_week: number | null
    session_duration_minutes: number | null
    available_equipment: string[] | null
    cardio_preferences: CardioModality[] | null
  } | null
  const workoutIds = ((workoutsResult.data ?? []) as Array<{ id: string }>).map(
    workout => workout.id,
  )
  const exerciseResult = workoutIds.length > 0
    ? await (supabase.from('workout_exercises') as any)
        .select('exercise:exercises(id, name)')
        .in('workout_id', workoutIds)
    : { data: [] }
  const relationRows = (exerciseResult.data ?? []) as Array<{
    exercise: { id: string; name: string } | Array<{ id: string; name: string }> | null
  }>
  const planExercises = new Map<string, { id: string; name: string }>()
  relationRows.forEach(row => {
    const exercise = Array.isArray(row.exercise) ? row.exercise[0] : row.exercise
    if (exercise) planExercises.set(exercise.id, exercise)
  })

  return {
    currentDaysPerWeek: profile?.days_per_week ?? 3,
    currentSessionDurationMinutes: profile?.session_duration_minutes ?? 60,
    availableEquipment: profile?.available_equipment ?? [],
    cardioPreferences: profile?.cardio_preferences ?? ['walking'],
    exercises: Array.from(planExercises.values()),
  }
}

function getExerciseName(row: WorkoutExerciseRow): string {
  if (Array.isArray(row.exercise)) return row.exercise[0]?.name ?? 'Ejercicio'
  return row.exercise?.name ?? 'Ejercicio'
}

/** Verifica propiedad del workout y plan activo. Devuelve el workout o null. */
async function getOwnedActiveWorkout(
  supabase: SupabaseServerClient,
  userId: string,
  workoutId: string,
): Promise<{ id: string; name: string; focus: string | null; plan_id: string } | null> {
  const { data: workout } = await (supabase
    .from('workouts') as any)
    .select('id, name, focus, plan_id')
    .eq('id', workoutId)
    .eq('user_id', userId)
    .maybeSingle() as {
      data: { id: string; name: string; focus: string | null; plan_id: string | null } | null
    }

  if (!workout?.plan_id) return null

  const plan = await getOwnedActivePlan(supabase, userId, workout.plan_id)

  if (!plan) return null

  return { ...workout, plan_id: workout.plan_id }
}

async function loadAdjustmentContext(
  supabase: SupabaseServerClient,
  workout: { id: string; name: string; focus: string | null },
): Promise<AdjustmentContext> {
  const { data: rows } = await (supabase
    .from('workout_exercises') as any)
    .select('id, sets, reps, target_rpe, exercise:exercises(name)')
    .eq('workout_id', workout.id)
    .order('order_index') as { data: WorkoutExerciseRow[] | null }

  return {
    workoutName: workout.name,
    workoutFocus: workout.focus,
    exercises: (rows ?? []).map(row => ({
      workoutExerciseId: row.id,
      name: getExerciseName(row),
      sets: row.sets,
      reps: row.reps,
      targetRpe: row.target_rpe,
    })),
  }
}

export async function previewStructuredPlanAdjustment(
  planId: string,
  rawIntent: unknown,
): Promise<SuggestPlanAdjustmentResult> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'No autenticado' }

  const plan = await getOwnedActivePlan(supabase, user.id, planId)
  if (!plan) return { success: false, error: 'Plan activo no encontrado' }
  try { await requireEditableOwnedPlan(supabase, user.id, plan.id) } catch { return { success: false, error: 'La rutina asignada por tu entrenador solo se puede ejecutar.' } }

  const options = await loadPlanAdjustmentOptions(supabase, user.id, plan.id)
  const intent = validatePlanAdjustmentIntent(rawIntent, options)
  if (!intent) return { success: false, error: 'El ajuste seleccionado no es válido.' }

  try {
    const preview = await generatePlan({
      mode: 'plan_adjustment',
      adjustmentIntent: intent,
      expectedParentPlanId: plan.id,
      previewOnly: true,
    })
    if (!preview.success) {
      return {
        success: false,
        error: preview.error ?? 'El motor rechazó el ajuste propuesto.',
      }
    }
    const diff = preview.previewDiff

    return {
      success: true,
      intent,
      preview: {
        daysBefore: diff?.daysBefore ?? 0,
        daysAfter: diff?.daysAfter ?? 0,
        exercisesAddedCount: diff?.exercisesAdded.length ?? 0,
        exercisesRemovedCount: diff?.exercisesRemoved.length ?? 0,
        changedPrescriptionCount: diff?.changedPrescriptionCount ?? 0,
        warnings: preview.warnings ?? [],
      },
    }
  } catch (error) {
    console.error('[adjustPlan] previewStructuredPlanAdjustment falló:', error)
    return { success: false, error: 'No se pudo validar la vista previa del ajuste.' }
  }
}

export async function applyPlanAdjustment(
  planId: string,
  rawIntent: unknown,
  requestId: string,
): Promise<ApplyAdjustmentResult> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'No autenticado' }

  try { await requireEditableOwnedPlan(supabase, user.id, planId) } catch { return { success: false, error: 'La rutina asignada por tu entrenador solo se puede ejecutar.' } }

  try {
    const existing = await findExistingPlanGeneration(requestId)
    if (existing?.success) return { success: true, appliedCount: 1 }
  } catch (error) {
    console.error('[adjustPlan] No se pudo comprobar el requestId:', error)
    throw new Error('PLAN_GENERATION_STATUS_AMBIGUOUS')
  }

  const plan = await getOwnedActivePlan(supabase, user.id, planId)
  if (!plan) return { success: false, error: 'El plan activo cambió. Vuelve a generar la vista previa.' }
  try { await requireEditableOwnedPlan(supabase, user.id, plan.id) } catch { return { success: false, error: 'La rutina asignada por tu entrenador solo se puede ejecutar.' } }

  const options = await loadPlanAdjustmentOptions(supabase, user.id, plan.id)
  const intent = validatePlanAdjustmentIntent(rawIntent, options)
  if (!intent) return { success: false, error: 'El ajuste seleccionado ya no es válido.' }

  const result = await generatePlan({
    mode: 'plan_adjustment',
    adjustmentIntent: intent,
    expectedParentPlanId: plan.id,
    previewOnly: false,
    requestId,
  })
  if (!result.success) return { success: false, error: result.error }
  revalidatePath('/plan')
  revalidatePath('/dashboard')
  return { success: true, appliedCount: 1 }
}

// ─── Sugerir ajuste ───────────────────────────────────────────────────────────

export async function suggestWorkoutAdjustment(
  workoutId: string,
  request: string,
): Promise<SuggestAdjustmentResult> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'No autenticado' }

  const trimmed = request.trim()
  if (!trimmed) return { success: false, error: 'Describe qué quieres cambiar' }

  const workout = await getOwnedActiveWorkout(supabase, user.id, workoutId)
  if (!workout) return { success: false, error: 'Entrenamiento no encontrado en tu plan activo' }
  try { await requireEditableOwnedPlan(supabase, user.id, workout.plan_id) } catch { return { success: false, error: 'La rutina asignada por tu entrenador solo se puede ejecutar.' } }

  if (isHealthChangeRequest(trimmed)) {
    return {
      success: true,
      suggestion: 'No aplicaré cambios automáticos relacionados con dolor, lesión o síntomas. Actualiza tu cribado de preparación y consulta a un profesional cualificado si la molestia persiste o empeora.',
      changes: [],
      changesSummary: [],
    }
  }

  const [userLimit, globalBudget] = await Promise.all([
    checkUserRateLimit(user.id, 'plan_adjustment'),
    checkGlobalDailyBudget(),
  ])
  if (!userLimit.allowed) return { success: false, error: userLimit.reason }
  if (!globalBudget.allowed) return { success: false, error: globalBudget.reason }

  const [context, coachContext] = await Promise.all([
    loadAdjustmentContext(supabase, workout),
    loadCoachContextText(supabase, user.id),
  ])

  if (context.exercises.length === 0) {
    return { success: false, error: 'Este entrenamiento no tiene ejercicios que ajustar' }
  }

  try {
    const result = await generateAdjustment({
      userId: user.id,
      request: trimmed,
      context,
      coachContext,
    })

    return {
      success: true,
      suggestion: result.suggestion,
      changes: result.changes,
      changesSummary: summarizeChanges(result.changes, context),
      isMock: result.isMock,
    }
  } catch (err) {
    console.error('[adjustPlan] generateAdjustment falló:', err)
    return {
      success: false,
      error: 'No se pudo generar la sugerencia. Inténtalo de nuevo en unos minutos.',
    }
  }
}

// ─── Aplicar ajuste ───────────────────────────────────────────────────────────

export async function applyWorkoutAdjustment(
  workoutId: string,
  rawChanges: AdjustmentChange[],
): Promise<ApplyAdjustmentResult> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'No autenticado' }

  const workout = await getOwnedActiveWorkout(supabase, user.id, workoutId)
  if (!workout) return { success: false, error: 'Entrenamiento no encontrado en tu plan activo' }
  try { await requireEditableOwnedPlan(supabase, user.id, workout.plan_id) } catch { return { success: false, error: 'La rutina asignada por tu entrenador solo se puede ejecutar.' } }

  const { data: exerciseRows } = await (supabase
    .from('workout_exercises') as any)
    .select('id')
    .eq('workout_id', workoutId) as { data: { id: string }[] | null }

  const validIds = new Set((exerciseRows ?? []).map(row => row.id))

  // Nunca confiamos en los cambios del cliente: se revalidan contra la DB.
  const changes = validateAdjustmentChanges(rawChanges, validIds)
  if (changes.length === 0) {
    return { success: false, error: 'No hay cambios válidos que aplicar' }
  }

  const removals = changes.filter(change => change.type === 'remove_exercise')
  if (validIds.size - removals.length < 1) {
    return { success: false, error: 'No se puede dejar el entrenamiento sin ejercicios' }
  }

  for (const change of changes) {
    if (change.type === 'remove_exercise') {
      const { error } = await (supabase
        .from('workout_exercises') as any)
        .delete()
        .eq('id', change.workoutExerciseId)
        .eq('workout_id', workoutId) as { error: { message: string } | null }

      if (error) {
        console.error('[adjustPlan] remove falló:', error)
        return { success: false, error: 'No se pudieron aplicar todos los cambios' }
      }
      continue
    }

    const update: Record<string, number> = {}
    if (change.sets !== undefined) update.sets = change.sets
    if (change.reps !== undefined) update.reps = change.reps
    if (change.targetRpe !== undefined) update.target_rpe = change.targetRpe
    if (change.restSeconds !== undefined) update.rest_seconds = change.restSeconds

    const { error } = await (supabase
      .from('workout_exercises') as any)
      .update(update)
      .eq('id', change.workoutExerciseId)
      .eq('workout_id', workoutId) as { error: { message: string } | null }

    if (error) {
      console.error('[adjustPlan] update falló:', error)
      return { success: false, error: 'No se pudieron aplicar todos los cambios' }
    }
  }

  // Reordenar tras eliminaciones para no dejar huecos en order_index.
  if (removals.length > 0) {
    const { data: remaining } = await (supabase
      .from('workout_exercises') as any)
      .select('id, order_index')
      .eq('workout_id', workoutId)
      .order('order_index', { ascending: true })
      .order('id', { ascending: true }) as { data: { id: string; order_index: number }[] | null }

    await Promise.all(
      (remaining ?? []).map((row, index) =>
        (supabase.from('workout_exercises') as any)
          .update({ order_index: index + 1 })
          .eq('id', row.id),
      ),
    )
  }

  await (supabase.from('workout_plans') as any)
    .update({
      plan_context: 'manual_update',
      manually_updated_at: new Date().toISOString(),
    })
    .eq('id', workout.plan_id)
    .eq('user_id', user.id)

  revalidatePath('/plan')
  revalidatePath('/dashboard')
  revalidatePath(`/session/${workoutId}`)

  return { success: true, appliedCount: changes.length }
}
