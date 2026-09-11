import { MAX_SESSION_DURATION_SECONDS, MAX_SESSION_REPS, MAX_SESSION_SETS, MAX_SESSION_WEIGHT_KG } from '@/lib/session/limits'
import type { FreeTrainingCatalogItem, FreeTrainingInput } from './types'

export type SetFields = { weightKg: string; reps: string; durationSeconds: string }
export type ExerciseFields = { exerciseId: string; timed: boolean; sets: SetFields[] }
export type FreeTrainingForm = {
  date: string; name: string; durationMinutes: string; notes: string; complete: boolean
  weeklyGoal: string; exercises: ExerciseFields[]
}
export type FreeTrainingDraft = FreeTrainingInput & { uiDraft?: FreeTrainingForm }
export function localizeSaveError(message: string, language: 'es' | 'en'): string {
  if (language === 'es') return message
  if (/cuenta|perfil cambi[oó]|perfil no encontrado/i.test(message)) return 'The account changed or is unavailable. Your fields are preserved. Reopen this workout from its original account.'
  if (/no se encontr[oó]|registro original ya no est[aá] disponible/i.test(message)) return 'This entry could not be found. Your fields are preserved. Reopen your history to find the saved workout.'
  if (/registro cambi[oó]|versi[oó]n|conflicto|otro registro/i.test(message)) return 'This entry changed elsewhere. Your fields are preserved. Reopen the saved entry before editing again.'
  if (/cat[aá]logo|ejercicio no est[aá]/i.test(message)) return 'An exercise is no longer available. Your fields are preserved. Remove it or choose another exercise.'
  if (/sqlite|almacenamiento|dispositivo|persist|no se pudo guardar/i.test(message)) return 'Could not save on this device. Your fields are preserved; check available storage and try again.'
  return 'Could not save. Your fields are preserved; reopen this entry or try again.'
}
export const emptySet = (): SetFields => ({ weightKg: '', reps: '', durationSeconds: '' })
export function formFromInput(input: FreeTrainingInput, catalog: FreeTrainingCatalogItem[] = []): FreeTrainingForm {
  return {
    date: input.date, name: input.name, durationMinutes: input.durationMinutes == null ? '' : String(input.durationMinutes), notes: input.notes,
    complete: input.detailLevel === 'complete', weeklyGoal: input.weeklyGoal == null ? '' : String(input.weeklyGoal),
    exercises: input.exercises.map(exercise => ({ exerciseId: exercise.exerciseId,
      timed: catalog.find(item => item.id === exercise.exerciseId)?.timed ?? exercise.sets.some(set => set.durationSeconds != null),
      sets: exercise.sets.map(set => ({ weightKg: String(set.weightKg), reps: String(set.reps), durationSeconds: set.durationSeconds == null ? '' : String(set.durationSeconds) })),
    })),
  }
}
export function restoreDraft(initial: FreeTrainingInput, draft: FreeTrainingDraft | null, catalog: FreeTrainingCatalogItem[] = []): FreeTrainingForm {
  if (!draft || draft.accountId !== initial.accountId || draft.sessionId !== initial.sessionId || draft.expectedVersion !== initial.expectedVersion) return formFromInput(initial, catalog)
  // Raw inputs are private draft data. Strict parsing is deferred until Save.
  const raw = draft.uiDraft
  if (raw && typeof raw.date === 'string' && typeof raw.name === 'string' && typeof raw.durationMinutes === 'string' && typeof raw.notes === 'string' && typeof raw.complete === 'boolean' && typeof raw.weeklyGoal === 'string' && Array.isArray(raw.exercises) && raw.exercises.every(e => typeof e.exerciseId === 'string' && typeof e.timed === 'boolean' && Array.isArray(e.sets) && e.sets.every(s => typeof s.weightKg === 'string' && typeof s.reps === 'string' && typeof s.durationSeconds === 'string'))) return { ...structuredClone(raw), weeklyGoal: raw.weeklyGoal || (initial.weeklyGoal == null ? '' : String(initial.weeklyGoal)) }
  return formFromInput({ ...draft, weeklyGoal: draft.weeklyGoal ?? initial.weeklyGoal }, catalog)
}
export function addExercise(form: FreeTrainingForm, exercise: FreeTrainingCatalogItem): FreeTrainingForm {
  if (form.exercises.some(item => item.exerciseId === exercise.id)) return form
  return { ...form, complete: false, exercises: [...form.exercises, { exerciseId: exercise.id, timed: exercise.timed, sets: [emptySet()] }] }
}
export function reusePrevious(form: FreeTrainingForm, exercise: FreeTrainingCatalogItem): FreeTrainingForm {
  if (!exercise.previous?.length) return form
  return { ...form, exercises: form.exercises.map(item => item.exerciseId !== exercise.id ? item : { ...item, sets: exercise.previous!.map(set => ({ weightKg: String(set.weightKg), reps: String(set.reps), durationSeconds: set.durationSeconds == null ? '' : String(set.durationSeconds) })) }) }
}
export function inputFromForm(form: FreeTrainingForm, initial: FreeTrainingInput, today: string, language: 'es' | 'en' = 'es'): FreeTrainingInput {
  const fail = (es: string, en: string): never => { throw new Error(language === 'es' ? es : en) }
  const numeric = (raw: string, min: number, max: number, integer = false, label = language === 'es' ? 'Series' : 'Sets'): number => {
    const normalized = raw.trim().replace(',', '.')
    const number = Number(normalized)
    if (!normalized || !Number.isFinite(number) || number < min || number > max || (integer && !Number.isInteger(number))) fail(`${label}: introduce ${integer ? 'un número entero' : 'un número'} entre ${min} y ${max}.`, `${label}: enter ${integer ? 'a whole number' : 'a number'} between ${min} and ${max}.`)
    return number
  }
  const civil = new Date(`${form.date}T12:00:00Z`)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(form.date) || !Number.isFinite(civil.getTime()) || civil.toISOString().slice(0, 10) !== form.date || form.date > today) fail('Elige una fecha válida, hasta hoy.', 'Choose a valid date, up to today.')
  if (form.name.trim().length > 120 || form.notes.length > 2000) fail('El nombre o la nota supera el límite.', 'The name or note exceeds the limit.')
  const exercises = form.exercises.map(exercise => {
    if (!exercise.sets.length || exercise.sets.length > MAX_SESSION_SETS) fail('Añade una serie o quita el ejercicio.', 'Add a set or remove the exercise.')
    return { exerciseId: exercise.exerciseId, sets: exercise.sets.map(set => ({
      weightKg: exercise.timed ? 0 : set.weightKg.trim() ? numeric(set.weightKg, 0, MAX_SESSION_WEIGHT_KG) : 0,
      reps: exercise.timed ? 0 : numeric(set.reps, 1, MAX_SESSION_REPS, true),
      ...(exercise.timed ? { durationSeconds: numeric(set.durationSeconds, 1, MAX_SESSION_DURATION_SECONDS, true) } : {}),
    })) }
  })
  return { ...initial, date: form.date, name: form.name.trim(), durationMinutes: form.durationMinutes.trim() ? numeric(form.durationMinutes, 1, MAX_SESSION_DURATION_SECONDS / 60, true, language === 'es' ? 'Duración' : 'Duration') : null, notes: form.notes.trim(), detailLevel: exercises.length ? form.complete ? 'complete' : 'partial' : 'attendance', exercises,
    ...(form.weeklyGoal ? { weeklyGoal: numeric(form.weeklyGoal, 1, 7, true, language === 'es' ? 'Meta semanal' : 'Weekly goal') } : {}),
  }
}
