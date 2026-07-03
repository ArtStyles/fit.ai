import { describe, expect, it } from 'vitest'
import { createTranslator, normalizeLanguage, translate } from '..'

describe('UI translations', () => {
  it('normalizes unsupported languages to Spanish', () => {
    expect(normalizeLanguage('en')).toBe('en')
    expect(normalizeLanguage('fr')).toBe('es')
    expect(normalizeLanguage(null)).toBe('es')
  })

  it('translates known copy and safely falls back for unknown copy', () => {
    expect(translate('en', 'Ajustes')).toBe('Settings')
    expect(translate('es', 'Ajustes')).toBe('Ajustes')
    expect(translate('en', 'Vekira')).toBe('Vekira')
  })

  it('interpolates translated values', () => {
    const t = createTranslator('en')
    expect(t('Página {page}', { page: 3 })).toBe('Page 3')
  })
})
