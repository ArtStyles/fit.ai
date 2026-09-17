import { MUSCLE_GROUPS, type MuscleGroupId } from '@/lib/muscles/activity'
import { getPersonalIllustration } from '@/lib/exercises/personal-illustrations'
import { localizeExercise } from '@/lib/exercises/localization'
import type { PersonalExercise, PersonalExerciseContext, PersonalExerciseInput, PersonalExerciseOption } from '@/lib/exercises/personal-types'
import { uuid } from '../actions/state'
import type { AppRow, AppState, AppStore } from '../storage'

export const isSelectableExercise = (row: AppRow, accountId: string) => row.is_public === true || (row.is_public === false && row.user_id === accountId)
export const personalExerciseError = (code: 'account-changed' | 'invalid-fields' | 'invalid-illustration' | 'identity-conflict' | 'profile-unavailable', message: string) => Object.assign(new Error(message), { code })
const changed = () => personalExerciseError('account-changed', 'La cuenta cambió. Vuelve a abrir esta pantalla.')
const languageOf = (state: AppState): 'es' | 'en' => state.tables.profiles?.find(row => row.id === state.accountId)?.language === 'en' ? 'en' : 'es'
const muscleIds = new Set<string>(MUSCLE_GROUPS.map(group => group.id))

function normalized(input: PersonalExerciseInput) {
  if (!input || !uuid(input.accountId) || !uuid(input.operationId) || !Number.isSafeInteger(input.sessionVersion) || input.sessionVersion < 0) throw personalExerciseError('invalid-fields', 'Identidad de ejercicio inválida.')
  if (typeof input.name !== 'string' || !input.name.trim() || input.name.length > 120 || typeof input.description !== 'string' || input.description.length > 2000) throw personalExerciseError('invalid-fields', 'Revisa el nombre y la descripción del ejercicio.')
  if (!['reps', 'time'].includes(input.recording) || !Array.isArray(input.muscleGroups) || input.muscleGroups.length > MUSCLE_GROUPS.length || input.muscleGroups.some(id => !muscleIds.has(id))) throw personalExerciseError('invalid-fields', 'Revisa los músculos y el tipo de registro.')
  const muscleGroups = [...new Set(input.muscleGroups)].sort() as MuscleGroupId[]
  if (input.illustration !== null && (!getPersonalIllustration(input.illustration) || !muscleGroups.includes(input.illustration))) throw personalExerciseError('invalid-illustration', 'La ilustración debe corresponder a un músculo seleccionado.')
  return { name: input.name.trim(), description: input.description.trim(), muscleGroups, recording: input.recording, illustration: input.illustration }
}

function option(row: PersonalExercise, language: 'es' | 'en'): PersonalExerciseOption {
  const item = localizeExercise(row, language)
  return { id: item.id, name: item.name, muscleGroups: item.muscle_groups, equipment: item.equipment, imageUrl: item.image_url, exerciseType: item.exercise_type!, personal: true }
}

/** Private rows live only in the account snapshot; the public SQL catalog has no owner column. */
export function createPersonalExerciseService(store: AppStore, canCreate = () => true) {
  async function capture() {
    const version = store.sessionVersion(); const state = await store.read()
    if (store.sessionVersion() !== version) throw changed()
    return { state, version }
  }
  return {
    async loadContext(): Promise<PersonalExerciseContext | null> {
      const { state, version } = await capture()
      if (!state || !state.tables.profiles?.some(row => row.id === state.accountId)) return null
      return { accountId: state.accountId, sessionVersion: version, language: languageOf(state) }
    },
    async getById(id: string, expectedAccountId?: string): Promise<PersonalExercise | null> {
      const { state } = await capture()
      if (expectedAccountId !== undefined && state?.accountId !== expectedAccountId) throw changed()
      const row = state?.tables.exercises?.find(item => item.id === id && item.is_public === false && item.user_id === state.accountId)
      return row ? { ...structuredClone(row), motion_preview_url: null } as PersonalExercise : null
    },
    async create(input: PersonalExerciseInput): Promise<PersonalExerciseOption> {
      const payload = normalized(input)
      const { state: captured, version } = await capture()
      if (!captured || captured.accountId !== input.accountId || version !== input.sessionVersion) throw changed()
      return store.mutate(state => {
        if (state.accountId !== input.accountId || store.sessionVersion() !== input.sessionVersion || !canCreate()) throw changed()
        if (!state.tables.profiles?.some(row => row.id === state.accountId)) throw personalExerciseError('profile-unavailable', 'Perfil no encontrado.')
        const rows = state.tables.exercises ?? []
        const existing = rows.find(row => row.id === input.operationId)
        if (existing) {
          if (existing.is_public !== false || existing.user_id !== input.accountId || existing.source !== 'mobile-personal' || JSON.stringify(existing.mobile_personal_exercise?.input) !== JSON.stringify(payload)) throw personalExerciseError('identity-conflict', 'Este identificador ya pertenece a otro ejercicio.')
          return option(existing as PersonalExercise, languageOf(state))
        }
        const row: PersonalExercise & AppRow = {
          id: input.operationId, user_id: state.accountId, is_public: false, source: 'mobile-personal', external_id: null, wger_id: null,
          name: payload.name, name_es: null, description: payload.description || null, description_es: null,
          muscle_groups: payload.muscleGroups, muscle_groups_es: payload.muscleGroups.map(id => MUSCLE_GROUPS.find(group => group.id === id)!.es),
          equipment: [], equipment_es: [], exercise_type: payload.recording === 'time' ? 'flexibility' : 'strength', difficulty: null, is_compound: false,
          image_url: getPersonalIllustration(payload.illustration)?.src ?? null, instructions: null, instructions_es: null, video_url: null, motion_preview_url: null,
          created_at: new Date().toISOString(), mobile_personal_exercise: { version: 1, input: payload },
        }
        state.tables.exercises = [...rows, row]
        return option(row, languageOf(state))
      })
    },
  }
}
