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
    expect(translate('en', 'Actualizando contenido')).toBe('Updating content')
  })

  it('interpolates translated values', () => {
    const t = createTranslator('en')
    expect(t('Página {page}', { page: 3 })).toBe('Page 3')
  })

  it.each([
    ['Ajustar plan', 'Adjust plan'],
    ['Días por semana', 'Days per week'],
    ['Equipamiento no disponible', 'Unavailable equipment'],
    ['Vista previa del ajuste', 'Adjustment preview'],
    ['Aplicar ajuste', 'Apply adjustment'],
    ['El motor recalculará y validará el plan completo antes de aplicar el cambio.', 'The engine will recalculate and validate the complete plan before applying the change.'],
  ])('translates structured plan adjustment copy: %s', (source, expected) => {
    expect(translate('en', source)).toBe(expected)
  })
})
