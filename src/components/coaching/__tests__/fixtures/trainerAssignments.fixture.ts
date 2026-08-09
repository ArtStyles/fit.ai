export async function proposeTrainerAssignment(formData: FormData) {
  const target = window as Window & { __ASSIGNMENT_ACTIONS__?: Array<Record<string, string>> }
  target.__ASSIGNMENT_ACTIONS__ ??= []
  target.__ASSIGNMENT_ACTIONS__.push(Object.fromEntries(formData.entries()) as Record<string, string>)
  return { ok: true as const, assignmentId: '11111111-1111-4111-8111-111111111111', assignmentVersionId: '22222222-2222-4222-8222-222222222222', workoutPlanId: '33333333-3333-4333-8333-333333333333' }
}

export async function acceptTrainerAssignment() {
  return { ok: true as const, assignmentId: '11111111-1111-4111-8111-111111111111', planId: '33333333-3333-4333-8333-333333333333' }
}
