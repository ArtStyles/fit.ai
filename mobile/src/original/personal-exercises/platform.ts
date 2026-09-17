import type { PersonalExerciseInput } from '@/lib/exercises/personal-types'
import { isConnectedRoute } from '../bridge-client'
import { getAppStore } from '../storage'
import { createPersonalExerciseService, personalExerciseError } from './data'

export const supportsPersonalExercises = true
export async function loadPersonalExerciseContext() {
  if (isConnectedRoute()) return null
  const context = await createPersonalExerciseService(await getAppStore()).loadContext()
  return isConnectedRoute() ? null : context
}
export async function getPersonalExerciseById(id: string, expectedAccountId?: string) {
  if (isConnectedRoute()) return null
  const exercise = await createPersonalExerciseService(await getAppStore()).getById(id, expectedAccountId)
  return isConnectedRoute() ? null : exercise
}
export async function createPersonalExercise(input: PersonalExerciseInput) {
  if (isConnectedRoute()) throw personalExerciseError('account-changed', 'Los ejercicios personales solo se pueden usar en tu entrenamiento personal.')
  const service = createPersonalExerciseService(await getAppStore(), () => !isConnectedRoute())
  if (isConnectedRoute()) throw personalExerciseError('account-changed', 'La pantalla cambió. Vuelve a abrir el ejercicio.')
  const exercise = await service.create(input)
  if (isConnectedRoute()) throw personalExerciseError('account-changed', 'La pantalla cambió. Vuelve a abrir el ejercicio.')
  return exercise
}
