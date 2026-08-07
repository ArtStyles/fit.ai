import { notFound, redirect } from 'next/navigation'
import { requireAppUserContext } from '@/lib/auth/server'
import { SessionClient }      from './SessionClient'
import type { ExerciseSession, SessionExerciseDraft } from '@/store/sessionStore'
import { buildInitialExercises } from '@/store/sessionStore'
import { getWorkoutStartAccess } from '@/lib/workouts/access'
import { resolveUserTimeZone } from '@/lib/workouts/schedule'
import { exerciseLanguage, localizeExercise } from '@/lib/exercises/localization'
import { zipPreviousPerformanceRows } from '@/components/session/sessionViewModel'
import { canMountSessionClient } from '@/lib/session/authorization'
import { isCommunityEnabled } from '@/lib/features/community'

// ─── Tipos de datos crudos del servidor ──────────────────────────────────────

type RawWorkoutExercise = {
  id:                      string
  order_index:             number
  sets:                    number | null
  reps:                    number | null
  duration_seconds:        number | null
  rest_seconds:            number | null
  weight_kg:               number | null
  notes:                   string | null
  target_rpe:              number | null
  weight_suggestion_basis: string | null
  exercises: {
    id:           string
    name:         string
    name_es:      string | null
    image_url:    string | null
    instructions: string | null
    instructions_es: string | null
    is_compound:  boolean
    muscle_groups: string[]
    muscle_groups_es: string[] | null
  } | null
}

type RawExerciseOption = {
  id: string
  name: string
  name_es: string | null
  image_url: string | null
  instructions: string | null
  instructions_es: string | null
  is_compound: boolean
  muscle_groups: string[] | null
  muscle_groups_es: string[] | null
}

// ─── Página ───────────────────────────────────────────────────────────────────

interface PageProps {
  params: { workoutId: string }
}

export default async function SessionPage({ params }: PageProps) {
  const { workoutId } = params
  const communityEnabled = isCommunityEnabled()

  const { supabase, user, profile } = await requireAppUserContext()
  const language = exerciseLanguage(profile.language)

  const access = await getWorkoutStartAccess({
    supabase,
    userId: user.id,
    workoutId,
    timeZone: resolveUserTimeZone(profile.timezone),
  })

  if (!canMountSessionClient(access)) {
    if (access.reason === 'not_found') notFound()
    redirect('/dashboard?error=workout_unavailable')
  }

  const workout = access.workout

  // ── Datos del workout + última sesión completada (en paralelo) ────────────
  const [{ data: weRows }, { data: exerciseOptionRows }, { data: lastLogRow }] = await Promise.all([
    supabase
      .from('workout_exercises')
      .select(`
        id,
        order_index,
        sets,
        reps,
        duration_seconds,
        rest_seconds,
        weight_kg,
        notes,
        target_rpe,
        weight_suggestion_basis,
        exercises (
          id,
          name,
          name_es,
          image_url,
          instructions,
          instructions_es,
          is_compound,
          muscle_groups,
          muscle_groups_es
        )
      `)
      .eq('workout_id', workoutId)
      .order('order_index') as unknown as Promise<{ data: RawWorkoutExercise[] | null }>,
    supabase
      .from('exercises')
      .select('id, name, name_es, image_url, instructions, instructions_es, is_compound, muscle_groups, muscle_groups_es')
      .eq('is_public', true)
      .order('name')
      .limit(500) as unknown as Promise<{ data: RawExerciseOption[] | null }>,
    supabase
      .from('progress_logs')
      .select('id')
      .eq('user_id', user.id)
      .eq('workout_id', workoutId)
      .order('completed_at', { ascending: false })
      .limit(1)
      .maybeSingle() as unknown as Promise<{ data: { id: string } | null }>,
  ])

  // ── Pesos/reps de la última sesión para pre-rellenar ──────────────────────
  type LastLogRow = {
    exercise_id: string | null
    weights_kg: Array<number | null> | null
    reps_completed: Array<number | null> | null
  }
  let lastExerciseLogs: LastLogRow[] = []

  if (lastLogRow?.id) {
    const { data } = await supabase
      .from('exercise_logs')
      .select('exercise_id, weights_kg, reps_completed')
      .eq('progress_log_id', lastLogRow.id) as unknown as { data: LastLogRow[] | null }
    lastExerciseLogs = data ?? []
  }

  // exerciseId → { weightsKg (por serie), reps (por serie) }
  const historyRowsByExercise = lastExerciseLogs.reduce<Map<string, LastLogRow[]>>((map, row) => {
    if (!row.exercise_id) return map
    const rowsForExercise = map.get(row.exercise_id) ?? []
    rowsForExercise.push(row)
    map.set(row.exercise_id, rowsForExercise)
    return map
  }, new Map())
  const lastSessionMap = new Map(Array.from(historyRowsByExercise, ([exerciseId, historyRows]) => {
    const performance = zipPreviousPerformanceRows(historyRows.map(row => ({
      weightsKg: row.weights_kg,
      reps: row.reps_completed,
    })))
    return [exerciseId, {
      weightsKg: performance.map(set => typeof set.weightKg === 'number' ? set.weightKg : null),
      reps: performance.map(set => typeof set.reps === 'number' ? set.reps : null),
    }] as const
  }))

  const rows = weRows ?? []

  // ── Transformar a ExerciseSession[] ───────────────────────────────────────
  const exerciseInitData = rows
    .filter(r => r.exercises != null)
    .map(r => {
      const localized = localizeExercise(r.exercises!, language)
      const last = lastSessionMap.get(localized.id)
      return {
        workoutExerciseId:     r.id,
        exerciseId:            localized.id,
        name:                  localized.name,
        imageUrl:              localized.image_url,
        instructions:          localized.instructions,
        muscleGroups:          localized.muscle_groups ?? [],
        isCompound:            localized.is_compound,
        targetSets:            r.sets ?? 3,
        targetReps:            r.reps,
        targetDuration:        r.duration_seconds,
        restSeconds:           r.rest_seconds ?? 90,
        targetRpe:             r.target_rpe ?? 7,
        suggestedWeight:       r.weight_kg,
        weightSuggestionBasis: r.weight_suggestion_basis as ExerciseSession['weightSuggestionBasis'],
        notes:                 r.notes,
        lastWeightsKg:         last?.weightsKg ?? null,
        lastReps:              last?.reps      ?? null,
      }
    })

  const exercises: ExerciseSession[] = buildInitialExercises(exerciseInitData)
  const exerciseOptions: SessionExerciseDraft[] = (exerciseOptionRows ?? []).map(rawExercise => {
    const exercise = localizeExercise(rawExercise, language)
    return {
      exerciseId: exercise.id,
      name: exercise.name,
      imageUrl: exercise.image_url,
      instructions: exercise.instructions,
      muscleGroups: exercise.muscle_groups ?? [],
      isCompound: exercise.is_compound,
      targetSets: 3,
      targetReps: 10,
      targetDuration: null,
      restSeconds: 90,
      targetRpe: 7,
    }
  })

  return (
    <SessionClient
      workoutId={workoutId}
      workoutName={workout.name}
      estimatedMinutes={workout.estimated_duration_minutes}
      communityEnabled={communityEnabled}
      exercises={exercises}
      exerciseOptions={exerciseOptions}
    />
  )
}
