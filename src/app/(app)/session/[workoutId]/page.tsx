import { notFound } from 'next/navigation'
import { requireAppUserContext } from '@/lib/auth/server'
import { SessionClient }      from './SessionClient'
import type { ExerciseSession } from '@/store/sessionStore'
import { buildInitialExercises } from '@/store/sessionStore'

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

// ─── Página ───────────────────────────────────────────────────────────────────

interface PageProps {
  params: { workoutId: string }
}

export default async function SessionPage({ params }: PageProps) {
  const { workoutId } = params

  const { supabase } = await requireAppUserContext()

  // ── Datos del workout ──────────────────────────────────────────────────────
  type WorkoutRow = { id: string; name: string; estimated_duration_minutes: number | null; focus: string | null }
  const [{ data: workout }, { data: weRows }] = await Promise.all([
    supabase
      .from('workouts')
      .select('id, name, estimated_duration_minutes, focus')
      .eq('id', workoutId)
      .single() as unknown as Promise<{ data: WorkoutRow | null }>,
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
  ])

  if (!workout) notFound()

  const rows = weRows ?? []

  // ── Transformar a ExerciseSession[] ───────────────────────────────────────
  const exerciseInitData = rows
    .filter(r => r.exercises != null)
    .map(r => ({
      workoutExerciseId: r.id,
      exerciseId:        r.exercises!.id,
      name:              r.exercises!.name,
      imageUrl:          r.exercises!.image_url,
      instructions:      r.exercises!.instructions,
      muscleGroups:      r.exercises!.muscle_groups ?? [],
      isCompound:        r.exercises!.is_compound,
      targetSets:        r.sets ?? 3,
      targetReps:        r.reps,
      targetDuration:    r.duration_seconds,
      restSeconds:       r.rest_seconds ?? 90,
      targetRpe:         r.target_rpe ?? 7,
      suggestedWeight:   r.weight_kg,
      weightSuggestionBasis: r.weight_suggestion_basis as ExerciseSession['weightSuggestionBasis'],
      notes:             r.notes,
    }))

  const exercises: ExerciseSession[] = buildInitialExercises(exerciseInitData)

  return (
    <SessionClient
      workoutId={workoutId}
      workoutName={workout.name}
      estimatedMinutes={workout.estimated_duration_minutes}
      exercises={exercises}
    />
  )
}
