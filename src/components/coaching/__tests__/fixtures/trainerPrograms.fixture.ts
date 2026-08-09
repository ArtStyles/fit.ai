function errorMode() { return new URLSearchParams(window.location.search).get('save') === 'error' }
export async function updateTrainerProgram() { return errorMode() ? { ok: false as const, error: 'No se pudo guardar la rutina.' } : { ok: true as const, templateId: '11111111-1111-4111-8111-111111111111' } }
export async function createTrainerTemplateWorkout() { return { ok: true as const, workoutId: '22222222-2222-4222-8222-222222222222' } }
export async function updateTrainerTemplateWorkout() { return { ok: true as const, workoutId: '22222222-2222-4222-8222-222222222222' } }
export async function updateTrainerTemplateExercise() { return { ok: true as const, templateExerciseId: '33333333-3333-4333-8333-333333333333' } }
export async function reorderTrainerTemplateWorkouts() { return { ok: true as const } }
export async function addTrainerTemplateExercise() { return { ok: true as const, templateExerciseId: '33333333-3333-4333-8333-333333333333' } }
export async function reorderTrainerTemplateExercises() { return { ok: true as const } }
