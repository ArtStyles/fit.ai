type CatalogRequest = {
  page?: number
  query?: string
  muscle?: string
  equipment?: string
}

const allOptions = Array.from({ length: 30 }, (_, index) => ({
  id: `exercise-${String(index + 1).padStart(2, '0')}`,
  name: `Ejercicio ${String(index + 1).padStart(2, '0')}`,
  muscleGroups: [index % 2 === 0 ? 'Pecho' : 'Espalda'],
  equipment: [index % 2 === 0 ? 'Barra' : 'Mancuernas'],
  imageUrl: null,
}))

export async function loadExerciseCatalogPage(request: CatalogRequest = {}) {
  const page = Math.max(1, request.page ?? 1)
  const pageSize = 24
  const start = (page - 1) * pageSize
  ;(window as Window & { __CATALOG_REQUESTS__?: CatalogRequest[] }).__CATALOG_REQUESTS__ ??= []
  ;(window as Window & { __CATALOG_REQUESTS__?: CatalogRequest[] }).__CATALOG_REQUESTS__!.push(request)

  return {
    items: allOptions.slice(start, start + pageSize),
    page,
    total: allOptions.length,
    totalPages: Math.ceil(allOptions.length / pageSize),
    facets: {
      muscles: [{ value: 'Pecho', label: 'Pecho' }, { value: 'Espalda', label: 'Espalda' }],
      equipment: [{ value: 'Barra', label: 'Barra' }, { value: 'Mancuernas', label: 'Mancuernas' }],
    },
  }
}
