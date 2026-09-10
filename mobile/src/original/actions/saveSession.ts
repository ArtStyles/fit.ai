import { getLocalDateString } from '@/lib/workouts/schedule'
import { occurrenceCompleted } from '@/lib/workouts/occurrences'
import { buildProgressionSuggestions, type ProgressionSuggestion } from '@/lib/progression'
import { detectPersonalRecord, type PRRecord } from '@/lib/progression/records'
import { createSessionResultSnapshot, parseSessionResultSnapshot } from '@/lib/session/resultSnapshot'
import { parseSessionContextSnapshot } from '@/lib/session/contextSnapshot'
import { MAX_SESSION_REPS, MAX_SESSION_WEIGHT_KG } from '@/lib/session/limits'
import { mutate, rows, owner, uuid, type State, type Row } from './state'

export type { PRRecord } from '@/lib/progression/records'
export interface SetPayload { weightKg: string; reps: string; rpe: number | null; completed: boolean; durationSeconds?: number }
export interface ExercisePayload {
  workoutExerciseId: string; exerciseId: string; originalExerciseId?: string | null; originalName?: string | null; name: string; isCompound?: boolean
  targetSets?: number | null; targetReps?: number | null; targetDuration?: number | null; targetRpe?: number | null
  source?: 'planned' | 'replacement' | 'ad_hoc'; skipReason?: string | null; sets: SetPayload[]; status: 'pending' | 'active' | 'completed' | 'skipped'
}
export interface SaveSessionPayload { clientSessionId: string; workoutId: string; startedAt: number; finishedAt: number; moodRating: number | null; exercises: ExercisePayload[]; prescriptionLocked?: boolean }
export interface SaveSessionResult { success: boolean; progressLogId: string | null; prs: PRRecord[]; progressions: ProgressionSuggestion[]; error?: string }
const fail = (error: string): SaveSessionResult => ({ success: false, progressLogId: null, prs: [], progressions: [], error })
const numeric = (value: string) => value.trim() === '' ? 0 : Number(value)

export async function saveInState(state: State, payload: SaveSessionPayload, now = new Date()): Promise<SaveSessionResult> {
  if (!uuid(payload.clientSessionId) || !uuid(payload.workoutId)) return fail('Identificador de sesión inválido.')
  const existing = rows(state, 'progress_logs').find(row => row.user_id === owner(state) && row.client_session_id === payload.clientSessionId)
  if (existing) {
    if (existing.workout_id !== payload.workoutId) return fail('Este identificador de sesión pertenece a otro entrenamiento.')
    const outcome = parseSessionResultSnapshot(existing.session_result_snapshot)
    if (!outcome) return fail('No se pudo reconstruir el resultado guardado de la sesión.')
    return { success: true, progressLogId: existing.id, prs: outcome.prs, progressions: outcome.progressions }
  }
  if (!Number.isFinite(payload.startedAt) || !Number.isFinite(payload.finishedAt) || payload.finishedAt < payload.startedAt || payload.finishedAt > now.getTime() + 5 * 60_000) return fail('La fecha de finalización de esta sesión no es válida.')
  if (payload.moodRating !== null && (!Number.isInteger(payload.moodRating) || payload.moodRating < 1 || payload.moodRating > 5)) return fail('La valoración debe estar entre 1 y 5.')
  if (!Array.isArray(payload.exercises) || payload.exercises.length === 0 || payload.exercises.length > 100) return fail('La sesión no contiene ejercicios válidos.')
  const authorization = rows(state, 'session_authorizations').find(row => row.user_id === owner(state) && row.client_session_id === payload.clientSessionId && row.workout_id === payload.workoutId)
  if (!authorization || authorization.consumed_at || authorization.released_at) return fail('No se pudo validar la autorización de esta sesión. Inicia una nueva sesión.')
  if (Date.parse(authorization.expires_at) <= now.getTime()) return fail('La autorización de esta sesión expiró. Inicia una nueva sesión.')
  if (Date.parse(authorization.expires_at) < payload.finishedAt || payload.finishedAt < Date.parse(authorization.authorized_at) - 15 * 60_000) return fail('La fecha de finalización de esta sesión no es válida.')
  const context = parseSessionContextSnapshot(authorization.session_context_snapshot)
  if (!context) return fail('No se pudo recuperar el contexto original de la sesión.')
  const start = Date.parse(authorization.policy_day_start); const end = Date.parse(authorization.policy_day_end)
  const originalWindowStart = new Date(authorization.workout_window_start)
  if (!Number.isFinite(originalWindowStart.getTime())) return fail('No se pudo validar la fecha original de la sesión.')
  // Existing pre-feature leases have no exception and retain their original window.
  const occurrenceSourceDate = authorization.occurrence_source_date ?? getLocalDateString(originalWindowStart, authorization.policy_timezone)
  const occurrenceScheduledDate = authorization.occurrence_scheduled_date ?? occurrenceSourceDate
  if (!Number.isFinite(start) || !Number.isFinite(end)) return fail('No se pudo validar el día de la sesión.')
  if (rows(state, 'progress_logs').some(row => row.user_id === owner(state) && Date.parse(row.completed_at) >= start && Date.parse(row.completed_at) < end) || rows(state, 'session_authorizations').some(row => row.user_id === owner(state) && row.client_session_id !== payload.clientSessionId && row.policy_date === authorization.policy_date && row.consumed_at)) return fail('Ya registraste una sesión hoy. Máximo una sesión por día.')
  if (authorization.occurrence_source_date
    ? occurrenceCompleted({ workoutId: payload.workoutId, sourceDate: authorization.occurrence_source_date, scheduledDate: authorization.occurrence_scheduled_date }, rows(state, 'progress_logs') as any, authorization.policy_timezone)
    : rows(state, 'progress_logs').some(row => row.user_id === owner(state) && row.workout_id === payload.workoutId && Date.parse(row.completed_at) >= Date.parse(authorization.workout_window_start) && Date.parse(row.completed_at) < end)) return fail('Esta rutina ya fue completada.')
  const canonical = (authorization.prescription_snapshot ?? []) as Row[]
  const locked = context.plan?.prescriptionLocked === true
  const used = new Set<string>()
  for (const exercise of payload.exercises) {
    if (!uuid(exercise.exerciseId) || !rows(state, 'exercises').some(row => row.id === exercise.exerciseId) || used.has(exercise.workoutExerciseId)) return fail('La sesión contiene ejercicios inválidos o repetidos.')
    used.add(exercise.workoutExerciseId)
    if (!Array.isArray(exercise.sets) || exercise.sets.length > 100) return fail('Número de series inválido.')
    const planned = canonical.find(row => row.id === exercise.workoutExerciseId)
    if ((exercise.source ?? 'planned') === 'planned' && (!planned || planned.exercise_id !== exercise.exerciseId)) return fail('Un ejercicio no coincide con la rutina iniciada.')
    if (exercise.source === 'replacement' && (!planned || (exercise.originalExerciseId != null && exercise.originalExerciseId !== planned.exercise_id))) return fail('El reemplazo no coincide con el ejercicio original.')
    if (locked && (!planned || planned.exercise_id !== exercise.exerciseId || (exercise.source ?? 'planned') !== 'planned' || (!exercise.sets.some(set => set.completed) && !(exercise.status === 'skipped' && exercise.skipReason?.trim())))) return fail('La rutina profesional requiere registrar cada ejercicio o saltarlo con un motivo.')
    for (const set of exercise.sets) {
      if (!set.completed) continue
      const weight = numeric(set.weightKg); const reps = numeric(set.reps)
      if (!Number.isFinite(weight) || weight < 0 || weight > MAX_SESSION_WEIGHT_KG || !Number.isInteger(reps) || reps < 0 || reps > MAX_SESSION_REPS || (set.rpe !== null && (!Number.isFinite(set.rpe) || set.rpe < 1 || set.rpe > 10)) || (set.durationSeconds !== undefined && (!Number.isInteger(set.durationSeconds) || set.durationSeconds < 0 || set.durationSeconds > 86_400))) return fail('Valores fuera de rango. Revisa peso, repeticiones, duración y RPE (1-10).')
    }
  }
  if (locked && canonical.some(row => !used.has(row.id))) return fail('La rutina profesional no está completa.')
  if (!payload.exercises.some(exercise => exercise.sets.some(set => set.completed) || (exercise.status === 'skipped' && exercise.skipReason?.trim()))) return fail('Registra al menos una serie antes de guardar.')
  const priorParents = new Map(rows(state, 'progress_logs').filter(row => row.user_id === owner(state) && Date.parse(row.completed_at) < payload.finishedAt).map(row => [row.id, row]))
  const history = (id: string) => rows(state, 'exercise_logs').filter(row => row.exercise_id === id && priorParents.has(row.progress_log_id)).sort((a, b) => String(priorParents.get(b.progress_log_id)?.completed_at).localeCompare(String(priorParents.get(a.progress_log_id)?.completed_at)))
  const progressions = buildProgressionSuggestions(payload.exercises.filter(exercise => exercise.targetReps != null).map(exercise => {
    const meta = canonical.find(row => row.id === exercise.workoutExerciseId)
    const source = exercise.source ?? 'planned'
    const exerciseRow = rows(state, 'exercises').find(row => row.id === exercise.exerciseId)
    const logs = history(exercise.exerciseId)
    return { exerciseId: exercise.exerciseId, exerciseName: exercise.name, isCompound: source === 'planned' ? Boolean(exerciseRow?.is_compound) : Boolean(exercise.isCompound), targetSets: source === 'planned' ? meta?.sets ?? exercise.sets.length : exercise.targetSets ?? exercise.sets.length, targetReps: source === 'planned' ? meta?.reps ?? null : exercise.targetReps ?? null, targetRpe: source === 'planned' ? meta?.target_rpe ?? 7 : exercise.targetRpe ?? 7, suggestedWeightKg: source === 'planned' ? meta?.weight_kg ?? null : null, previousLogCount: logs.length, recentMaxWeightsKg: logs.map(row => Math.max(...(row.weights_kg ?? []).map(Number), 0)).filter(weight => weight > 0).slice(0, 3), status: exercise.status, sets: exercise.sets }
  }))
  const prs: PRRecord[] = []
  const id = crypto.randomUUID()
  const details = payload.exercises.filter(exercise => exercise.sets.some(set => set.completed) || (exercise.status === 'skipped' && exercise.skipReason?.trim())).map(exercise => {
    const completed = exercise.sets.filter(set => set.completed)
    const logs = history(exercise.exerciseId)
    const record = detectPersonalRecord({ exerciseName: exercise.name, currentSets: completed.map(set => ({ weightKg: numeric(set.weightKg), reps: numeric(set.reps) })), historySets: logs.flatMap(row => (row.weights_kg ?? []).map((weight: number, index: number) => ({ weightKg: Number(weight) || 0, reps: Number(row.reps_completed?.[index]) || 0 }))), hasHistory: logs.length > 0 })
    if (record) prs.push(record)
    return { id: crypto.randomUUID(), progress_log_id: id, exercise_id: exercise.exerciseId, sets_completed: completed.length, reps_completed: completed.map(set => numeric(set.reps)), weights_kg: completed.map(set => numeric(set.weightKg)), rpe_values: completed.map(set => set.rpe), duration_seconds: completed.reduce((sum, set) => sum + (set.durationSeconds ?? 0), 0) || null, skip_reason: exercise.status === 'skipped' ? exercise.skipReason?.trim() || null : null, notes: exercise.status === 'skipped' && exercise.skipReason ? `Saltado: ${exercise.skipReason}.` : exercise.source === 'ad_hoc' ? 'Agregado solo por hoy.' : exercise.source === 'replacement' && exercise.originalName ? `Cambio solo por hoy: reemplaza ${exercise.originalName}.` : null }
  })
  rows(state, 'progress_logs').push({ occurrence_source_date: occurrenceSourceDate, occurrence_scheduled_date: occurrenceScheduledDate, id, user_id: owner(state), client_session_id: payload.clientSessionId, workout_id: payload.workoutId, completed_at: new Date(payload.finishedAt).toISOString(), duration_minutes: Math.max(1, Math.round((payload.finishedAt - payload.startedAt) / 60_000)), mood_rating: payload.moodRating, session_context_snapshot: context, session_result_snapshot: createSessionResultSnapshot(prs, progressions), session_detail_backup: details.map(({ id: _id, progress_log_id: _parent, ...detail }) => detail), mobile_session_payload: structuredClone(payload) })
  rows(state, 'exercise_logs').push(...details)
  authorization.consumed_at = now.toISOString()
  const active = rows(state, 'workout_plans').find(row => row.id === context.plan?.id && row.user_id === owner(state) && row.is_active && !row.prescription_locked)
  if (active) {
    const workoutIds = new Set(rows(state, 'workouts').filter(row => row.plan_id === active.id).map(row => row.id))
    for (const suggestion of progressions) {
      if (suggestion.confidence === 'low') continue
      const value = suggestion.progressionType === 'reps' ? suggestion.nextTargetReps : suggestion.nextWeightKg
      if (value == null) continue
      rows(state, 'workout_exercises').filter(row => workoutIds.has(row.workout_id) && row.exercise_id === suggestion.exerciseId).forEach(row => { row[suggestion.progressionType === 'reps' ? 'reps' : 'weight_kg'] = value; row.weight_suggestion_basis = 'based_on_previous_logs' })
    }
  }
  return { success: true, progressLogId: id, prs, progressions }
}
export async function saveSession(payload: SaveSessionPayload): Promise<SaveSessionResult> {
  try { return await mutate(state => saveInState(state, payload)) } catch { return fail('No se pudo guardar la sesión en este dispositivo. Conservamos el borrador para reintentar.') }
}
