'use server'

import { requireAppUserContext } from '@/lib/auth/server'
import {
  getDistinctEquipment,
  getDistinctMuscleGroups,
  getExercises,
} from '@/lib/exercises/service'
import {
  exerciseLanguage,
  localizeEquipment,
  localizeMuscleGroup,
} from '@/lib/exercises/localization'

const PAGE_SIZE = 24

export async function loadExerciseCatalogPage(request: {
  page?: number
  query?: string
  muscle?: string
  equipment?: string
} = {}) {
  const { profile } = await requireAppUserContext()
  const language = exerciseLanguage(profile.language)
  const page = Number.isInteger(request.page) && (request.page ?? 0) > 0
    ? request.page!
    : 1
  const query = request.query?.trim() || undefined
  const muscle = request.muscle?.trim() || undefined
  const equipment = request.equipment?.trim() || undefined

  const [result, muscleGroups, equipmentValues] = await Promise.all([
    getExercises({
      page,
      limit: PAGE_SIZE,
      search: query,
      muscle_group: muscle,
      equipment,
    }, language),
    getDistinctMuscleGroups(),
    getDistinctEquipment(),
  ])

  return {
    items: result.exercises.map(exercise => ({
      id: exercise.id,
      name: exercise.name,
      muscleGroups: exercise.muscle_groups ?? [],
      equipment: exercise.equipment ?? [],
      imageUrl: exercise.image_url ?? null,
    })),
    page: result.page,
    total: result.total,
    totalPages: Math.max(1, result.totalPages),
    facets: {
      muscles: muscleGroups.map(value => ({ value, label: localizeMuscleGroup(value, language) })),
      equipment: equipmentValues.map(value => ({ value, label: localizeEquipment(value, language) })),
    },
  }
}
