import { stateClient, rows, owner, profile, ownedPlan, checkPlanLimit, uuid, type State, type Row } from './state'
import { activateInState } from './plan'
import { TRAINING_GOALS } from '@/lib/profile/trainingPreferences'

/** Local equivalent of the existing atomic engine RPC; called within AppStore.mutate. */
export function persistEnginePlan(state: State, args: Row): string {
  if (!uuid(args.p_generation_request_id)) throw new Error('PLAN_REQUEST_INVALID')
  const prior = rows(state, 'workout_plans').find(row => row.user_id === owner(state) && row.generation_request_id === args.p_generation_request_id)
  if (prior) return prior.id
  const mode = args.p_plan_context === 'weekly_regeneration' ? 'weekly_regeneration' : args.p_plan_context === 'manual_update' ? 'plan_adjustment' : 'initial'
  const now = new Date(); let parent: Row | null = null
  if (mode !== 'initial') {
    parent = ownedPlan(state, args.p_expected_parent_plan_id, true)
    if (!parent.is_active) throw new Error('PLAN_STALE_PARENT')
  } else if (args.p_expected_parent_plan_id) throw new Error('PLAN_INITIAL_PARENT_NOT_ALLOWED')
  try { checkPlanLimit(state, parent?.family_id) } catch { throw new Error('PLAN_FAMILY_LIMIT') }
  const since = now.getTime() - (mode === 'weekly_regeneration' ? 7 : 1) * 86_400_000
  if (mode !== 'plan_adjustment' && rows(state, 'plan_generation_events').filter(row => row.user_id === owner(state) && row.mode === mode && row.generator === 'evidence_engine' && row.success && Date.parse(row.created_at) >= since).length >= (mode === 'weekly_regeneration' ? 2 : 3)) throw new Error('PLAN_RATE_LIMIT')
  const plan = args.p_plan
  if (!Array.isArray(plan?.days) || plan.days.length === 0 || plan.days.some((day: Row) => !Array.isArray(day.exercises) || day.exercises.length === 0 || day.exercises.some((exercise: Row) => !rows(state, 'exercises').some(row => row.id === exercise.exercise_id)))) throw new Error('PLAN_INVALID')
  const id = crypto.randomUUID(); const created = now.toISOString()
  rows(state, 'workout_plans').push({ id, user_id: owner(state), family_id: parent?.family_id ?? crypto.randomUUID(), name: plan.display_name, description: TRAINING_GOALS.find(option => option.value === plan.goal)?.label ?? 'Plan de entrenamiento personal', goal: TRAINING_GOALS.find(option => option.value === plan.goal)?.label ?? 'Entrenamiento personal', duration_weeks: 1, days_per_week: plan.days.length, difficulty: plan.difficulty, is_active: false, generated_by_ai: false, ai_notes: plan.ai_notes, week_number: Math.max(1, args.p_week_number), plan_context: args.p_plan_context, parent_plan_id: parent?.id ?? null, source_type: 'engine', library_slot: 'personal', generation_metadata: structuredClone(args.p_metadata ?? {}), generation_request_id: args.p_generation_request_id, prescription_locked: false, retired_at: null, superseded_at: null, created_at: created })
  for (const day of plan.days) {
    const workoutId = crypto.randomUUID()
    rows(state, 'workouts').push({ id: workoutId, user_id: owner(state), plan_id: id, name: day.display_name, focus: day.focus || null, day_of_week: day.day_of_week, order_in_plan: day.day_number, estimated_duration_minutes: day.estimated_duration_minutes, created_at: created })
    for (const exercise of day.exercises) rows(state, 'workout_exercises').push({ ...structuredClone(exercise), id: crypto.randomUUID(), workout_id: workoutId, duration_seconds: exercise.duration_seconds ?? null, weight_kg: exercise.weight_kg ?? null, notes: exercise.notes || null, created_at: created })
  }
  const allowed = ['days_per_week', 'session_duration_minutes', 'preferred_workout_days', 'available_equipment', 'cardio_preferences']
  for (const [key, value] of Object.entries(args.p_profile_updates ?? {})) if (allowed.includes(key)) profile(state)[key] = structuredClone(value)
  if (parent) { parent.is_active = false; parent.superseded_at = created }
  activateInState(state, id)
  rows(state, 'plan_generation_events').push({ id: crypto.randomUUID(), user_id: owner(state), plan_id: id, mode, generator: 'evidence_engine', success: true, created_at: created, engine_version: args.p_metadata?.engineVersion ?? null, metadata: structuredClone(args.p_metadata ?? {}) })
  return id
}
export function generationClient(state: State): any {
  return { ...stateClient(state), async rpc(name: string, args: Row) {
    try {
      if (name === 'create_engine_plan_v2') return { data: persistEnginePlan(state, args), error: null }
      if (name === 'record_plan_generation_failure') { rows(state, 'plan_generation_events').push({ id: crypto.randomUUID(), user_id: owner(state), mode: args.p_mode, engine_version: args.p_engine_version, error_code: args.p_error_code, metadata: args.p_metadata, success: false, generator: 'evidence_engine', created_at: new Date().toISOString() }); return { data: null, error: null } }
      throw new Error('PLAN_RPC_UNSUPPORTED')
    } catch (error) { return { data: null, error: { code: 'P0001', message: error instanceof Error ? error.message : 'PLAN_SAVE_FAILED' } } }
  } }
}
