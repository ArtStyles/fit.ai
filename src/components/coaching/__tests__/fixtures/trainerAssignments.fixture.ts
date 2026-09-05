export async function proposeTrainerAssignment(formData: FormData) {
  const target = window as Window & { __ASSIGNMENT_ACTIONS__?: Array<Record<string, string>> }
  target.__ASSIGNMENT_ACTIONS__ ??= []
  target.__ASSIGNMENT_ACTIONS__.push(Object.fromEntries(formData.entries()) as Record<string, string>)
  return { ok: true as const, assignmentId: '11111111-1111-4111-8111-111111111111', assignmentVersionId: '22222222-2222-4222-8222-222222222222', workoutPlanId: '33333333-3333-4333-8333-333333333333' }
}

export async function acceptTrainerAssignment(formData: FormData) {
  const target = window as Window & {
    __ACCEPT_ASSIGNMENT_ACTIONS__?: Array<Record<string, string>>
    __RESOLVE_ACCEPT_ASSIGNMENT__?: (result: { ok: true; assignmentId: string; workoutPlanId: string }) => void
  }
  target.__ACCEPT_ASSIGNMENT_ACTIONS__ ??= []
  target.__ACCEPT_ASSIGNMENT_ACTIONS__.push(Object.fromEntries(formData.entries()) as Record<string, string>)
  if (new URLSearchParams(window.location.search).get('accept') === 'pending') {
    return new Promise<{ ok: true; assignmentId: string; workoutPlanId: string }>(resolve => {
      target.__RESOLVE_ACCEPT_ASSIGNMENT__ = resolve
    })
  }
  return { ok: true as const, assignmentId: '11111111-1111-4111-8111-111111111111', workoutPlanId: '33333333-3333-4333-8333-333333333333' }
}

export async function declineTrainerAssignment(formData: FormData) {
  const target = window as Window & {
    __DECLINE_ASSIGNMENT_ACTIONS__?: Array<Record<string, string>>
    __RESOLVE_DECLINE_ASSIGNMENT__?: (result: { ok: true; assignmentId: string; changed: boolean }) => void
  }
  target.__DECLINE_ASSIGNMENT_ACTIONS__ ??= []
  target.__DECLINE_ASSIGNMENT_ACTIONS__.push(Object.fromEntries(formData.entries()) as Record<string, string>)
  const mode = new URLSearchParams(window.location.search).get('decline')
  if (mode === 'pending') {
    return new Promise<{ ok: true; assignmentId: string; changed: boolean }>(resolve => {
      target.__RESOLVE_DECLINE_ASSIGNMENT__ = resolve
    })
  }
  if (mode === 'error-once' && target.__DECLINE_ASSIGNMENT_ACTIONS__.length === 1) {
    return { ok: false as const, error: 'La propuesta ya no esta disponible.' }
  }
  return { ok: true as const, assignmentId: '11111111-1111-4111-8111-111111111111', changed: true }
}

export async function publishTrainerAssignmentRevision(formData: FormData) {
  const target = window as Window & { __ASSIGNMENT_ACTIONS__?: Array<Record<string, string>> }
  target.__ASSIGNMENT_ACTIONS__ ??= []
  target.__ASSIGNMENT_ACTIONS__.push(Object.fromEntries(formData.entries()) as Record<string, string>)
  return { ok: true as const, assignmentId: '11111111-1111-4111-8111-111111111111', assignmentVersionId: '22222222-2222-4222-8222-222222222222', workoutPlanId: '33333333-3333-4333-8333-333333333333' }
}
