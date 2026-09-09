import { validatePlanAdjustmentIntent, type PlanAdjustmentOptions, type PlanAdjustmentPreviewSummary } from '@/lib/plans/adjustmentIntent'
import { validateAdjustmentChanges, summarizeChanges, type AdjustmentChange, type AdjustmentContext } from '@/lib/ai/adjustments'
import { isHealthChangeRequest } from '@/lib/ai/healthRequest'
import type { PlanAdjustmentIntent } from '@/lib/training-engine'
import { generateInState } from './generatePlan'
import { read, mutate, rows, profile, ownedPlan, ownedWorkout, touch, owner, type State } from './state'
export interface SuggestAdjustmentResult { success: boolean; suggestion?: string; changes?: AdjustmentChange[]; changesSummary?: string[]; isMock?: boolean; error?: string }
export interface ApplyAdjustmentResult { success: boolean; appliedCount?: number; error?: string }
export interface SuggestPlanAdjustmentResult { success: boolean; intent?: PlanAdjustmentIntent; preview?: PlanAdjustmentPreviewSummary; error?: string }
function optionsForPlan(state: State, planId: string): PlanAdjustmentOptions {
  const plan = ownedPlan(state, planId, true)
  if (!plan.is_active) throw new Error('El plan activo cambió. Vuelve a generar la vista previa.')
  const user = profile(state)
  const workouts = rows(state, 'workouts').filter(row => row.plan_id === planId && row.user_id === owner(state)).sort((a, b) => a.order_in_plan - b.order_in_plan)
  const workoutIds = new Set(workouts.map(row => row.id))
  const exerciseIds = new Set(rows(state, 'workout_exercises').filter(row => workoutIds.has(row.workout_id)).map(row => row.exercise_id))
  return { currentDaysPerWeek: user.days_per_week ?? 3, currentSessionDurationMinutes: user.session_duration_minutes ?? 60, availableEquipment: user.available_equipment ?? [], cardioPreferences: user.cardio_preferences ?? ['walking'], currentWorkoutDays: workouts.flatMap(row => row.day_of_week == null ? [] : [row.day_of_week]), exercises: rows(state, 'exercises').filter(row => exerciseIds.has(row.id)).map(row => ({ id: row.id, name: row.name })) }
}
export async function previewStructuredPlanAdjustment(planId: string, rawIntent: unknown): Promise<SuggestPlanAdjustmentResult> {
  try {
    const state = await read(); const options = optionsForPlan(state, planId); const intent = validatePlanAdjustmentIntent(rawIntent, options)
    if (!intent) return { success: false, error: 'El ajuste seleccionado no es válido.' }
    const bound = { ...intent, expectedCurrentWorkoutDays: [...(options.currentWorkoutDays ?? [])] }
    const result = await generateInState(state, { mode: 'plan_adjustment', adjustmentIntent: bound, expectedParentPlanId: planId, previewOnly: true })
    if (!result.success) return { success: false, error: result.error }
    const diff = result.previewDiff
    return { success: true, intent: bound, preview: { daysBefore: diff?.daysBefore ?? 0, daysAfter: diff?.daysAfter ?? 0, exercisesAddedCount: diff?.exercisesAdded.length ?? 0, exercisesRemovedCount: diff?.exercisesRemoved.length ?? 0, changedPrescriptionCount: diff?.changedPrescriptionCount ?? 0, warnings: result.warnings ?? [], workoutDays: result.workoutDays ?? [] } }
  } catch { return { success: false, error: 'No se pudo validar el ajuste del plan activo.' } }
}
export async function applyPlanAdjustment(planId: string, rawIntent: unknown, requestId: string): Promise<ApplyAdjustmentResult> {
  try {
    return await mutate(async state => {
      const existing = rows(state, 'workout_plans').find(row => row.user_id === owner(state) && row.generation_request_id === requestId)
      if (existing) return { success: true, appliedCount: 1 }
      const intent = validatePlanAdjustmentIntent(rawIntent, optionsForPlan(state, planId))
      if (!intent) return { success: false, error: 'El ajuste seleccionado ya no es válido.' }
      const result = await generateInState(state, { mode: 'plan_adjustment', adjustmentIntent: intent, expectedParentPlanId: planId, requestId })
      return result.success ? { success: true, appliedCount: 1 } : { success: false, error: result.error }
    })
  } catch { return { success: false, error: 'No se pudo guardar el ajuste.' } }
}
function workoutContext(state: State, workoutId: string): AdjustmentContext {
  const workout = ownedWorkout(state, workoutId); const plan = ownedPlan(state, workout.plan_id, true)
  if (!plan.is_active) throw new Error('Entrenamiento no encontrado en tu plan activo')
  return { workoutName: workout.name, workoutFocus: workout.focus, exercises: rows(state, 'workout_exercises').filter(row => row.workout_id === workoutId).sort((a, b) => a.order_index - b.order_index).map(row => ({ workoutExerciseId: row.id, name: rows(state, 'exercises').find(item => item.id === row.exercise_id)?.name ?? 'Ejercicio', sets: row.sets, reps: row.reps, targetRpe: row.target_rpe })) }
}
export async function suggestWorkoutAdjustment(workoutId: string, request: string): Promise<SuggestAdjustmentResult> {
  if (!request.trim()) return { success: false, error: 'Describe qué quieres cambiar' }
  try {
    const context = workoutContext(await read(), workoutId)
    if (context.exercises.length === 0) return { success: false, error: 'Este entrenamiento no tiene ejercicios que ajustar' }
    if (isHealthChangeRequest(request)) return { success: true, suggestion: 'No aplicaré cambios automáticos relacionados con dolor, lesión o síntomas. Actualiza tu cribado de preparación y consulta a un profesional cualificado si la molestia persiste o empeora.', changes: [], changesSummary: [] }
    const { mockAdjustmentSuggestion } = await import('@/lib/ai/mock-adjustmentGenerator')
    const result = await mockAdjustmentSuggestion(request, context)
    return { success: true, suggestion: result.suggestion, changes: result.changes, changesSummary: summarizeChanges(result.changes, context), isMock: true }
  } catch { return { success: false, error: 'No se pudo preparar el ajuste de tu rutina personal.' } }
}
export async function applyWorkoutAdjustment(workoutId: string, rawChanges: AdjustmentChange[]): Promise<ApplyAdjustmentResult> {
  try {
    return await mutate(state => {
      const context = workoutContext(state, workoutId)
      const validIds = new Set(context.exercises.map(row => row.workoutExerciseId))
      const changes = validateAdjustmentChanges(rawChanges, validIds)
      if (!changes.length) return { success: false, error: 'No hay cambios válidos que aplicar' }
      if (validIds.size - changes.filter(change => change.type === 'remove_exercise').length < 1) return { success: false, error: 'No se puede dejar el entrenamiento sin ejercicios' }
      for (const change of changes) {
        if (change.type === 'remove_exercise') state.tables.workout_exercises = rows(state, 'workout_exercises').filter(row => row.id !== change.workoutExerciseId)
        else {
          const row = rows(state, 'workout_exercises').find(item => item.id === change.workoutExerciseId)!
          if (change.sets !== undefined) row.sets = change.sets
          if (change.reps !== undefined) row.reps = change.reps
          if (change.targetRpe !== undefined) row.target_rpe = change.targetRpe
          if (change.restSeconds !== undefined) row.rest_seconds = change.restSeconds
        }
      }
      rows(state, 'workout_exercises').filter(row => row.workout_id === workoutId).sort((a, b) => a.order_index - b.order_index).forEach((row, index) => { row.order_index = index + 1 })
      touch(ownedPlan(state, ownedWorkout(state, workoutId).plan_id, true))
      return { success: true, appliedCount: changes.length }
    })
  } catch { return { success: false, error: 'No se pudieron aplicar todos los cambios.' } }
}
