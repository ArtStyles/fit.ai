export function orderedIdsToUpdates(orderedIds: string[]): { id: string; order_index: number }[] {
  return orderedIds.map((id, index) => ({ id, order_index: index + 1 }))
}

export function selectedExerciseIds(formData: FormData): string[] | null {
  const multiple = formData.getAll('exerciseIds')
  const values = multiple.length > 0 ? multiple : [formData.get('exerciseId')]
  const ids = Array.from(new Set(values.flatMap(value => {
    if (typeof value !== 'string') return []
    const normalized = value.trim()
    return normalized ? [normalized] : []
  })))

  return ids.length > 0 && ids.length <= 12 ? ids : null
}
