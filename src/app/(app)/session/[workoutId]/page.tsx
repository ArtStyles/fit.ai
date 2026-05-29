import { notFound, redirect } from 'next/navigation'
import { requireAppUserContext } from '@/lib/auth/server'
import { SessionClient }      from './SessionClient'
import type { ExerciseSession, SessionExerciseDraft } from '@/store/sessionStore'
import { buildInitialExercises } from '@/store/sessionStore'
import { getWorkoutStartAccess } from '@/lib/workouts/access'

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
    image_url:    string | null
    instructions: string | null
    is_compound:  boolean
    muscle_groups: string[]
  } | null
}

type RawExerciseOption = {
  id: string
  name: string
  image_url: string | null
  instructions: string | null
  is_compound: boolean
  muscle_groups: string[] | null
}

// ─── Página ───────────────────────────────────────────────────────────────────

interface PageProps {
  params: { workoutId: string }
}

export default async function SessionPage({ params }: PageProps) {
  const { workoutId } = params

  const { supabase, user } = await requireAppUserContext()

  const access = await getWorkoutStartAccess({
    supabase,
    userId: user.id,
    workoutId,
  })

  if (!access.allowed) {
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
          image_url,
          instructions,
          is_compound,
          muscle_groups
        )
      `)
      .eq('workout_id', workoutId)
      .order('order_index') as unknown as Promise<{ data: RawWorkoutExercise[] | null }>,
    supabase
      .from('exercises')
      .select('id, name, image_url, instructions, is_compound, muscle_groups')
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
  type LastLogRow = { exercise_id: string | null; weights_kg: number[] | null; reps_completed: number[] | null }
  let lastExerciseLogs: LastLogRow[] = []

  if (lastLogRow?.id) {
    const { data } = await supabase
      .from('exercise_logs')
      .select('exercise_id, weights_kg, reps_completed')
      .eq('progress_log_id', lastLogRow.id) as unknown as { data: LastLogRow[] | null }
    lastExerciseLogs = data ?? []
  }

  // exerciseId → { weightsKg (por serie), reps (por serie) }
  const lastSessionMap = new Map(
    lastExerciseLogs
      .filter(l => l.exercise_id != null)
      .map(l => [
        l.exercise_id!,
        {
          weightsKg: (l.weights_kg ?? []).filter((w): w is number => w != null && w > 0),
          reps:      (l.reps_completed ?? []).filter((r): r is number => r != null && r > 0),
        },
      ]),
  )

  const rows = weRows ?? []

  // ── Transformar a ExerciseSession[] ───────────────────────────────────────
  const exerciseInitData = rows
    .filter(r => r.exercises != null)
    .map(r => {
      const last = lastSessionMap.get(r.exercises!.id)
      return {
        workoutExerciseId:     r.id,
        exerciseId:            r.exercises!.id,
        name:                  r.exercises!.name,
        imageUrl:              r.exercises!.image_url,
        instructions:          r.exercises!.instructions,
        muscleGroups:          r.exercises!.muscle_groups ?? [],
        isCompound:            r.exercises!.is_compound,
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
  const exerciseOptions: SessionExerciseDraft[] = (exerciseOptionRows ?? []).map(exercise => ({
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
  }))

  return (
    <SessionClient
      workoutId={workoutId}
      workoutName={workout.name}
      estimatedMinutes={workout.estimated_duration_minutes}
      exercises={exercises}
      exerciseOptions={exerciseOptions}
    />
  )
}
