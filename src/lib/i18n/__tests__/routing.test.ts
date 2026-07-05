import { describe, expect, it } from 'vitest'
import { alternateLocalePath, isPublicLocale, localizedPath } from '../routing'

describe('public locale routing', () => {
  it('accepts only es and en', () => {
    expect(isPublicLocale('es')).toBe(true)
    expect(isPublicLocale('en')).toBe(true)
    expect(isPublicLocale('pt')).toBe(false)
  })

  it('builds localized named routes', () => {
    expect(localizedPath('es', 'home')).toBe('/es')
    expect(localizedPath('en', 'personalized-workouts')).toBe('/en/personalized-workouts')
  })

  it('switches locale without retaining a translated slug', () => {
    expect(alternateLocalePath('/es/entrenamiento-personalizado', 'en'))
      .toBe('/en/personalized-workouts')
  })
})
