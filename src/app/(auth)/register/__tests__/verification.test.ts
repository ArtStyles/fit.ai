import { describe, it, expect } from 'vitest'
import {
  normalizeCode,
  validateCode,
  getVerifyErrorMessage,
  getResendErrorMessage,
} from '../verification'

describe('normalizeCode', () => {
  it('keeps only digits and caps at 6', () => {
    expect(normalizeCode('12 34-56')).toBe('123456')
    expect(normalizeCode('1234567')).toBe('123456')
    expect(normalizeCode('abc12')).toBe('12')
    expect(normalizeCode('')).toBe('')
  })
})

describe('validateCode', () => {
  it('returns null for exactly 6 digits', () => {
    expect(validateCode('123456')).toBeNull()
  })

  it('returns an error message for wrong length or non-digits', () => {
    expect(validateCode('123')).toBe('Ingresa el código de 6 dígitos.')
    expect(validateCode('12345a')).toBe('Ingresa el código de 6 dígitos.')
    expect(validateCode('')).toBe('Ingresa el código de 6 dígitos.')
  })
})

describe('getVerifyErrorMessage', () => {
  it('maps expired/invalid tokens to a resend hint', () => {
    expect(getVerifyErrorMessage('Token has expired or is invalid')).toBe(
      'El código expiró o no es válido. Reenvía uno nuevo.',
    )
    expect(getVerifyErrorMessage('Invalid token')).toBe(
      'El código expiró o no es válido. Reenvía uno nuevo.',
    )
  })

  it('maps rate limit errors', () => {
    expect(getVerifyErrorMessage('Too many requests')).toBe(
      'Demasiados intentos. Espera un momento e intenta de nuevo.',
    )
  })

  it('falls back to a generic message', () => {
    expect(getVerifyErrorMessage('boom')).toBe(
      'No se pudo verificar el código. Intenta nuevamente.',
    )
  })
})

describe('getResendErrorMessage', () => {
  it('maps rate limit / security cooldown errors', () => {
    expect(
      getResendErrorMessage('For security purposes, you can only request this after 41 seconds.'),
    ).toBe('Espera un momento antes de pedir otro código.')
    expect(getResendErrorMessage('rate limit exceeded')).toBe(
      'Espera un momento antes de pedir otro código.',
    )
  })

  it('falls back to a generic message', () => {
    expect(getResendErrorMessage('boom')).toBe(
      'No se pudo reenviar el código. Intenta nuevamente.',
    )
  })
})
