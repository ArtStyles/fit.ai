function errorMode() { return new URLSearchParams(window.location.search).get('save') === 'error' }
function record(action: string, formData?: FormData) {
  const state = window as Window & { __PROGRAM_ACTIONS__?: Array<{ action: string; fields: Record<string, string> }> }
  state.__PROGRAM_ACTIONS__ ??= []
  state.__PROGRAM_ACTIONS__.push({ action, fields: Object.fromEntries(formData?.entries() ?? []) as Record<string, string> })
}
export async function createTrainerProgram(formData: FormData) { record('create-template', formData); return { ok: true as const, templateId: '11111111-1111-4111-8111-111111111111' } }
export async function updateTrainerProgram(formData: FormData) { record('update-template', formData); return errorMode() ? { ok: false as const, error: 'No se pudo guardar la rutina.' } : { ok: true as const, templateId: '11111111-1111-4111-8111-111111111111' } }
export async function createTrainerTemplateWorkout(formData: FormData) { record('create-workout', formData); return { ok: true as const, workoutId: '22222222-2222-4222-8222-222222222222' } }
export async function updateTrainerTemplateWorkout(formData: FormData) { record('update-workout', formData); return { ok: true as const, workoutId: '22222222-2222-4222-8222-222222222222' } }
export async function updateTrainerTemplateExercise(formData: FormData) { record('update-exercise', formData); return { ok: true as const, templateExerciseId: '33333333-3333-4333-8333-333333333333' } }
export async function reorderTrainerTemplateWorkouts() { return { ok: true as const } }
export async function addTrainerTemplateExercise() { return { ok: true as const, templateExerciseId: '33333333-3333-4333-8333-333333333333' } }
export async function reorderTrainerTemplateExercises() { return { ok: true as const } }
