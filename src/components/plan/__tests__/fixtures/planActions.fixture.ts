export const updateWorkoutSummary = '/test-action/update-workout'
export async function addWorkoutExercise(formData: FormData) {
  (window as Window & { __ADDED_EXERCISE_IDS__?: string[] }).__ADDED_EXERCISE_IDS__ = formData
    .getAll('exerciseIds')
    .map(String)
}
export async function updateWorkoutExercise(formData: FormData) {
  (window as Window & { __UPDATED_EXERCISE_REPS__?: string }).__UPDATED_EXERCISE_REPS__ = String(formData.get('reps'))
}
export async function replaceWorkoutExercise(formData: FormData) {
  (window as Window & { __REPLACED_EXERCISE__?: { rowId: string; exerciseId: string } }).__REPLACED_EXERCISE__ = {
    rowId: String(formData.get('workoutExerciseId')),
    exerciseId: String(formData.get('exerciseId')),
  }
}
export async function removeWorkoutExercise() {}
export async function reorderWorkoutExercises() {}

export async function activatePlan(data: FormData) {
  (window as Window & { __SELECTED_PLAN__?: string }).__SELECTED_PLAN__ = String(data.get('planId'))
}
export async function deletePlan(data: FormData) {
  (window as Window & { __REMOVED_PLAN__?: string }).__REMOVED_PLAN__ = String(data.get('planId'))
}
export async function createManualPlan() {}
