import type { RoutineSummary, TemplateExerciseDraft, TemplateExerciseView, TemplateWorkoutView } from './types'

export function createTemplateExerciseDraft(exercise: TemplateExerciseView): TemplateExerciseDraft {
  return {
    exerciseId: exercise.exercise_id,
    sets: String(exercise.sets),
    reps: String(exercise.reps),
    weightKg: exercise.weight_kg === null ? '' : String(exercise.weight_kg),
    targetRpe: exercise.target_rpe === null ? '' : String(exercise.target_rpe),
    restSeconds: String(exercise.rest_seconds),
    notes: exercise.notes ?? '',
  }
}

export function templateExerciseDraftMatches(exercise: TemplateExerciseView, draft: TemplateExerciseDraft) {
  const persisted = createTemplateExerciseDraft(exercise)
  return Object.keys(persisted).every(key => persisted[key as keyof TemplateExerciseDraft] === draft[key as keyof TemplateExerciseDraft])
}

function summarizeExercises(workouts: TemplateWorkoutView[]) {
  const exercises = workouts.flatMap(workout => workout.exercises)
  const sets = exercises.reduce((total, exercise) => total + exercise.sets, 0)

  return {
    exercises: exercises.length,
    sets,
    estimatedMinutes: sets * 2 + exercises.length * 4,
  }
}

export function summarizeRoutine(workouts: TemplateWorkoutView[]): RoutineSummary {
  return { days: workouts.length, ...summarizeExercises(workouts) }
}

export function summarizeWorkout(workout: TemplateWorkoutView): RoutineSummary {
  return { days: 1, ...summarizeExercises([workout]) }
}

export function moveItem<T>(items: T[], index: number, delta: number): T[] {
  const target = index + delta
  if (index < 0 || index >= items.length || target < 0 || target >= items.length) return [...items]

  const moved = [...items]
  const [item] = moved.splice(index, 1)
  moved.splice(target, 0, item)
  return moved
}
