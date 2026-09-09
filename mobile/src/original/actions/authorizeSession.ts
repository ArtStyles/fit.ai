import { getWorkoutStartAccess } from '@/lib/workouts/access'
import { resolveUserTimeZone, getLocalDayBounds, getLocalDateString, addDays } from '@/lib/workouts/schedule'
import { parseSessionContextSnapshot, type SessionContextSnapshotV1 } from '@/lib/session/contextSnapshot'
import { mutate, read, rows, owner, profile, stateClient, uuid, type State } from './state'

export type AuthorizeSessionStartResult = { success: true; contextSnapshot: SessionContextSnapshotV1 } | { success: false; error: string }
export type ReleaseSessionAuthorizationResult = { success: true } | { success: false; error: string }

export async function verifySessionBackupOwner(workoutId: string): Promise<string | null> {
  if (!uuid(workoutId)) return null
  const state = await read()
  return rows(state, 'workouts').some(row => row.id === workoutId && row.user_id === owner(state)) ? owner(state) : null
}

export async function authorizeInState(state: State, clientSessionId: string, workoutId: string, now = new Date()): Promise<AuthorizeSessionStartResult> {
  const fail = (error: string): AuthorizeSessionStartResult => ({ success: false, error })
  if (!uuid(clientSessionId) || !uuid(workoutId)) return fail('Identificador de sesión inválido.')
  const old = rows(state, 'session_authorizations').find(row => row.client_session_id === clientSessionId && row.user_id === owner(state))
  if (old) {
    if (old.workout_id !== workoutId) return fail('Este identificador pertenece a otro entrenamiento.')
    const snapshot = parseSessionContextSnapshot(old.session_context_snapshot)
    if (snapshot && old.consumed_at && rows(state, 'progress_logs').some(row => row.user_id === owner(state) && row.workout_id === workoutId && row.client_session_id === clientSessionId)) return { success: true, contextSnapshot: snapshot }
    if (snapshot && !old.consumed_at && !old.released_at && Date.parse(old.expires_at) > now.getTime()) return { success: true, contextSnapshot: snapshot }
    return fail('La autorización de esta sesión expiró. Inicia una nueva sesión.')
  }
  const userProfile = profile(state)
  if (!['cleared', 'modified'].includes(userProfile.readiness_status)) return fail('Completa la revisión de preparación antes de entrenar.')
  const timeZone = resolveUserTimeZone(userProfile.timezone)
  const policyDate = getLocalDateString(now, timeZone)
  const access = await getWorkoutStartAccess({ supabase: stateClient(state), userId: owner(state), workoutId, date: now, timeZone })
  if (!access.allowed) return fail(access.reason === 'another_session_today' ? 'Ya registraste una sesión hoy. Máximo una sesión por día.' : ['already_completed', 'completed_today'].includes(access.reason) ? 'Esta rutina ya fue completada.' : 'Solo puedes registrar la rutina de hoy o recuperar una sesión perdida reciente.')
  const workout = rows(state, 'workouts').find(row => row.id === workoutId)!
  const plan = rows(state, 'workout_plans').find(row => row.id === workout.plan_id)!
  if (plan.retired_at || plan.superseded_at) return fail('Esta rutina ya no está disponible en tu plan activo.')
  for (const authorization of rows(state, 'session_authorizations')) {
    if (authorization.user_id !== owner(state) || authorization.policy_date !== policyDate) continue
    if (!authorization.consumed_at && !authorization.released_at && Date.parse(authorization.expires_at) <= now.getTime()) authorization.released_at = now.toISOString()
    if (authorization.consumed_at || !authorization.released_at) return fail('Ya tienes una sesión iniciada o registrada hoy. Máximo una sesión por día.')
  }
  const snapshot = parseSessionContextSnapshot({ version: 1, workout: { id: workout.id, name: workout.name, focus: workout.focus ?? null, dayOfWeek: workout.day_of_week ?? null }, plan: { id: plan.id, familyId: plan.family_id ?? plan.id, name: plan.name, weekNumber: plan.week_number ?? null, prescriptionLocked: plan.prescription_locked === true, trainerAssignmentId: plan.trainer_assignment_id ?? null, trainerAssignmentVersionId: plan.trainer_assignment_version_id ?? null }, exercises: rows(state, 'workout_exercises').filter(row => row.workout_id === workoutId).sort((a, b) => a.order_index - b.order_index).map(row => {
    const exercise = rows(state, 'exercises').find(item => item.id === row.exercise_id)
    return { exerciseId: row.exercise_id, name: exercise?.name, nameEs: exercise?.name_es ?? null, muscleGroups: exercise?.muscle_groups ?? [], muscleGroupsEs: exercise?.muscle_groups_es ?? [], isCompound: exercise?.is_compound === true }
  }) })
  if (!snapshot) return fail('No se pudo preparar la sesión. Revisa los ejercicios del plan.')
  const { start, end } = getLocalDayBounds(now, timeZone)
  const windowStart = access.window.status === 'recoverable' ? getLocalDayBounds(addDays(now, -access.window.daysLate, timeZone), timeZone).start : start
  rows(state, 'session_authorizations').push({ id: crypto.randomUUID(), user_id: owner(state), client_session_id: clientSessionId, workout_id: workoutId, plan_id: plan.id, authorized_at: now.toISOString(), created_at: now.toISOString(), expires_at: new Date(now.getTime() + 12 * 60 * 60_000).toISOString(), consumed_at: null, released_at: null, policy_timezone: timeZone, policy_date: policyDate, policy_day_start: start.toISOString(), policy_day_end: end.toISOString(), workout_window_start: windowStart.toISOString(), session_context_snapshot: snapshot, prescription_snapshot: structuredClone(rows(state, 'workout_exercises').filter(row => row.workout_id === workoutId)) })
  return { success: true, contextSnapshot: snapshot }
}
export async function authorizeSessionStart(clientSessionId: string, workoutId: string): Promise<AuthorizeSessionStartResult> {
  try { return await mutate(state => authorizeInState(state, clientSessionId, workoutId)) } catch { return { success: false, error: 'No se pudo guardar la autorización en este dispositivo.' } }
}
export async function releaseSessionAuthorization(clientSessionId: string, workoutId: string): Promise<ReleaseSessionAuthorizationResult> {
  if (!uuid(clientSessionId) || !uuid(workoutId)) return { success: false, error: 'Identificador inválido.' }
  try {
    return await mutate(state => {
      const row = rows(state, 'session_authorizations').find(item => item.client_session_id === clientSessionId && item.user_id === owner(state))
      if (row && row.workout_id !== workoutId) return { success: false, error: 'La sesión pertenece a otra rutina.' }
      if (row && !row.consumed_at && !row.released_at) row.released_at = new Date().toISOString()
      return { success: true }
    })
  } catch { return { success: false, error: 'No se pudo descartar el entrenamiento.' } }
}
