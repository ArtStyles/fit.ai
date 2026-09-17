import { loadExerciseCatalogPage as loadPublicCatalogPage } from '../../../../src/app/actions/exerciseCatalog'
import { MUSCLE_GROUPS } from '@/lib/muscles/activity'
import { localizeEquipment, localizeExercise, localizeMuscleGroup } from '@/lib/exercises/localization'
import { getAppStore } from '../storage'
import { isConnectedRoute } from '../bridge-client'
import { isSelectableExercise } from './data'
import { uuid } from '../actions/state'

type Request = { page?: number; query?: string; muscle?: string; equipment?: string; includePersonal?: boolean }
const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase().trim()
const strings = (value: unknown): string[] => Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []

export async function loadExerciseCatalogPage(request: Request = {}) {
  if (request.includePersonal !== true) return loadPublicCatalogPage(request)
  if (isConnectedRoute()) throw new Error('Los ejercicios personales solo están disponibles en tu entrenamiento personal.')
  const store = await getAppStore(); const version = store.sessionVersion(); const state = await store.read()
  if (!state || store.sessionVersion() !== version || isConnectedRoute()) throw new Error('La cuenta o la pantalla cambió.')
  const profile = state.tables.profiles?.find(row => row.id === state.accountId)
  if (!profile) throw new Error('Perfil no encontrado.')
  const language = profile.language === 'en' ? 'en' : 'es'
  const all = (state.tables.exercises ?? []).filter(row => uuid(row.id) && isSelectableExercise(row, state.accountId))
  const page = Number.isInteger(request.page) && (request.page ?? 0) > 0 ? request.page! : 1
  const query = normalize(request.query ?? '')
  const filtered = all.filter(row => {
    const muscles = strings(row.muscle_groups); const equipment = strings(row.equipment)
    return (!query || normalize([row.name, row.name_es, ...muscles, ...strings(row.muscle_groups_es), ...equipment, ...strings(row.equipment_es)].filter(Boolean).join(' ')).includes(query))
      && (!request.muscle?.trim() || muscles.includes(request.muscle.trim()))
      && (!request.equipment?.trim() || equipment.includes(request.equipment.trim()))
  }).sort((a, b) => String(a.name).localeCompare(String(b.name), language) || a.id.localeCompare(b.id))
  return {
    items: filtered.slice((page - 1) * 24, page * 24).map(row => {
      const localized = localizeExercise({ ...row, name: String(row.name ?? ''), muscle_groups: strings(row.muscle_groups), equipment: strings(row.equipment) }, language)
      return { id: String(row.id), name: localized.name, muscleGroups: strings(localized.muscle_groups), equipment: strings(localized.equipment), imageUrl: row.image_url ?? null as string | null, exerciseType: row.exercise_type ?? null as string | null, personal: row.is_public === false }
    }),
    page, total: filtered.length, totalPages: Math.max(1, Math.ceil(filtered.length / 24)),
    facets: {
      muscles: [...new Set(all.flatMap(row => strings(row.muscle_groups)))].sort().map(value => ({ value, label: MUSCLE_GROUPS.find(group => group.id === value)?.[language] ?? localizeMuscleGroup(value, language) })),
      equipment: [...new Set(all.flatMap(row => strings(row.equipment)))].sort().map(value => ({ value, label: localizeEquipment(value, language) })),
    },
  }
}
