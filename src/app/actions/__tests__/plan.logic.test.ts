import { describe, it, expect } from 'vitest'
import { orderedIdsToUpdates } from '../plan.logic'

describe('orderedIdsToUpdates', () => {
  it('asigna order_index 1-based en el orden dado', () => {
    expect(orderedIdsToUpdates(['c', 'a', 'b'])).toEqual([
      { id: 'c', order_index: 1 },
      { id: 'a', order_index: 2 },
      { id: 'b', order_index: 3 },
    ])
  })
  it('devuelve [] con lista vacía', () => {
    expect(orderedIdsToUpdates([])).toEqual([])
  })
})
