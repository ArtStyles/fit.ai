import { describe, expect, it } from 'vitest'
import {
  registrationLegalLinks,
  registrationLocale,
  signupMetadata,
} from '../registerProfile'

describe('registration profile', () => {
  it('prefers an explicit supported locale', () => {
    expect(registrationLocale('en', 'es')).toBe('en')
    expect(registrationLocale('pt', 'en')).toBe('en')
  })

  it('does not require or invent a full name', () => {
    expect(signupMetadata('es')).toEqual({ preferred_language: 'es' })
  })

  it('uses locale-correct privacy and terms routes', () => {
    expect(registrationLegalLinks('es')).toEqual({
      privacy: '/es/privacidad',
      terms: '/es/terminos',
    })
    expect(registrationLegalLinks('en')).toEqual({
      privacy: '/en/privacy',
      terms: '/en/terms',
    })
  })
})
