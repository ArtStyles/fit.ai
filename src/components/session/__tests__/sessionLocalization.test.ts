import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { translate } from '@/lib/i18n'

const controls = [
  '../SetRow.tsx',
  '../TimedSetRow.tsx',
  '../RPESelector.tsx',
].map(path => readFileSync(new URL(path, import.meta.url), 'utf8')).join('\n')

const labels: Array<[string, string]> = [
  ['Peso en kilogramos', 'Weight in kilograms'],
  ['Repeticiones', 'Reps'],
  ['Serie actual', 'Current set'],
  ['Serie completada', 'Set completed'],
  ['Completar serie', 'Complete set'],
  ['Reducir RPE', 'Decrease RPE'],
  ['Aumentar RPE', 'Increase RPE'],
  ['Pausar temporizador', 'Pause timer'],
  ['Iniciar temporizador', 'Start timer'],
  ['Reiniciar temporizador', 'Reset timer'],
  ['Intervalo completado', 'Interval completed'],
  ['Completar intervalo', 'Complete interval'],
  ['Tiempo', 'Time'],
  ['Peso', 'Weight'],
  ['Reps', 'Reps'],
  ['kg', 'kg'],
  ['reps', 'reps'],
  ['RPE', 'RPE'],
]

describe('session logging control localization', () => {
  it('provides complete Spanish and English labels', () => {
    for (const [spanish, english] of labels) {
      expect(translate('es', spanish)).toBe(spanish)
      expect(translate('en', spanish), spanish).toBe(english)
    }
  })

  it('routes touched visible and aria labels through the locale provider', () => {
    expect(controls.match(/useI18n\(\)/g)).toHaveLength(3)
    for (const [spanish] of labels.slice(0, 12)) {
      expect(controls).toContain(`t('${spanish}')`)
    }
    for (const label of ['Tiempo', 'kg', 'reps', 'RPE']) {
      expect(controls).toContain(`t('${label}')`)
    }
    expect(controls).not.toMatch(/aria-label=(?:"(?:Peso|Repeticiones|Serie|Completar|Reducir|Aumentar|Pausar|Iniciar|Reiniciar|Intervalo)|\{(?:completed|running) \? ')/)
  })
})
