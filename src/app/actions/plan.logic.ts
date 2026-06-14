export function orderedIdsToUpdates(orderedIds: string[]): { id: string; order_index: number }[] {
  return orderedIds.map((id, index) => ({ id, order_index: index + 1 }))
}
