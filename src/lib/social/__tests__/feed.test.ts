import { describe, it, expect } from 'vitest'
import { encodeCursor, decodeCursor, FEED_PAGE_SIZE } from '../feed'

describe('cursor del feed', () => {
  it('codifica y decodifica ida y vuelta', () => {
    const c = { createdAt: '2026-06-24T18:00:00Z', id: 'abc-123' }
    const token = encodeCursor(c)
    expect(typeof token).toBe('string')
    expect(decodeCursor(token)).toEqual(c)
  })

  it('devuelve null para tokens vacíos o corruptos', () => {
    expect(decodeCursor(null)).toBeNull()
    expect(decodeCursor(undefined)).toBeNull()
    expect(decodeCursor('@@no-base64@@')).toBeNull()
  })

  it('expone un tamaño de página', () => {
    expect(FEED_PAGE_SIZE).toBeGreaterThan(0)
  })
})
