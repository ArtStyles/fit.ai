import { describe, it, expect } from 'vitest'
import { payloadHasValue } from '../measurements.logic'

describe('payloadHasValue', () => {
  it('es true si hay al menos un valor numérico', () => {
    expect(payloadHasValue({ weight_kg: 74.2 })).toBe(true)
  })
  it('es false con todo null/undefined', () => {
    expect(payloadHasValue({ weight_kg: null, notes: null })).toBe(false)
    expect(payloadHasValue({})).toBe(false)
  })
  it('trata la cadena vacía como sin valor', () => {
    expect(payloadHasValue({ notes: '' })).toBe(false)
  })
  it('es true con una nota no vacía', () => {
    expect(payloadHasValue({ notes: 'ok' })).toBe(true)
  })
})
