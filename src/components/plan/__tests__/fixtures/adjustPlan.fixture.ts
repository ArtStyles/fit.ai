export async function suggestWorkoutAdjustment() {
  return { success: true, suggestion: '', changes: [], changesSummary: [] }
}

export async function applyWorkoutAdjustment() {
  return { success: true, appliedCount: 0 }
}
