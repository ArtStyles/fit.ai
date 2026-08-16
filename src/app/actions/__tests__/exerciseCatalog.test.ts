import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getExercises: vi.fn(),
  getDistinctMuscleGroups: vi.fn(),
  getDistinctEquipment: vi.fn(),
  requireAppUserContext: vi.fn(),
}))

vi.mock('@/lib/auth/server', () => ({ requireAppUserContext: mocks.requireAppUserContext }))
vi.mock('@/lib/exercises/service', () => ({
  getExercises: mocks.getExercises,
  getDistinctMuscleGroups: mocks.getDistinctMuscleGroups,
  getDistinctEquipment: mocks.getDistinctEquipment,
}))

import { loadExerciseCatalogPage } from '../exerciseCatalog'

function exercise(index: number) {
  return {
    id: `exercise-${index}`,
    name: `Exercise ${index}`,
    muscle_groups: ['chest'],
    equipment: ['barbell'],
    image_url: null,
  }
}

describe('loadExerciseCatalogPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requireAppUserContext.mockResolvedValue({ profile: { language: 'es' } })
    mocks.getDistinctMuscleGroups.mockResolvedValue(['chest'])
    mocks.getDistinctEquipment.mockResolvedValue(['barbell'])
    mocks.getExercises.mockImplementation(async filters => ({
      exercises: Array.from({ length: filters.limit }, (_, index) => exercise(index + 1)),
      total: 50,
      page: filters.page,
      limit: filters.limit,
      totalPages: Math.ceil(50 / filters.limit),
    }))
  })

  it('requests and serializes at most 24 exercises per page with localized facets', async () => {
    const result = await loadExerciseCatalogPage({
      page: 2,
      query: 'press',
      muscle: 'chest',
      equipment: 'barbell',
    })

    expect(mocks.requireAppUserContext).toHaveBeenCalledOnce()
    expect(mocks.getExercises).toHaveBeenCalledWith({
      page: 2,
      limit: 24,
      search: 'press',
      muscle_group: 'chest',
      equipment: 'barbell',
    }, 'es')
    expect(result.items).toHaveLength(24)
    expect(result).toMatchObject({
      page: 2,
      total: 50,
      totalPages: 3,
      facets: {
        muscles: [{ value: 'chest', label: 'pecho' }],
        equipment: [{ value: 'barbell', label: 'barra' }],
      },
    })
  })

  it('normalizes invalid pages and blank filters before querying', async () => {
    await loadExerciseCatalogPage({ page: -7, query: '  ', muscle: '', equipment: '' })

    expect(mocks.getExercises).toHaveBeenCalledWith({
      page: 1,
      limit: 24,
      search: undefined,
      muscle_group: undefined,
      equipment: undefined,
    }, 'es')
  })
})
