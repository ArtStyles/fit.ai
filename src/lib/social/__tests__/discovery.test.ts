import { describe, it, expect } from 'vitest'
import { sanitizeSearch, dedupePreservingOrder } from '../discovery'

describe('sanitizeSearch', () => {
  it('recorta y colapsa espacios', () => {
    expect(sanitizeSearch('  hola   mundo ')).toBe('hola mundo')
  })
  it('elimina caracteres que rompen el filtro PostgREST', () => {
    expect(sanitizeSearch('a, b ( c ) *d%')).toBe('a b c d')
  })
  it('devuelve cadena vacía si no queda contenido útil', () => {
    expect(sanitizeSearch('   ')).toBe('')
    expect(sanitizeSearch(' , ( ) ')).toBe('')
  })
})

describe('dedupePreservingOrder', () => {
  it('quita duplicados conservando el primer orden de aparición', () => {
    expect(dedupePreservingOrder(['a', 'b', 'a', 'c', 'b'])).toEqual(['a', 'b', 'c'])
  })
  it('tolera lista vacía', () => {
    expect(dedupePreservingOrder([])).toEqual([])
  })
})
