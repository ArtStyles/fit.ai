'use server'

import { createClient } from '@/lib/supabase/server'
import { buildProgressionSuggestions } from '@/lib/progression'
import { getWorkoutStartAccess } from '@/lib/workouts/access'
import type { ProgressionSuggestion } from '@/lib/progression'

export interface SetPayload {
  weightKg: string
  reps: string
  rpe: number | null
  completed: boolean
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
  targetRpe?: number | null
  source?: 'planned' | 'replacement' | 'ad_hoc'
  skipReason?: string | null
  sets: SetPayload[]
  status: 'pending' | 'active' | 'completed' | 'skipped'
}

export interface SaveSessionPayload {
  workoutId: string
  startedAt: number
  finishedAt: number
  moodRating: number | null
  exercises: ExercisePayload[]
}

export interface PRRecord {
  exerciseName: string
  weightKg: number
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

type HistoricalLogRow = {
  exercise_id: string
  weights_kg: number[] | null
  progress_log_id: string
}

function getExerciseRelation(row: ExerciseMetaRow): { is_compound: boolean } | null {
  if (Array.isArray(row.exercise)) return row.exercise[0] ?? null
  return row.exercise
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

async function updateActivePlanWeights(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  workoutId: string,
  progressions: ProgressionSuggestion[],
) {
  const persistableProgressions = progressions.filter(suggestion =>
    suggestion.nextWeightKg !== null && suggestion.confidence !== 'low',
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
    const { error } = await (supabase
      .from('workout_exercises') as any)
      .update({
        weight_kg: suggestion.nextWeightKg,
        weight_suggestion_basis: 'based_on_previous_logs',
      })
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

  const access = await getWorkoutStartAccess({
    supabase,
    userId: user.id,
    workoutId: payload.workoutId,
  })

  if (!access.allowed && access.reason === 'completed_today') {
    return {
      success: false,
      progressLogId: null,
      prs: [],
      progressions: [],
      error: 'Esta rutina ya fue completada hoy.',
    }
  }

  if (!access.allowed) {
    return {
      success: false,
      progressLogId: null,
      prs: [],
      progressions: [],
      error: 'Solo puedes registrar la rutina programada para hoy.',
    }
  }

  const durationMinutes = Math.max(
    1,
    Math.round((payload.finishedAt - payload.startedAt) / 60_000),
  )

  const { data: progressLog, error: progressLogError } = await (supabase
    .from('progress_logs') as any)
    .insert({
      user_id: user.id,
      workout_id: payload.workoutId,
      duration_minutes: durationMinutes,
      completed_at: new Date(payload.finishedAt).toISOString(),
      mood_rating: payload.moodRating,
    })
    .select('id')
    .single() as { data: { id: string } | null; error: { message: string } | null }

  if (progressLogError || !progressLog) {
    console.error('[saveSession] progress_logs insert failed:', progressLogError)
    return {
      success: false,
      progressLogId: null,
      prs: [],
      progressions: [],
      error: progressLogError?.message ?? 'No se pudo guardar la sesión',
    }
  }

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
          .select('exercise_id, weights_kg, progress_log_id, progress_logs!inner(user_id)')
          .in('exercise_id', exerciseIds)
          .eq('progress_logs.user_id', user.id)
          .neq('progress_log_id', progressLog.id) as Promise<{ data: HistoricalLogRow[] | null }>
      : Promise.resolve({ data: [] as HistoricalLogRow[] }),
  ])

  const metadataByWorkoutExercise = new Map((metaRows ?? []).map(row => [row.id, row]))
  const historyByExercise = groupByExerciseId(historyRows ?? [])
  const exercisesWithData = payload.exercises.filter(ex =>
    ex.sets.some(set => set.completed) || (ex.status === 'skipped' && Boolean(ex.skipReason)),
  )

  const progressions = buildProgressionSuggestions(payload.exercises.map(ex => {
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
      status: ex.status,
      sets: ex.sets,
    }
  }))

  const prs: PRRecord[] = []

  if (exercisesWithData.length > 0) {
    const exerciseLogs = exercisesWithData.map(ex => {
      const completedSets = ex.sets.filter(set => set.completed)

      return {
        progress_log_id: progressLog.id,
        exercise_id: ex.exerciseId,
        sets_completed: completedSets.length,
        reps_completed: completedSets.map(set => Math.max(0, parseInt(set.reps) || 0)),
        weights_kg: completedSets.map(set => Math.max(0, parseFloat(set.weightKg) || 0)),
        rpe_values: completedSets.map(set => set.rpe),
        notes: buildExerciseLogNote(ex),
      }
    })

    const { error: exerciseLogError } = await (supabase
      .from('exercise_logs') as any)
      .insert(exerciseLogs) as { error: { message: string } | null }

    if (exerciseLogError) {
      console.error('[saveSession] exercise_logs insert failed:', exerciseLogError)
      await (supabase
        .from('progress_logs') as any)
        .delete()
        .eq('id', progressLog.id)

      return {
        success: false,
        progressLogId: null,
        prs: [],
        progressions: [],
        error: exerciseLogError.message ?? 'No se pudo guardar el detalle de la sesión',
      }
    }

    for (const ex of exercisesWithData) {
      const completedSets = ex.sets.filter(set => set.completed)
      const currentMaxWeight = Math.max(
        ...completedSets.map(set => parseFloat(set.weightKg) || 0),
      )
      if (currentMaxWeight <= 0) continue

      const prevLogs = historyByExercise[ex.exerciseId] ?? []

      if (prevLogs.length === 0) {
        prs.push({ exerciseName: ex.name, weightKg: currentMaxWeight })
        continue
      }

      const historicMax = Math.max(
        ...prevLogs.flatMap(log => log.weights_kg ?? []),
        0,
      )

      if (currentMaxWeight > historicMax) {
        prs.push({ exerciseName: ex.name, weightKg: currentMaxWeight })
      }
    }
  }

  await updateActivePlanWeights(supabase, user.id, payload.workoutId, progressions)

  return { success: true, progressLogId: progressLog.id, prs, progressions }
}
