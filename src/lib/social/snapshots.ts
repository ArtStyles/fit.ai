// Constructores puros de los snapshots que viajan dentro de un post.

export interface SessionSnapshotSet { reps: number; weight_kg: number | null }
export interface SessionSnapshotExercise { name: string; sets: SessionSnapshotSet[]; is_pr: boolean }
export interface SessionSnapshot {
  workout_name: string
  completed_at: string
  duration_minutes: number | null
  total_volume_kg: number
  exercises: SessionSnapshotExercise[]
}

interface RawExerciseLog {
  exercise_id: string
  reps_completed: number[] | null
  weights_kg: number[] | null
}

export function buildSessionSnapshot(
  log: { completed_at: string; duration_minutes: number | null },
  workoutName: string,
  exerciseLogs: RawExerciseLog[],
  exerciseNames: Map<string, string>,
  prExerciseIds: Set<string> = new Set(),
): SessionSnapshot {
  const exercises: SessionSnapshotExercise[] = exerciseLogs.map(el => {
    const reps = el.reps_completed ?? []
    const weights = el.weights_kg ?? []
    const sets: SessionSnapshotSet[] = reps.map((r, i) => ({
      reps: Number(r),
      weight_kg: weights[i] != null ? Number(weights[i]) : null,
    }))
    return {
      name: exerciseNames.get(el.exercise_id) ?? 'Ejercicio',
      sets,
      is_pr: prExerciseIds.has(el.exercise_id),
    }
  })
  const total_volume_kg = Math.round(
    exercises.reduce(
      (sum, ex) => sum + ex.sets.reduce((s, set) => s + (set.weight_kg ?? 0) * set.reps, 0),
      0,
    ),
  )
  return {
    workout_name: workoutName,
    completed_at: log.completed_at,
    duration_minutes: log.duration_minutes,
    total_volume_kg,
    exercises,
  }
}

export interface RoutineSnapshotExercise {
  exercise_id: string
  name: string
  order_index: number
  sets: number | null
  reps: number | null
  rest_seconds: number | null
  weight_kg: number | null
}
export interface RoutineSnapshotWorkout {
  name: string
  day_of_week: number | null
  exercises: RoutineSnapshotExercise[]
}
export interface RoutineSnapshot {
  name: string
  goal: string | null
  days_per_week: number | null
  difficulty: string | null
  workouts: RoutineSnapshotWorkout[]
}

export function buildRoutineSnapshot(
  plan: { name: string; goal: string | null; days_per_week: number | null; difficulty: string | null },
  workouts: { id: string; name: string; day_of_week: number | null; order_in_plan: number | null }[],
  exercisesByWorkout: Map<string, RoutineSnapshotExercise[]>,
): RoutineSnapshot {
  const sorted = [...workouts].sort((a, b) => (a.order_in_plan ?? 0) - (b.order_in_plan ?? 0))
  return {
    name: plan.name,
    goal: plan.goal,
    days_per_week: plan.days_per_week,
    difficulty: plan.difficulty,
    workouts: sorted.map(w => ({
      name: w.name,
      day_of_week: w.day_of_week,
      exercises: [...(exercisesByWorkout.get(w.id) ?? [])].sort((a, b) => a.order_index - b.order_index),
    })),
  }
}
