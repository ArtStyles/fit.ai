import type { RoutineSummary, TemplateWorkoutView } from './types'

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
