'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { generateAdjustment } from '@/lib/ai/adjustmentGenerator'
import { summarizeChanges, validateAdjustmentChanges } from '@/lib/ai/adjustments'
import { loadCoachContextText } from '@/lib/ai/coachContextLoader'
import { checkUserRateLimit, checkGlobalDailyBudget } from '@/lib/ai/rate-limits'
import type { AdjustmentChange, AdjustmentContext } from '@/lib/ai/adjustments'
import { generatePlanAdjustmentIntent, isHealthChangeRequest } from '@/lib/ai/planAdjustmentIntent'
import { generatePlan } from './generatePlan'
import type { CardioModality, PlanAdjustmentIntent } from '@/lib/training-engine'

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
  suggestion?: string
  intent?: PlanAdjustmentIntent
  changesSummary?: string[]
  isMock?: boolean
  error?: string
  requiresReadinessReview?: boolean
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

  return plan
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

export async function suggestPlanAdjustment(
  planId: string,
  request: string,
): Promise<SuggestPlanAdjustmentResult> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'No autenticado' }
  const plan = await getOwnedActivePlan(supabase, user.id, planId)
  if (!plan) return { success: false, error: 'Plan activo no encontrado' }
  if (!request.trim()) return { success: false, error: 'Describe qué quieres cambiar' }

  const [userLimit, globalBudget, profileResult, workoutsResult] = await Promise.all([
    checkUserRateLimit(user.id, 'plan_adjustment'),
    checkGlobalDailyBudget(),
    (supabase.from('profiles') as any)
      .select('days_per_week, session_duration_minutes, available_equipment, cardio_preferences')
      .eq('id', user.id)
      .single(),
    (supabase.from('workouts') as any)
      .select('id')
      .eq('plan_id', plan.id)
      .eq('user_id', user.id),
  ])
  if (!userLimit.allowed) return { success: false, error: userLimit.reason }
  if (!globalBudget.allowed) return { success: false, error: globalBudget.reason }

  const profile = profileResult.data as {
    days_per_week: number | null
    session_duration_minutes: number | null
    available_equipment: string[]
    cardio_preferences: CardioModality[]
  } | null
  const workoutIds = ((workoutsResult.data ?? []) as Array<{ id: string }>).map(workout => workout.id)
  const exerciseResult = workoutIds.length > 0
    ? await (supabase.from('workout_exercises') as any)
        .select('exercise:exercises(id, name)')
        .in('workout_id', workoutIds)
    : { data: [] }
  const relationRows = (exerciseResult.data ?? []) as Array<{
    exercise: { id: string; name: string } | Array<{ id: string; name: string }> | null
  }>
  const planExerciseMap = new Map<string, { id: string; name: string }>()
  relationRows.forEach(row => {
    const exercise = Array.isArray(row.exercise) ? row.exercise[0] : row.exercise
    if (exercise) planExerciseMap.set(exercise.id, exercise)
  })
  const planExercises = Array.from(planExerciseMap.values())

  try {
    const interpreted = await generatePlanAdjustmentIntent({
      userId: user.id,
      request: request.trim(),
      context: {
        daysPerWeek: profile?.days_per_week ?? 3,
        sessionDurationMinutes: profile?.session_duration_minutes ?? 60,
        availableEquipment: profile?.available_equipment ?? [],
        cardioPreferences: profile?.cardio_preferences ?? ['walking'],
        exercises: planExercises,
      },
    })
    const preview = await generatePlan({
      mode: 'plan_adjustment',
      adjustmentIntent: interpreted.intent,
      previewOnly: true,
    })
    if (!preview.success) {
      return {
        success: false,
        error: preview.error ?? 'El motor rechazó el ajuste propuesto.',
        requiresReadinessReview: preview.requiresReadinessReview,
      }
    }
    const diff = preview.previewDiff
    const summary = diff ? [
      diff.daysBefore !== diff.daysAfter ? `Días semanales: ${diff.daysBefore} → ${diff.daysAfter}` : null,
      diff.exercisesAdded.length > 0 ? `${diff.exercisesAdded.length} ejercicios añadidos` : null,
      diff.exercisesRemoved.length > 0 ? `${diff.exercisesRemoved.length} ejercicios sustituidos o retirados` : null,
      diff.changedPrescriptionCount > 0 ? `${diff.changedPrescriptionCount} prescripciones ajustadas` : null,
      ...(preview.warnings ?? []),
    ].filter((value): value is string => Boolean(value)) : []

    return {
      success: true,
      suggestion: interpreted.suggestion,
      intent: interpreted.intent,
      changesSummary: summary.length > 0 ? summary : ['El plan fue recalculado y validado sin cambios estructurales importantes.'],
      isMock: interpreted.isMock,
    }
  } catch (error) {
    console.error('[adjustPlan] suggestPlanAdjustment falló:', error)
    return { success: false, error: 'No se pudo interpretar o validar el ajuste.' }
  }
}

export async function applyPlanAdjustment(
  planId: string,
  intent: PlanAdjustmentIntent,
): Promise<ApplyAdjustmentResult> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'No autenticado' }
  const plan = await getOwnedActivePlan(supabase, user.id, planId)
  if (!plan) return { success: false, error: 'El plan activo cambió. Vuelve a generar la vista previa.' }

  const result = await generatePlan({
    mode: 'plan_adjustment',
    adjustmentIntent: intent,
    previewOnly: false,
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
