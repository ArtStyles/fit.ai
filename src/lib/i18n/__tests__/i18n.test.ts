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
    ['Archivar', 'Archive'],
    ['El plan se archivará, pero tu historial permanecerá intacto.', 'The plan will be archived, but your history will remain intact.'],
    ['No se puede cambiar a Free', 'Cannot switch to Free'],
    ['Archiva planes hasta dejar como máximo dos familias vigentes e intenta nuevamente.', 'Archive plans until no more than two current families remain, then try again.'],
    ['Cambio de plan en curso', 'Plan change in progress'],
    ['Hay otra operación actualizando esta cuenta. Intenta nuevamente en unos segundos.', 'Another operation is updating this account. Try again in a few seconds.'],
  ])('translates plan retirement copy: %s', (source, expected) => {
    expect(translate('en', source)).toBe(expected)
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

  it.each([
    ['Ritmo de entrenamiento', 'Training rhythm'],
    ['Días este mes', 'Days this month'],
    ['Racha actual', 'Current streak'],
    ['Actividad del mes', 'Monthly activity'],
    ['Día seleccionado', 'Selected day'],
    ['Resumen anual', 'Year overview'],
    ['Evidencia acumulada', 'Accumulated evidence'],
    ['Tu progreso tiene dirección', 'Your progress has direction'],
    ['Sin comparación', 'No comparison'],
    ['Ejercicios destacados', 'Highlighted exercises'],
    ['Registro cronológico', 'Chronological log'],
    ['Hitos recientes', 'Recent milestones'],
    ['Debrief de entrenamiento', 'Workout debrief'],
    ['Secuencia de la sesión', 'Session sequence'],
    ['Series completadas', 'Completed sets'],
    ['Mostrar series', 'Show sets'],
    ['Pasaporte del movimiento', 'Movement passport'],
    ['Evolución de fuerza', 'Strength progression'],
    ['Último estímulo', 'Latest stimulus'],
    ['Mostrar instrucciones', 'Show instructions'],
    ['Reintentar', 'Try again'],
  ])('translates training evidence copy: %s', (source, expected) => {
    expect(translate('en', source)).toBe(expected)
  })

  it.each([
    ['No se pudo preparar la sesión. Inténtalo nuevamente.', 'The session could not be prepared. Try again.'],
    ['No se pudo respaldar la sesión. Libera espacio y vuelve a intentar.', 'The session could not be backed up. Free some space and try again.'],
    ['Preparando sesión…', 'Preparing session…'],
    ['No se pudo preparar la sesión.', 'The session could not be prepared.'],
    ['Reintentar autorización', 'Retry authorization'],
  ])('translates durable session authorization copy: %s', (source, expected) => {
    expect(translate('en', source)).toBe(expected)
  })
})
