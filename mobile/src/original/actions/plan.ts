import { selectedExerciseIds } from '@/app/actions/plan.logic'
import { navigate } from '../router'
import { createConnectedClient } from '../bridge-client'
import { mutate, read, rows, owner, ownedPlan, ownedWorkout, checkPlanLimit, touch, type State, type Row } from './state'

const text = (form: FormData, key: string) => typeof form.get(key) === 'string' ? String(form.get(key)).trim() || null : null
const integer = (form: FormData, key: string, min: number, max: number, fallback: number | null = null) => { const value = parseInt(text(form, key) ?? '', 10); return Number.isInteger(value) && value >= min && value <= max ? value : fallback }
const weight = (form: FormData) => { const value = parseFloat((text(form, 'weightKg') ?? '').replace(',', '.')); return Number.isFinite(value) && value >= 0 ? Math.round(value * 100) / 100 : null }
const required = (form: FormData, key: string) => { const value = text(form, key); if (!value) throw new Error('missing_fields'); return value }
function exercise(state: State, id: string) { if (!rows(state, 'exercises').some(row => row.id === id && row.is_public)) throw new Error('missing_fields') }
function workoutExercise(state: State, form: FormData): { row: Row; plan: Row; workout: Row } {
  const plan = ownedPlan(state, required(form, 'planId'), true)
  const row = rows(state, 'workout_exercises').find(item => item.id === required(form, 'workoutExerciseId'))
  if (!row) throw new Error('save_failed')
  const workout = ownedWorkout(state, row.workout_id, plan.id)
  return { row, plan, workout }
}
function reorderRows(state: State, workoutId: string) {
  return rows(state, 'workout_exercises').filter(row => row.workout_id === workoutId).sort((a, b) => a.order_index - b.order_index || a.id.localeCompare(b.id))
}
function normalize(state: State, workoutId: string) { reorderRows(state, workoutId).forEach((row, index) => { row.order_index = index + 1 }) }
async function formAction(action: (state: State) => void, notice?: string, refresh = true): Promise<void> {
  try { await mutate(action) } catch (error) { const code = error instanceof Error && ['missing_fields', 'plan_locked', 'plan_limit'].includes(error.message) ? error.message : 'save_failed'; navigate(`/plan?error=${code}`); return }
  if (notice) navigate(`/plan?notice=${notice}`)
  else if (refresh) navigate('/plan', true)
}
export function activateInState(state: State, planId: string) {
  const plan = ownedPlan(state, planId)
  rows(state, 'workout_plans').filter(row => row.user_id === owner(state)).forEach(row => { row.is_active = row.id === plan.id })
}
export function createManualInState(state: State, form: FormData) {
  checkPlanLimit(state)
  const now = new Date().toISOString(); const id = crypto.randomUUID(); const count = integer(form, 'daysPerWeek', 1, 7, 3)!
  const difficulty = text(form, 'difficulty')
  rows(state, 'workout_plans').push({ id, family_id: id, user_id: owner(state), name: text(form, 'name') ?? 'Plan manual', goal: text(form, 'goal'), difficulty: ['beginner', 'intermediate', 'advanced'].includes(difficulty ?? '') ? difficulty : null, description: null, days_per_week: count, duration_weeks: 1, week_number: 1, source_type: 'manual', library_slot: 'personal', prescription_locked: false, generated_by_ai: false, is_active: false, created_at: now, retired_at: null, superseded_at: null, plan_context: 'manual_update', ai_notes: null, generation_metadata: {}, parent_plan_id: null })
  for (let index = 0; index < count; index++) rows(state, 'workouts').push({ id: crypto.randomUUID(), plan_id: id, user_id: owner(state), name: `Sesión ${index + 1}`, day_of_week: index + 1, order_in_plan: index + 1, estimated_duration_minutes: 60, focus: null, created_at: now })
  if (form.get('makeActive') === 'on') activateInState(state, id)
  return id
}
export const activatePlan = (form: FormData) => formAction(state => activateInState(state, required(form, 'planId')), 'plan_activated')
export const createManualPlan = (form: FormData) => formAction(state => { createManualInState(state, form) }, 'manual_plan_created')
export async function deletePlan(form: FormData): Promise<void> {
  let captured: State; let plan: Row
  try { captured = await read(); plan = ownedPlan(captured, required(form, 'planId')) }
  catch { navigate('/plan?error=save_failed'); return }
  if (!plan.prescription_locked) {
    return formAction(state => {
      if (state.accountId !== captured.accountId) throw new Error('save_failed')
      const current = ownedPlan(state, plan.id, true); const now = new Date().toISOString()
      rows(state, 'workout_plans').filter(row => row.user_id === owner(state) && row.family_id === current.family_id).forEach(row => { row.retired_at = now; row.is_active = false })
    }, 'plan_retired')
  }
  let client
  try { client = await createConnectedClient(captured.accountId) }
  catch { navigate('/plan?error=connection_required'); return }
  const assignmentId = plan.trainer_assignment_id
  if (!assignmentId || !captured.remoteUserId || captured.remoteUserId !== captured.accountId) { navigate('/plan?error=connection_required'); return }
  try {
    const result = await client.rpc('remove_trainer_assignment', { p_plan_id: plan.id })
    if (result.error || result.data !== plan.id) { navigate('/plan?error=save_failed'); return }
  } catch { navigate('/plan?error=save_failed'); return }
  try {
    // The RPC has committed cancellation. Immediately block the cancelled
    // prescription locally even if downloading the exact server dates fails.
    // Keep every workout and historical log intact.
    await mutate(state => {
      if (state.accountId !== captured.accountId || state.remoteUserId !== captured.remoteUserId) throw new Error('account_changed')
      const confirmedAt = new Date().toISOString()
      for (const row of rows(state, 'workout_plans')) if (row.user_id === captured.accountId && row.trainer_assignment_id === assignmentId) {
        row.is_active = false; row.retired_at ??= confirmedAt; row.mobile_assignment_removal_confirmed_at = confirmedAt
      }
      for (const row of rows(state, 'trainer_plan_assignments')) if (row.id === assignmentId && row.client_user_id === captured.accountId) row.status = 'cancelled'
      for (const row of rows(state, 'trainer_assignment_versions')) if (row.assignment_id === assignmentId && ['proposed', 'active', 'frozen'].includes(row.status)) row.status = 'cancelled'
    })
    const [plans, assignment, versions] = await Promise.all([
      client.from('workout_plans').select('id,user_id,is_active,retired_at,superseded_at,trainer_assignment_id').eq('user_id', captured.accountId),
      client.from('trainer_plan_assignments').select('id,client_user_id,status').eq('id', assignmentId).eq('client_user_id', captured.accountId).maybeSingle(),
      client.from('trainer_assignment_versions').select('id,assignment_id,status,effective_to').eq('assignment_id', assignmentId),
    ])
    if (plans.error || assignment.error || versions.error || !Array.isArray(plans.data) || !Array.isArray(versions.data) || !assignment.data || assignment.data.id !== assignmentId || assignment.data.client_user_id !== captured.accountId || assignment.data.status !== 'cancelled') throw new Error('refresh_failed')
    if (plans.data.some(row => row.user_id !== captured.accountId) || versions.data.some(row => row.assignment_id !== assignmentId) || !plans.data.some(row => row.id === plan.id && row.trainer_assignment_id === assignmentId && row.retired_at && !row.is_active)) throw new Error('refresh_failed')
    await mutate(state => {
      if (state.accountId !== captured.accountId || state.remoteUserId !== captured.remoteUserId) throw new Error('account_changed')
      // Merge only lifecycle fields; do not overwrite unrelated offline edits.
      const remotePlans = new Map(plans.data.map(row => [row.id, row]))
      const remoteActive = plans.data.find(row => row.is_active)
      const localPlans = rows(state, 'workout_plans').filter(row => row.user_id === captured.accountId)
      const canSelectFallback = plan.is_active && !localPlans.some(row => row.is_active) && remoteActive && localPlans.some(row => row.id === remoteActive.id)
      for (const row of rows(state, 'workout_plans')) {
        if (row.user_id !== captured.accountId) continue
        const canonical = remotePlans.get(row.id)
        if (row.trainer_assignment_id === assignmentId && canonical) Object.assign(row, { retired_at: canonical.retired_at, superseded_at: canonical.superseded_at, is_active: false })
        else if (canSelectFallback) row.is_active = row.id === remoteActive.id
      }
      const currentAssignment = rows(state, 'trainer_plan_assignments').find(row => row.id === assignmentId && row.client_user_id === captured.accountId)
      if (currentAssignment) currentAssignment.status = assignment.data!.status
      for (const version of versions.data) {
        const current = rows(state, 'trainer_assignment_versions').find(row => row.id === version.id && row.assignment_id === assignmentId)
        if (current) Object.assign(current, { status: version.status, effective_to: version.effective_to })
      }
    })
  } catch { navigate('/plan?error=assignment_refresh_pending'); return }
  navigate('/plan?notice=plan_retired')
}
export const updatePlanSummary = (form: FormData) => formAction(state => {
  const plan = ownedPlan(state, required(form, 'planId'), true)
  Object.assign(plan, { name: required(form, 'name'), description: text(form, 'description'), goal: text(form, 'goal') }); touch(plan)
}, 'plan_saved')
export const updateWorkoutSummary = (form: FormData) => formAction(state => {
  const plan = ownedPlan(state, required(form, 'planId'), true); const workout = ownedWorkout(state, required(form, 'workoutId'), plan.id)
  Object.assign(workout, { name: required(form, 'name'), focus: text(form, 'focus'), estimated_duration_minutes: integer(form, 'estimatedDurationMinutes', 1, Number.MAX_SAFE_INTEGER) }); touch(plan)
})
export const addWorkoutExercise = (form: FormData) => formAction(state => {
  const plan = ownedPlan(state, required(form, 'planId'), true); const workout = ownedWorkout(state, required(form, 'workoutId'), plan.id)
  const selected = selectedExerciseIds(form); if (!selected) throw new Error('missing_fields')
  selected.forEach(id => exercise(state, id))
  const nextOrder = Math.max(0, ...reorderRows(state, workout.id).map(row => Number(row.order_index) || 0)) + 1
  selected.forEach((id, index) => rows(state, 'workout_exercises').push({ id: crypto.randomUUID(), workout_id: workout.id, exercise_id: id, order_index: nextOrder + index, sets: integer(form, 'sets', 1, 12, 3), reps: integer(form, 'reps', 1, 100, 10), duration_seconds: null, rest_seconds: integer(form, 'restSeconds', 0, 600, 60), weight_kg: weight(form), target_rpe: integer(form, 'targetRpe', 1, 10, 8), notes: text(form, 'notes'), weight_suggestion_basis: 'user_baseline_pending' }))
  touch(plan)
})
export const updateWorkoutExercise = (form: FormData) => formAction(state => {
  const { row, plan } = workoutExercise(state, form)
  Object.assign(row, { sets: integer(form, 'sets', 1, 12), reps: integer(form, 'reps', 1, 100), rest_seconds: integer(form, 'restSeconds', 0, 600), weight_kg: weight(form), target_rpe: integer(form, 'targetRpe', 1, 10), notes: text(form, 'notes'), weight_suggestion_basis: 'user_baseline_pending' }); touch(plan)
})
export const replaceWorkoutExercise = (form: FormData) => formAction(state => {
  const { row, plan } = workoutExercise(state, form); const id = required(form, 'exerciseId'); exercise(state, id)
  Object.assign(row, { exercise_id: id, weight_kg: null, weight_suggestion_basis: 'user_baseline_pending' }); touch(plan)
})
export const removeWorkoutExercise = (form: FormData) => formAction(state => {
  const { row, plan, workout } = workoutExercise(state, form)
  state.tables.workout_exercises = rows(state, 'workout_exercises').filter(item => item !== row); normalize(state, workout.id); touch(plan)
})
export function reorderInState(state: State, planId: string, workoutId: string, orderedIds: string[]): boolean {
  try { ownedPlan(state, planId, true); ownedWorkout(state, workoutId, planId) } catch { return false }
  const current = reorderRows(state, workoutId)
  if (!Array.isArray(orderedIds) || orderedIds.length !== current.length || new Set(orderedIds).size !== current.length || current.some(row => !orderedIds.includes(row.id))) return false
  orderedIds.forEach((id, index) => { current.find(row => row.id === id)!.order_index = index + 1 })
  touch(ownedPlan(state, planId, true)); return true
}
export async function reorderWorkoutExercises(planId: string, workoutId: string, orderedIds: string[]): Promise<{ success: boolean }> {
  try { return await mutate(state => ({ success: reorderInState(state, planId, workoutId, orderedIds) })) } catch { return { success: false } }
}
export const moveWorkoutExercise = (form: FormData) => formAction(state => {
  const { row, plan, workout } = workoutExercise(state, form); const direction = text(form, 'direction')
  if (direction !== 'up' && direction !== 'down') throw new Error('missing_fields')
  const ordered = reorderRows(state, workout.id).map(item => item.id); const index = ordered.indexOf(row.id); const target = index + (direction === 'up' ? -1 : 1)
  if (target < 0 || target >= ordered.length) return
  ;[ordered[index], ordered[target]] = [ordered[target], ordered[index]]
  if (!reorderInState(state, plan.id, workout.id, ordered)) throw new Error('save_failed')
})
