import { describe, it, expect } from 'vitest'
import { normalizeUsername, validateUsername } from '../username'

describe('normalizeUsername', () => {
  it('recorta y pasa a minúsculas', () => {
    expect(normalizeUsername('  ArtStyles ')).toBe('artstyles')
  })
})

describe('validateUsername', () => {
  it('acepta uno válido y devuelve el valor normalizado', () => {
    expect(validateUsername('Art_Styles')).toEqual({ ok: true, value: 'art_styles' })
  })
  it('rechaza menos de 3 caracteres', () => {
    expect(validateUsername('ab').ok).toBe(false)
  })
  it('rechaza más de 20 caracteres', () => {
    expect(validateUsername('a'.repeat(21)).ok).toBe(false)
  })
  it('rechaza si empieza por dígito', () => {
    expect(validateUsername('1abc').ok).toBe(false)
  })
  it('rechaza caracteres ilegales', () => {
    expect(validateUsername('a b').ok).toBe(false)
    expect(validateUsername('a-b').ok).toBe(false)
  })
})
