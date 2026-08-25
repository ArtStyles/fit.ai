type RecordedFields = Record<string, string | string[]>

function queryMode(name: string) {
  return new URLSearchParams(window.location.search).get(name)
}

function fieldsFrom(formData?: FormData) {
  const fields: RecordedFields = {}
  if (!formData) return fields
  formData.forEach((value, key) => {
    if (typeof value !== 'string') return
    const current = fields[key]
    fields[key] = current === undefined
      ? value
      : Array.isArray(current)
        ? [...current, value]
        : [current, value]
  })
  return fields
}

function recordedActions() {
  const state = window as Window & {
    __PROGRAM_ACTIONS__?: Array<{ action: string; fields: RecordedFields }>
  }
  state.__PROGRAM_ACTIONS__ ??= []
  return state.__PROGRAM_ACTIONS__
}

function record(action: string, formData?: FormData) {
  recordedActions().push({ action, fields: fieldsFrom(formData) })
}

export async function createTrainerProgram(formData: FormData) {
  record('create-template', formData)
  return { ok: true as const, templateId: '11111111-1111-4111-8111-111111111111' }
}

export async function updateTrainerProgram(formData: FormData) {
  record('update-template', formData)
  return queryMode('save') === 'error'
    ? { ok: false as const, error: 'No se pudo guardar la rutina.' }
    : { ok: true as const, templateId: '11111111-1111-4111-8111-111111111111' }
}

export async function archiveTrainerProgram(formData: FormData) {
  record('archive-template', formData)
  return { ok: true as const }
}

export async function createTrainerTemplateWorkout(formData: FormData) {
  record('create-workout', formData)
  return { ok: true as const, workoutId: '88888888-8888-4888-8888-888888888888' }
}

export async function updateTrainerTemplateWorkout(formData: FormData) {
  record('update-workout', formData)
  return { ok: true as const, workoutId: '22222222-2222-4222-8222-222222222222' }
}

export async function deleteTrainerTemplateWorkout(formData: FormData) {
  record('delete-workout', formData)
  return { ok: true as const }
}

export async function addTrainerTemplateExercises(formData: FormData) {
  record('add-exercises', formData)
  const attempts = recordedActions().filter(call => call.action === 'add-exercises').length
  if (queryMode('batch') === 'retry' && attempts === 1) {
    return { ok: false as const, error: 'No se pudieron agregar los ejercicios.' }
  }

  const selected = formData.getAll('exerciseId').filter((value): value is string => typeof value === 'string')
  return {
    ok: true as const,
    exercises: selected.map((exerciseId, index) => ({
      id: index === 0
        ? '99999999-9999-4999-8999-999999999991'
        : '99999999-9999-4999-8999-999999999992',
      exerciseId,
      orderIndex: 3 + index,
    })),
  }
}

export async function updateTrainerTemplateExercise(formData: FormData) {
  record('update-exercise', formData)
  return { ok: true as const, templateExerciseId: '33333333-3333-4333-8333-333333333333' }
}

export async function deleteTrainerTemplateExercise(formData: FormData) {
  record('delete-exercise', formData)
  return { ok: true as const }
}

export async function reorderTrainerTemplateWorkouts(formData: FormData) {
  record('reorder-workouts', formData)
  return queryMode('reorder') === 'days-error'
    ? { ok: false as const, error: 'No se pudo actualizar el orden.' }
    : { ok: true as const }
}

export async function reorderTrainerTemplateExercises(formData: FormData) {
  record('reorder-exercises', formData)
  return queryMode('reorder') === 'error'
    ? { ok: false as const, error: 'No se pudo actualizar el orden.' }
    : { ok: true as const }
}

export async function loadExerciseCatalogPage() {
  return {
    items: [
      { id: '44444444-4444-4444-8444-444444444444', name: 'Sentadilla', muscleGroups: ['Piernas'], equipment: ['Barra'], imageUrl: null },
      { id: '66666666-6666-4666-8666-666666666666', name: 'Prensa', muscleGroups: ['Piernas'], equipment: ['Máquina'], imageUrl: null },
      { id: '77777777-7777-4777-8777-777777777777', name: 'Gemelos', muscleGroups: ['Pantorrillas'], equipment: ['Máquina'], imageUrl: null },
    ],
    page: 1,
    total: 3,
    totalPages: 1,
    facets: {
      muscles: [{ value: 'Piernas', label: 'Piernas' }, { value: 'Pantorrillas', label: 'Pantorrillas' }],
      equipment: [{ value: 'Barra', label: 'Barra' }, { value: 'Máquina', label: 'Máquina' }],
    },
  }
}
