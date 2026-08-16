export const updateWorkoutSummary = '/test-action/update-workout'
export async function addWorkoutExercise(formData: FormData) {
  (window as Window & { __ADDED_EXERCISE_IDS__?: string[] }).__ADDED_EXERCISE_IDS__ = formData
    .getAll('exerciseIds')
    .map(String)
}
export const updateWorkoutExercise = '/test-action/update-exercise'
export const replaceWorkoutExercise = '/test-action/replace-exercise'
export async function removeWorkoutExercise() {}
export async function reorderWorkoutExercises() {}
