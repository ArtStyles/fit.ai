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

export type { PRRecord } from '@/lib/progression/records'

const ACCESS_ERROR_MESSAGES: Partial<Record<WorkoutStartAccessReason, string>> = {
  completed_today: 'Esta rutina ya fue completada hoy.',
  already_completed: 'Esta rutina ya fue registrada desde su día programado.',
  another_session_today: 'Ya registraste una sesión hoy. Máximo una sesión por día.',
}

const DEFAULT_ACCESS_ERROR =
  'Solo puedes registrar la rutina de hoy o recuperar una sesión perdida reciente.'

// Cotas de sanidad: un typo (1500 kg) contaminaría PRs y progresiones para siempre.
const MAX_WEIGHT_KG = 500
const MAX_REPS_PER_SET = 100

function findImplausibleExercise(exercises: ExercisePayload[]): string | null {
  for (const exercise of exercises) {
    for (const set of exercise.sets) {
      if (!set.completed) continue

      const weight = parseFloat(set.weightKg) || 0
      const reps = parseInt(set.reps) || 0
      const rpeInvalid = set.rpe !== null && (set.rpe < 1 || set.rpe > 10)

      if (weight > MAX_WEIGHT_KG || reps > MAX_REPS_PER_SET || rpeInvalid) {
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

type HistoricalLogRelation = { user_id: string; completed_at: string }

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

function getLogCompletedAt(row: HistoricalLogRow): string {
  if (Array.isArray(row.progress_logs)) return row.progress_logs[0]?.completed_at ?? ''
  return row.progress_logs?.completed_at ?? ''
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
      error: `Valores fuera de rango en "${implausibleExercise}". Revisa peso (máx. ${MAX_WEIGHT_KG} kg), reps (máx. ${MAX_REPS_PER_SET}) y RPE (1-10).`,
    }
  }

  if (!isUuid(payload.clientSessionId)) {
    return { success: false, progressLogId: null, prs: [], progressions: [], error: 'Identificador de sesión inválido' }
  }

  const { data: existingSession } = await (supabase
    .from('progress_logs') as any)
    .select('id')
    .eq('user_id', user.id)
    .eq('client_session_id', payload.clientSessionId)
    .maybeSingle() as { data: { id: string } | null }

  if (existingSession) {
    return {
      success: true,
      progressLogId: existingSession.id,
      prs: [],
      progressions: [],
    }
  }

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

  const durationMinutes = Math.max(
    1,
    Math.round((payload.finishedAt - payload.startedAt) / 60_000),
  )

  const workoutExerciseIds = payload.exercises
    .filter(ex => (ex.source ?? 'planned') === 'planned' && isUuid(ex.workoutExerciseId))
    .map(ex => ex.workoutExerciseId)
  const exerciseIds = Array.from(new Set(payload.exercises.map(ex => ex.exerciseId)))

  const [{ data: metaRows }, { data: historyRows }] = await Promise.all([
    workoutExerciseIds.length > 0
      ? (supabase
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
          .in('id', workoutExerciseIds) as Promise<{ data: ExerciseMetaRow[] | null }>
      : Promise.resolve({ data: [] as ExerciseMetaRow[] }),
    exerciseIds.length > 0
      ? (supabase
          .from('exercise_logs') as any)
          .select('exercise_id, weights_kg, reps_completed, progress_log_id, progress_logs!inner(user_id, completed_at)')
          .in('exercise_id', exerciseIds)
          .eq('progress_logs.user_id', user.id) as Promise<{ data: HistoricalLogRow[] | null }>
      : Promise.resolve({ data: [] as HistoricalLogRow[] }),
  ])

  const metadataByWorkoutExercise = new Map((metaRows ?? []).map(row => [row.id, row]))
  const historyByExercise = groupByExerciseId(historyRows ?? [])
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

  const prs: PRRecord[] = []
  let exerciseLogs: Array<{
    exercise_id: string
    sets_completed: number
    reps_completed: number[]
    weights_kg: number[]
    rpe_values: Array<number | null>
    duration_seconds: number | null
    notes: string | null
  }> = []

  if (exercisesWithData.length > 0) {
    exerciseLogs = exercisesWithData.map(ex => {
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
  }

  const { data: persistedRows, error: persistenceError } = await (supabase as any).rpc(
    'save_session_log_atomic',
    {
      p_client_session_id: payload.clientSessionId,
      p_workout_id: payload.workoutId,
      p_completed_at: new Date(payload.finishedAt).toISOString(),
      p_duration_minutes: durationMinutes,
      p_mood_rating: payload.moodRating,
      p_exercise_logs: exerciseLogs,
    },
  ) as {
    data: Array<{ progress_log_id: string; inserted: boolean }> | null
    error: { message: string } | null
  }

  const persisted = persistedRows?.[0]
  if (persistenceError || !persisted) {
    console.error('[saveSession] atomic session save failed:', persistenceError)
    return {
      success: false,
      progressLogId: null,
      prs: [],
      progressions: [],
      error: persistenceError?.message ?? 'No se pudo guardar la sesión',
    }
  }

  if (!persisted.inserted) {
    return { success: true, progressLogId: persisted.progress_log_id, prs: [], progressions: [] }
  }

  await updateActivePlanTargets(supabase, user.id, payload.workoutId, progressions)

  return { success: true, progressLogId: persisted.progress_log_id, prs, progressions }
}
