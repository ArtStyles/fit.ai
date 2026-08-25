type RecordedFields = Record<string, string | string[]>
type AppendedExercise = { id: string; exerciseId: string; orderIndex: number }
type ServerEvent =
  | { type: 'create-workout'; workoutId: string; fields: RecordedFields }
  | { type: 'delete-workout'; workoutId: string }
  | { type: 'reorder-workouts'; workoutIds: string[] }
  | { type: 'add-exercises'; workoutId: string; exercises: AppendedExercise[] }
  | { type: 'delete-exercise'; exerciseId: string }
  | { type: 'reorder-exercises'; workoutId: string; exerciseIds: string[] }

let appendedExerciseSequence = 0

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

function queueServerEvent(event: ServerEvent) {
  const state = window as Window & { __PROGRAM_SERVER_EVENTS__?: ServerEvent[] }
  state.__PROGRAM_SERVER_EVENTS__ ??= []
  state.__PROGRAM_SERVER_EVENTS__.push(event)
}

function stringField(formData: FormData, name: string) {
  const value = formData.get(name)
  return typeof value === 'string' ? value : ''
}

export async function createTrainerProgram(formData: FormData) {
  record('create-template', formData)
  return { ok: true as const, templateId: '11111111-1111-4111-8111-111111111111' }
}

export async function updateTrainerProgram(formData: FormData) {
  record('update-template', formData)
  if (queryMode('save') === 'hold') {
    return new Promise<{ ok: true; templateId: string }>(resolve => {
      const state = window as Window & { __RESOLVE_TEMPLATE_SAVE__?: () => void }
      state.__RESOLVE_TEMPLATE_SAVE__ = () => resolve({ ok: true, templateId: '11111111-1111-4111-8111-111111111111' })
    })
  }
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
  const workoutId = '88888888-8888-4888-8888-888888888888'
  queueServerEvent({ type: 'create-workout', workoutId, fields: fieldsFrom(formData) })
  return { ok: true as const, workoutId }
}

export async function updateTrainerTemplateWorkout(formData: FormData) {
  record('update-workout', formData)
  return { ok: true as const, workoutId: '22222222-2222-4222-8222-222222222222' }
}

export async function deleteTrainerTemplateWorkout(formData: FormData) {
  record('delete-workout', formData)
  queueServerEvent({ type: 'delete-workout', workoutId: stringField(formData, 'templateWorkoutId') })
  return { ok: true as const }
}

export async function addTrainerTemplateExercises(formData: FormData) {
  record('add-exercises', formData)
  const attempts = recordedActions().filter(call => call.action === 'add-exercises').length
  if (queryMode('batch') === 'retry' && attempts === 1) {
    return { ok: false as const, error: 'No se pudieron agregar los ejercicios.' }
  }

  const selected = formData.getAll('exerciseId').filter((value): value is string => typeof value === 'string')
  const exercises = selected.map(exerciseId => {
    appendedExerciseSequence += 1
    return {
      id: `99999999-9999-4999-8999-${String(appendedExerciseSequence).padStart(12, '0')}`,
      exerciseId,
      orderIndex: 2 + appendedExerciseSequence,
    }
  })
  queueServerEvent({
    type: 'add-exercises',
    workoutId: stringField(formData, 'templateWorkoutId'),
    exercises,
  })
  return {
    ok: true as const,
    exercises,
  }
}

export async function updateTrainerTemplateExercise(formData: FormData) {
  record('update-exercise', formData)
  return { ok: true as const, templateExerciseId: '33333333-3333-4333-8333-333333333333' }
}

export async function deleteTrainerTemplateExercise(formData: FormData) {
  record('delete-exercise', formData)
  queueServerEvent({ type: 'delete-exercise', exerciseId: stringField(formData, 'templateExerciseId') })
  return { ok: true as const }
}

export async function reorderTrainerTemplateWorkouts(formData: FormData) {
  record('reorder-workouts', formData)
  if (queryMode('reorder') === 'days-error') return { ok: false as const, error: 'No se pudo actualizar el orden.' }
  queueServerEvent({ type: 'reorder-workouts', workoutIds: stringField(formData, 'workoutIds').split(',') })
  return { ok: true as const }
}

export async function reorderTrainerTemplateExercises(formData: FormData) {
  record('reorder-exercises', formData)
  if (queryMode('reorder') === 'error') return { ok: false as const, error: 'No se pudo actualizar el orden.' }
  queueServerEvent({
    type: 'reorder-exercises',
    workoutId: stringField(formData, 'templateWorkoutId'),
    exerciseIds: stringField(formData, 'templateExerciseIds').split(','),
  })
  return { ok: true as const }
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
