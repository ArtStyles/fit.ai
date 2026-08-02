'use server'

import { createClient } from '@/lib/supabase/server'
import { buildProgressionSuggestions } from '@/lib/progression'
import { detectPersonalRecord } from '@/lib/progression/records'
import { getWorkoutStartAccess } from '@/lib/workouts/access'
import { resolveUserTimeZone } from '@/lib/workouts/schedule'
import type { WorkoutStartAccessReason } from '@/lib/workouts/access'
import type { ProgressionSuggestion } from '@/lib/progression'
import type { PRRecord } from '@/lib/progression/records'
import { zipPreviousPerformanceRows } from '@/components/session/sessionViewModel'
import {
  createSessionResultSnapshot,
  parseSessionResultSnapshot,
  type SessionResultSnapshot,
} from '@/lib/session/resultSnapshot'
import {
  parseSessionContextSnapshot,
  type SessionContextSnapshotV1,
} from '@/lib/session/contextSnapshot'
import { saveSessionErrorMessage } from '@/lib/session/authorization'
import {
  MAX_SESSION_REPS,
  MAX_SESSION_WEIGHT_KG,
} from '@/lib/session/limits'

export type { PRRecord } from '@/lib/progression/records'

const ACCESS_ERROR_MESSAGES: Partial<Record<WorkoutStartAccessReason, string>> = {
  completed_today: 'Esta rutina ya fue completada hoy.',
  already_completed: 'Esta rutina ya fue registrada desde su día programado.',
  another_session_today: 'Ya registraste una sesión hoy. Máximo una sesión por día.',
}

const DEFAULT_ACCESS_ERROR =
  'Solo puedes registrar la rutina de hoy o recuperar una sesión perdida reciente.'

// Cotas de sanidad: un typo (1500 kg) contaminaría PRs y progresiones para siempre.
function findImplausibleExercise(exercises: ExercisePayload[]): string | null {
  for (const exercise of exercises) {
    for (const set of exercise.sets) {
      if (!set.completed) continue

      const weight = parseFloat(set.weightKg) || 0
      const reps = parseInt(set.reps) || 0
      const rpeInvalid = set.rpe !== null && (set.rpe < 1 || set.rpe > 10)

      if (weight > MAX_SESSION_WEIGHT_KG || reps > MAX_SESSION_REPS || rpeInvalid) {
        return exercise.name
      }
    }
  }

  return null
}

export interface SetPayload {
  weightKg: string
  reps: string
  rpe: number | null
  completed: boolean
  durationSeconds?: number
}

export interface ExercisePayload {
  workoutExerciseId: string
  exerciseId: string
  originalExerciseId?: string | null
  originalName?: string | null
  name: string
  isCompound?: boolean
  targetSets?: number | null
  targetReps?: number | null
  targetDuration?: number | null
  targetRpe?: number | null
  source?: 'planned' | 'replacement' | 'ad_hoc'
  skipReason?: string | null
  sets: SetPayload[]
  status: 'pending' | 'active' | 'completed' | 'skipped'
}

export interface SaveSessionPayload {
  clientSessionId: string
  workoutId: string
  startedAt: number
  finishedAt: number
  moodRating: number | null
  exercises: ExercisePayload[]
}

export interface SaveSessionResult {
  success: boolean
  progressLogId: string | null
  prs: PRRecord[]
  progressions: ProgressionSuggestion[]
  error?: string
}

type ExerciseMetaRow = {
  id: string
  exercise_id: string
  sets: number | null
  reps: number | null
  weight_kg: number | null
  target_rpe: number | null
  exercise: { is_compound: boolean } | { is_compound: boolean }[] | null
}

type HistoricalLogRelation = { user_id: string | null; completed_at: string | null }

type HistoricalLogRow = {
  exercise_id: string
  weights_kg: Array<number | null> | null
  reps_completed: Array<number | null> | null
  progress_log_id: string
  progress_logs: HistoricalLogRelation | HistoricalLogRelation[] | null
}

function getExerciseRelation(row: ExerciseMetaRow): { is_compound: boolean } | null {
  if (Array.isArray(row.exercise)) return row.exercise[0] ?? null
  return row.exercise
}

function getLogRelation(row: HistoricalLogRow): HistoricalLogRelation | null {
  if (Array.isArray(row.progress_logs)) return row.progress_logs[0] ?? null
  return row.progress_logs ?? null
}

function getLogCompletedAt(row: HistoricalLogRow): string {
  return getLogRelation(row)?.completed_at ?? ''
}

function isValidTimestamp(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== '' && Number.isFinite(Date.parse(value))
}

function normalizeTimestamp(value: unknown): string | null {
  if (!isValidTimestamp(value)) return null
  return new Date(value).toISOString()
}

function isStrictlyBeforeTimestamp(value: unknown, boundaryIso: string): boolean {
  if (!isValidTimestamp(value)) return false
  return Date.parse(value) < Date.parse(boundaryIso)
}

type HistoryBoundary = {
  progressLogId: string
  completedAt: string
}

function deterministicHistoryRows(
  rows: HistoricalLogRow[],
  userId: string,
  boundary: HistoryBoundary | null,
): HistoricalLogRow[] {
  return rows.filter(row => {
    const relation = getLogRelation(row)
    if (relation?.user_id !== userId) return false

    if (!boundary) return true
    if (row.progress_log_id === boundary.progressLogId) return false

    return isStrictlyBeforeTimestamp(relation.completed_at, boundary.completedAt)
  })
}

/** Peso máximo por sesión previa, de la más reciente a la más antigua. */
function recentMaxWeights(rows: HistoricalLogRow[]): number[] {
  return [...rows]
    .sort((a, b) => getLogCompletedAt(b).localeCompare(getLogCompletedAt(a)))
    .map(row => Math.max(...(row.weights_kg ?? []).map(weight => Number(weight) || 0), 0))
    .filter(weight => weight > 0)
}

function groupByExerciseId<T extends { exercise_id: string }>(rows: T[]): Record<string, T[]> {
  return rows.reduce<Record<string, T[]>>((acc, row) => {
    acc[row.exercise_id] = acc[row.exercise_id] ?? []
    acc[row.exercise_id].push(row)
    return acc
  }, {})
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

function buildExerciseLogNote(exercise: ExercisePayload): string | null {
  if (exercise.status === 'skipped' && exercise.skipReason) return `Saltado: ${exercise.skipReason}.`
  if (exercise.source === 'ad_hoc') return 'Agregado solo por hoy.'
  if (exercise.source === 'replacement' && exercise.originalName) {
    return `Cambio solo por hoy: reemplaza ${exercise.originalName}.`
  }
  return null
}

type ExerciseLogPayload = {
  exercise_id: string
  sets_completed: number
  reps_completed: number[]
  weights_kg: number[]
  rpe_values: Array<number | null>
  duration_seconds: number | null
  notes: string | null
}

type SessionOutcome = {
  prs: PRRecord[]
  progressions: ProgressionSuggestion[]
  exerciseLogs: ExerciseLogPayload[]
  contextSnapshot: SessionContextSnapshotV1 | null
}

const RESULT_RECOVERY_ERROR = 'No se pudo reconstruir el resultado guardado de la sesión.'

function snapshotToSessionOutcome(snapshot: SessionResultSnapshot): SessionOutcome {
  return {
    prs: snapshot.prs,
    progressions: snapshot.progressions,
    exerciseLogs: [],
    contextSnapshot: null,
  }
}

async function deriveSessionOutcome(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  payload: SaveSessionPayload,
  historyBoundary: HistoryBoundary | null = null,
): Promise<SessionOutcome> {
  const workoutExerciseIds = payload.exercises
    .filter(ex => (ex.source ?? 'planned') === 'planned' && isUuid(ex.workoutExerciseId))
    .map(ex => ex.workoutExerciseId)
  const exerciseIds = Array.from(new Set(payload.exercises.map(ex => ex.exerciseId)))

  let historyPromise: Promise<{ data: HistoricalLogRow[] | null }>
  if (exerciseIds.length === 0) {
    historyPromise = Promise.resolve({ data: [] })
  } else {
    let historyQuery = (supabase
      .from('exercise_logs') as any)
      .select('exercise_id, weights_kg, reps_completed, progress_log_id, progress_logs!inner(user_id, completed_at)')
      .in('exercise_id', exerciseIds)
      .eq('progress_logs.user_id', userId)

    if (historyBoundary) {
      historyQuery = historyQuery
        .neq('progress_log_id', historyBoundary.progressLogId)
        .lt('progress_logs.completed_at', historyBoundary.completedAt)
    }
    historyPromise = historyQuery as Promise<{ data: HistoricalLogRow[] | null }>
  }

  const [{ data: metaRows }, { data: historyRows }] = await Promise.all([
    workoutExerciseIds.length > 0
      ? ((supabase
          .from('workout_exercises') as any)
          .select(`
            id,
            exercise_id,
            sets,
            reps,
            weight_kg,
            target_rpe,
            exercise:exercises(is_compound)
          `)
          .in('id', workoutExerciseIds) as Promise<{ data: ExerciseMetaRow[] | null }>)
      : Promise.resolve({ data: [] as ExerciseMetaRow[] }),
    historyPromise,
  ])

  const metadataByWorkoutExercise = new Map((metaRows ?? []).map(row => [row.id, row]))
  const historyByExercise = groupByExerciseId(deterministicHistoryRows(historyRows ?? [], userId, historyBoundary))
  const exercisesWithData = payload.exercises.filter(ex =>
    ex.sets.some(set => set.completed) || (ex.status === 'skipped' && Boolean(ex.skipReason)),
  )

  const progressions = buildProgressionSuggestions(payload.exercises
    .filter(ex => ex.targetReps !== null && ex.targetReps !== undefined)
    .map(ex => {
      const meta = metadataByWorkoutExercise.get(ex.workoutExerciseId)
      const relatedExercise = meta ? getExerciseRelation(meta) : null
      const usePlanMeta = (ex.source ?? 'planned') === 'planned'

      return {
        exerciseId: ex.exerciseId,
        exerciseName: ex.name,
        isCompound: usePlanMeta ? Boolean(relatedExercise?.is_compound) : Boolean(ex.isCompound),
        targetSets: usePlanMeta ? meta?.sets ?? ex.sets.length : ex.targetSets ?? ex.sets.length,
        targetReps: usePlanMeta ? meta?.reps ?? null : ex.targetReps ?? null,
        targetRpe: usePlanMeta ? meta?.target_rpe ?? 7 : ex.targetRpe ?? 7,
        suggestedWeightKg: usePlanMeta ? meta?.weight_kg ?? null : null,
        previousLogCount: historyByExercise[ex.exerciseId]?.length ?? 0,
        recentMaxWeightsKg: recentMaxWeights(historyByExercise[ex.exerciseId] ?? []).slice(0, 3),
        status: ex.status,
        sets: ex.sets,
      }
    }))

  const exerciseLogs = exercisesWithData.map(ex => {
    const completedSets = ex.sets.filter(set => set.completed)

    return {
      exercise_id: ex.exerciseId,
      sets_completed: completedSets.length,
      reps_completed: completedSets.map(set => Math.max(0, parseInt(set.reps) || 0)),
      weights_kg: completedSets.map(set => Math.max(0, parseFloat(set.weightKg) || 0)),
      rpe_values: completedSets.map(set => set.rpe),
      duration_seconds: completedSets.reduce((total, set) => total + Math.max(0, set.durationSeconds ?? 0), 0) || null,
      notes: buildExerciseLogNote(ex),
    }
  })

  const prs: PRRecord[] = []
  for (const ex of exercisesWithData) {
    const currentSets = ex.sets
      .filter(set => set.completed)
      .map(set => ({
        weightKg: Math.max(0, parseFloat(set.weightKg) || 0),
        reps: Math.max(0, parseInt(set.reps) || 0),
      }))

    const prevLogs = historyByExercise[ex.exerciseId] ?? []
    const historySets = zipPreviousPerformanceRows(prevLogs.map(log => ({
      weightsKg: log.weights_kg,
      reps: log.reps_completed,
    }))).map(set => ({
      weightKg: Number(set.weightKg) || 0,
      reps: Number(set.reps) || 0,
    }))

    const record = detectPersonalRecord({
      exerciseName: ex.name,
      currentSets,
      historySets,
      hasHistory: prevLogs.length > 0,
    })

    if (record) prs.push(record)
  }

  return { prs, progressions, exerciseLogs, contextSnapshot: null }
}

type SessionContextPlanRelation = {
  id: unknown
  family_id: unknown
  name: unknown
  week_number: unknown
}

type SessionContextWorkoutRow = {
  id: unknown
  name: unknown
  focus: unknown
  day_of_week: unknown
  plan: SessionContextPlanRelation | SessionContextPlanRelation[] | null
}

type SessionContextExerciseRelation = {
  name: unknown
  name_es: unknown
  muscle_groups: unknown
  muscle_groups_es: unknown
  is_compound: unknown
}

type SessionContextExerciseRow = {
  exercise_id: unknown
  order_index: unknown
  exercise: SessionContextExerciseRelation | SessionContextExerciseRelation[] | null
}

function getSessionContextRelation<T>(value: T | T[] | null): T | null {
  return Array.isArray(value) ? value[0] ?? null : value
}

async function deriveSessionContextSnapshot(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  workoutId: string,
): Promise<SessionContextSnapshotV1 | null> {
  const [{ data: workout }, { data: exerciseRows }] = await Promise.all([
    (supabase
      .from('workouts') as any)
      .select('id, name, focus, day_of_week, plan:workout_plans(id, family_id, name, week_number)')
      .eq('id', workoutId)
      .eq('user_id', userId)
      .maybeSingle() as Promise<{ data: SessionContextWorkoutRow | null }>,
    (supabase
      .from('workout_exercises') as any)
      .select('exercise_id, order_index, exercise:exercises(name, name_es, muscle_groups, muscle_groups_es, is_compound)')
      .eq('workout_id', workoutId)
      .order('order_index', { ascending: true }) as Promise<{ data: SessionContextExerciseRow[] | null }>,
  ])

  if (!workout) return null

  const plan = getSessionContextRelation(workout.plan)
  const candidate = {
    version: 1,
    workout: {
      id: workout.id,
      name: workout.name,
      focus: workout.focus,
      dayOfWeek: workout.day_of_week,
    },
    plan: plan
      ? {
          id: plan.id,
          familyId: plan.family_id,
          name: plan.name,
          weekNumber: plan.week_number,
        }
      : null,
    exercises: (exerciseRows ?? []).map(row => {
      const exercise = getSessionContextRelation(row.exercise)
      return {
        exerciseId: row.exercise_id,
        name: exercise?.name,
        nameEs: exercise?.name_es ?? null,
        muscleGroups: exercise?.muscle_groups,
        muscleGroupsEs: exercise?.muscle_groups_es ?? [],
        isCompound: exercise?.is_compound,
      }
    }),
  }

  return parseSessionContextSnapshot(candidate)
}

async function updateActivePlanTargets(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  workoutId: string,
  progressions: ProgressionSuggestion[],
) {
  const persistableProgressions = progressions.filter(suggestion =>
    suggestion.confidence !== 'low' &&
    (suggestion.progressionType === 'reps'
      ? suggestion.nextTargetReps !== null
      : suggestion.nextWeightKg !== null),
  )

  if (persistableProgressions.length === 0) return

  const { data: workoutRow } = await (supabase
    .from('workouts') as any)
    .select('plan_id')
    .eq('id', workoutId)
    .maybeSingle() as { data: { plan_id: string | null } | null }

  if (!workoutRow?.plan_id) return

  const { data: activePlan } = await (supabase
    .from('workout_plans') as any)
    .select('id')
    .eq('id', workoutRow.plan_id)
    .eq('user_id', userId)
    .eq('is_active', true)
    .maybeSingle() as { data: { id: string } | null }

  if (!activePlan) return

  const { data: planWorkouts } = await (supabase
    .from('workouts') as any)
    .select('id')
    .eq('plan_id', activePlan.id) as { data: { id: string }[] | null }

  const planWorkoutIds = (planWorkouts ?? []).map(workout => workout.id)
  if (planWorkoutIds.length === 0) return

  for (const suggestion of persistableProgressions) {
    const update: Record<string, number | string> = {
      weight_suggestion_basis: 'based_on_previous_logs',
    }

    if (suggestion.progressionType === 'reps') {
      update.reps = suggestion.nextTargetReps!
    } else {
      update.weight_kg = suggestion.nextWeightKg!
    }

    const { error } = await (supabase
      .from('workout_exercises') as any)
      .update(update)
      .in('workout_id', planWorkoutIds)
      .eq('exercise_id', suggestion.exerciseId) as { error: { message: string } | null }

    if (error) {
      console.error('[saveSession] progression update failed:', error)
    }
  }
}

type AuthoritativeSessionRow = {
  id: string
  completed_at: unknown
  session_result_snapshot: unknown
}

type PersistedSessionRow = {
  progress_log_id: string
  inserted: boolean
  result_snapshot: unknown
}

type RecoveryResult =
  | { success: true; outcome: SessionOutcome }
  | { success: false; error: string }

async function recoverLegacySessionOutcome(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  payload: SaveSessionPayload,
  progressLogId: string,
): Promise<RecoveryResult> {
  const { data: authoritativeSession } = await (supabase
    .from('progress_logs') as any)
    .select('id, completed_at, session_result_snapshot')
    .eq('id', progressLogId)
    .eq('user_id', userId)
    .eq('client_session_id', payload.clientSessionId)
    .maybeSingle() as { data: AuthoritativeSessionRow | null }

  if (!authoritativeSession || authoritativeSession.id !== progressLogId) {
    return { success: false, error: RESULT_RECOVERY_ERROR }
  }

  const storedResult = parseSessionResultSnapshot(authoritativeSession.session_result_snapshot)
  if (storedResult) {
    return { success: true, outcome: snapshotToSessionOutcome(storedResult) }
  }

  const completedAt = normalizeTimestamp(authoritativeSession.completed_at)
  if (!completedAt) {
    return { success: false, error: RESULT_RECOVERY_ERROR }
  }

  const outcome = await deriveSessionOutcome(
    supabase,
    userId,
    payload,
    { progressLogId, completedAt },
  )
  const snapshot = parseSessionResultSnapshot(createSessionResultSnapshot(
    outcome.prs,
    outcome.progressions,
  ))

  if (!snapshot) {
    return { success: false, error: RESULT_RECOVERY_ERROR }
  }

  const { error } = await ((supabase
    .from('progress_logs') as any)
    .update({ session_result_snapshot: snapshot })
    .eq('id', progressLogId)
    .eq('user_id', userId)
    .eq('client_session_id', payload.clientSessionId)) as { error: { message: string } | null }

  if (error) {
    console.error('[saveSession] legacy result snapshot backfill failed:', error)
  }

  return {
    success: true,
    outcome: {
      ...outcome,
      prs: snapshot.prs,
      progressions: snapshot.progressions,
    },
  }
}

function isMissingAtomicSaveRpc(
  error: { code?: string | null; message: string } | null,
  rpcName: 'save_session_log_atomic_v2' | 'save_session_log_atomic',
): boolean {
  if (!error || error.code !== 'PGRST202') return false
  const escapedRpcName = rpcName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`(?:public\\.)?${escapedRpcName}(?![A-Za-z0-9_])`, 'i').test(error.message)
}

function isMissingProgressLogColumn(
  error: { message: string } | null,
  column: 'client_session_id' | 'session_result_snapshot' | 'session_context_snapshot',
): boolean {
  if (!error) return false
  return error.message.includes(column) && /column|schema cache|pgrst204/i.test(error.message)
}

function isMissingIdempotencyColumn(error: { message: string } | null): boolean {
  return isMissingProgressLogColumn(error, 'client_session_id') ||
    isMissingProgressLogColumn(error, 'session_result_snapshot')
}

async function existingPersistedSession(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  clientSessionId: string,
): Promise<PersistedSessionRow | null> {
  const { data } = await (supabase
    .from('progress_logs') as any)
    .select('id, session_result_snapshot')
    .eq('user_id', userId)
    .eq('client_session_id', clientSessionId)
    .maybeSingle() as { data: { id: string; session_result_snapshot: unknown } | null }

  if (!data) return null
  return {
    progress_log_id: data.id,
    inserted: false,
    result_snapshot: data.session_result_snapshot,
  }
}

async function persistSessionWithoutAtomicRpc({
  supabase,
  userId,
  payload,
  completedAt,
  durationMinutes,
  candidateOutcome,
  candidateSnapshot,
}: {
  supabase: Awaited<ReturnType<typeof createClient>>
  userId: string
  payload: SaveSessionPayload
  completedAt: string
  durationMinutes: number
  candidateOutcome: SessionOutcome
  candidateSnapshot: SessionResultSnapshot
}): Promise<{ data: PersistedSessionRow[] | null; error: { message: string } | null }> {
  const baseProgressLogPayload = {
    user_id: userId,
    workout_id: payload.workoutId,
    completed_at: completedAt,
    duration_minutes: durationMinutes,
    mood_rating: payload.moodRating,
  }
  const idempotentProgressLogPayload = {
    ...baseProgressLogPayload,
    client_session_id: payload.clientSessionId,
    session_result_snapshot: candidateSnapshot,
  }
  const completeProgressLogPayload = {
    ...idempotentProgressLogPayload,
    session_context_snapshot: candidateOutcome.contextSnapshot,
  }

  let { data: progressLog, error: progressError } = await (supabase
    .from('progress_logs') as any)
    .insert(completeProgressLogPayload)
    .select('id, session_result_snapshot')
    .single() as { data: { id: string; session_result_snapshot: unknown } | null; error: { message: string } | null }

  if (isMissingProgressLogColumn(progressError, 'session_context_snapshot')) {
    const contextCompatibleResult = await (supabase
      .from('progress_logs') as any)
      .insert(idempotentProgressLogPayload)
      .select('id, session_result_snapshot')
      .single() as { data: { id: string; session_result_snapshot: unknown } | null; error: { message: string } | null }

    progressLog = contextCompatibleResult.data
    progressError = contextCompatibleResult.error
  }

  if (isMissingIdempotencyColumn(progressError)) {
    const legacyResult = await (supabase
      .from('progress_logs') as any)
      .insert(baseProgressLogPayload)
      .select('id')
      .single() as { data: { id: string } | null; error: { message: string } | null }

    progressLog = legacyResult.data
      ? { id: legacyResult.data.id, session_result_snapshot: candidateSnapshot }
      : null
    progressError = legacyResult.error
  }

  if (progressError || !progressLog) {
    const existing = await existingPersistedSession(supabase, userId, payload.clientSessionId)
    if (existing) return { data: [existing], error: null }

    return {
      data: null,
      error: progressError ?? { message: 'No se pudo guardar la sesiÃ³n' },
    }
  }

  if (candidateOutcome.exerciseLogs.length > 0) {
    const { error: detailError } = await (supabase
      .from('exercise_logs') as any)
      .insert(candidateOutcome.exerciseLogs.map(log => ({
        progress_log_id: progressLog.id,
        ...log,
      }))) as { error: { message: string } | null }

    if (detailError) {
      console.error('[saveSession] legacy session detail save failed:', detailError)
      const { error: rollbackError } = await (supabase
        .from('progress_logs') as any)
        .delete()
        .eq('id', progressLog.id)
        .eq('user_id', userId) as { error: { message: string } | null }

      if (rollbackError) {
        console.error('[saveSession] legacy session rollback failed:', rollbackError)
      }

      return { data: null, error: detailError }
    }
  }

  return {
    data: [{
      progress_log_id: progressLog.id,
      inserted: true,
      result_snapshot: progressLog.session_result_snapshot ?? candidateSnapshot,
    }],
    error: null,
  }
}

export async function saveSession(
  payload: SaveSessionPayload,
): Promise<SaveSessionResult> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return { success: false, progressLogId: null, prs: [], progressions: [], error: 'No autenticado' }
  }

  const implausibleExercise = findImplausibleExercise(payload.exercises)
  if (implausibleExercise) {
    return {
      success: false,
      progressLogId: null,
      prs: [],
      progressions: [],
      error: `Valores fuera de rango. Revisa peso (máx. ${MAX_SESSION_WEIGHT_KG} kg), reps (máx. ${MAX_SESSION_REPS}) y RPE (1-10).`,
    }
  }

  if (!isUuid(payload.clientSessionId) || !isUuid(payload.workoutId)) {
    return { success: false, progressLogId: null, prs: [], progressions: [], error: 'Identificador de sesión inválido' }
  }

  const { data: existingSession } = await (supabase
    .from('progress_logs') as any)
    .select('id, workout_id, session_result_snapshot')
    .eq('user_id', user.id)
    .eq('client_session_id', payload.clientSessionId)
    .maybeSingle() as {
      data: { id: string; workout_id: string | null; session_result_snapshot: unknown } | null
    }

  if (existingSession) {
    if (existingSession.workout_id !== payload.workoutId) {
      return {
        success: false,
        progressLogId: null,
        prs: [],
        progressions: [],
        error: 'Este identificador de sesión pertenece a otro entrenamiento.',
      }
    }

    const storedResult = parseSessionResultSnapshot(existingSession.session_result_snapshot)
    const recoveredResult = storedResult
      ? { success: true as const, outcome: snapshotToSessionOutcome(storedResult) }
      : await recoverLegacySessionOutcome(supabase, user.id, payload, existingSession.id)

    if (!recoveredResult.success) {
      return {
        success: false,
        progressLogId: null,
        prs: [],
        progressions: [],
        error: recoveredResult.error,
      }
    }

    return {
      success: true,
      progressLogId: existingSession.id,
      prs: recoveredResult.outcome.prs,
      progressions: recoveredResult.outcome.progressions,
    }
  }

  const durationMinutes = Math.max(
    1,
    Math.round((payload.finishedAt - payload.startedAt) / 60_000),
  )

  const candidateOutcome = await deriveSessionOutcome(supabase, user.id, payload)
  const candidateSnapshot = createSessionResultSnapshot(
    candidateOutcome.prs,
    candidateOutcome.progressions,
  )

  const completedAt = new Date(payload.finishedAt).toISOString()
  let { data: persistedRows, error: persistenceError } = await (supabase as any).rpc(
    'save_session_log_atomic_v2',
    {
      p_client_session_id: payload.clientSessionId,
      p_workout_id: payload.workoutId,
      p_completed_at: completedAt,
      p_duration_minutes: durationMinutes,
      p_mood_rating: payload.moodRating,
      p_exercise_logs: candidateOutcome.exerciseLogs,
      p_result_snapshot: candidateSnapshot,
    },
  ) as {
    data: Array<{
      progress_log_id: string
      inserted: boolean
      result_snapshot: unknown
    }> | null
    error: { message: string } | null
  }

  if (isMissingAtomicSaveRpc(persistenceError, 'save_session_log_atomic_v2')) {
    const { data: profileRow } = await (supabase
      .from('profiles') as any)
      .select('timezone')
      .eq('id', user.id)
      .maybeSingle() as { data: { timezone: string | null } | null }

    const access = await getWorkoutStartAccess({
      supabase,
      userId: user.id,
      workoutId: payload.workoutId,
      timeZone: resolveUserTimeZone(profileRow?.timezone),
    })

    if (!access.allowed) {
      return {
        success: false,
        progressLogId: null,
        prs: [],
        progressions: [],
        error: ACCESS_ERROR_MESSAGES[access.reason] ?? DEFAULT_ACCESS_ERROR,
      }
    }

    candidateOutcome.contextSnapshot = await deriveSessionContextSnapshot(
      supabase,
      user.id,
      payload.workoutId,
    )

    const v1Result = await (supabase as any).rpc(
      'save_session_log_atomic',
      {
        p_client_session_id: payload.clientSessionId,
        p_workout_id: payload.workoutId,
        p_completed_at: completedAt,
        p_duration_minutes: durationMinutes,
        p_mood_rating: payload.moodRating,
        p_exercise_logs: candidateOutcome.exerciseLogs,
        p_result_snapshot: candidateSnapshot,
      },
    ) as {
      data: PersistedSessionRow[] | null
      error: { message: string } | null
    }

    persistedRows = v1Result.data
    persistenceError = v1Result.error

    if (isMissingAtomicSaveRpc(persistenceError, 'save_session_log_atomic')) {
      const fallback = await persistSessionWithoutAtomicRpc({
        supabase,
        userId: user.id,
        payload,
        completedAt,
        durationMinutes,
        candidateOutcome,
        candidateSnapshot,
      })
      persistedRows = fallback.data
      persistenceError = fallback.error
    }
  }

  const persisted = persistedRows?.[0]
  if (persistenceError || !persisted) {
    console.error('[saveSession] atomic session save failed:', persistenceError)
    return {
      success: false,
      progressLogId: null,
      prs: [],
      progressions: [],
      error: saveSessionErrorMessage(persistenceError?.message),
    }
  }

  const storedResult = parseSessionResultSnapshot(persisted.result_snapshot)
  const recoveredResult = storedResult
    ? { success: true as const, outcome: snapshotToSessionOutcome(storedResult) }
    : await recoverLegacySessionOutcome(supabase, user.id, payload, persisted.progress_log_id)

  if (!recoveredResult.success) {
    return {
      success: false,
      progressLogId: null,
      prs: [],
      progressions: [],
      error: recoveredResult.error,
    }
  }

  if (persisted.inserted) {
    await updateActivePlanTargets(supabase, user.id, payload.workoutId, recoveredResult.outcome.progressions)
  }

  return {
    success: true,
    progressLogId: persisted.progress_log_id,
    prs: recoveredResult.outcome.prs,
    progressions: recoveredResult.outcome.progressions,
  }
}
