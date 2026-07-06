import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { translate } from '@/lib/i18n'

const dashboardEnglish: [string, string][] = [
  ['Completado hoy', 'Completed today'],
  ['lunes', 'Monday'],
  ['martes', 'Tuesday'],
  ['miércoles', 'Wednesday'],
  ['jueves', 'Thursday'],
  ['viernes', 'Friday'],
  ['sábado', 'Saturday'],
  ['domingo', 'Sunday'],
  ['{completed} de {scheduled} sesiones', '{completed} of {scheduled} sessions'],
  ['Ver plan completo', 'View full plan'],
  ['Nota de tu plan', 'Plan note'],
  ['Ya completaste una sesión hoy.', 'You already completed a session today.'],
  ['Tu próxima sesión es {workout} el {day}.', 'Your next session is {workout} on {day}.'],
  ['No hay otra sesión programada esta semana.', 'There are no more sessions scheduled this week.'],
  ['Próxima: {workout} · {day}', 'Next: {workout} · {day}'],
  ['{count} ejercicio', '{count} exercise'],
  ['{count} ejercicios', '{count} exercises'],
  ['{minutes} min', '{minutes} min'],
  ['{workout} · {day}', '{workout} · {day}'],
  ['{count} progresión sugerida', '{count} suggested progression'],
  ['{count} progresiones sugeridas', '{count} suggested progressions'],
  ['Fecha no disponible', 'Date unavailable'],
  ['Peso corporal', 'Bodyweight'],
  ['{weight} kg', '{weight} kg'],
  ['{count} repetición', '{count} rep'],
  ['{count} repeticiones', '{count} reps'],
  ['Recupera energía hoy para llegar preparado a tu próxima sesión.', 'Recover today so you are ready for your next session.'],
  ['La sesión de hoy ya está hecha. Prioriza tu recuperación.', 'Today’s session is complete. Prioritize your recovery.'],
  ['Estado semanal', 'Weekly status'],
  ['Ver sesión completada', 'View completed session'],
  ['Recupera tu sesión pendiente', 'Make up your pending session'],
  ['Entrenar ahora', 'Train now'],
  ['Revisa los ajustes de tu plan', 'Review your plan adjustments'],
  ['Ver ajustes', 'View adjustments'],
  ['Siguiente recomendación', 'Next recommendation'],
  ['Prepara tu próxima sesión', 'Prepare for your next session'],
  ['A continuación', 'Up next'],
  ['Preguntar al coach', 'Ask the coach'],
  ['Volumen semanal', 'Weekly volume'],
  ['Tendencia de volumen', 'Volume trend'],
]

describe('dashboard English catalog', () => {
  it('translates every new dashboard key without a Spanish fallback', () => {
    for (const [source, expected] of dashboardEnglish) {
      expect(translate('en', source), source).toBe(expected)
    }
  })

  it('interpolates complete dashboard templates in English', () => {
    expect(translate('en', '{completed} de {scheduled} sesiones', { completed: 2, scheduled: 4 }))
      .toBe('2 of 4 sessions')
    expect(translate('en', 'Próxima: {workout} · {day}', { workout: 'Strength', day: 'Tuesday' }))
      .toBe('Next: Strength · Tuesday')
  })
})

describe('dashboard component localization boundaries', () => {
  const sources = [
    '../TodayActionCard.tsx',
    '../WeeklyStatus.tsx',
    '../NextRecommendation.tsx',
    '../AINotesBanner.tsx',
  ].map(path => readFileSync(new URL(path, import.meta.url), 'utf8')).join('\n')

  it('does not assemble Spanish grammar outside the translator', () => {
    expect(sources).not.toMatch(/\{weekly\.completed\}\s+de\s+\{weekly\.scheduled\}/)
    expect(sources).not.toContain('const DAY_NAMES')
    expect(sources).not.toMatch(/`\$\{recommendation\.workout\.name\}.*DAY_NAMES/)
  })
})
