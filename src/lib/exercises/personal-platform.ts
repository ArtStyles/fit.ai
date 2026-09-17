import type { PersonalExercise, PersonalExerciseContext, PersonalExerciseInput, PersonalExerciseOption } from './personal-types'

export const supportsPersonalExercises = false
export async function loadPersonalExerciseContext(): Promise<PersonalExerciseContext | null> { return null }
export async function getPersonalExerciseById(_id: string, _expectedAccountId?: string): Promise<PersonalExercise | null> { return null }
export async function createPersonalExercise(_input: PersonalExerciseInput): Promise<PersonalExerciseOption> {
  throw new Error('Los ejercicios personales están disponibles en la aplicación Android.')
}
