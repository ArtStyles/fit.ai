import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { ClientMeasurementsPanel } from '../ClientMeasurementsPanel'

describe('ClientMeasurementsPanel', () => {
  it('renders only dated available measurement values', () => {
    const html = renderToStaticMarkup(<ClientMeasurementsPanel measurements={[{
      recordedOn: '2026-08-08', weightKg: 70.5, bodyFatPercentage: null, muscleMassKg: 31.2,
      chestCm: null, waistCm: 80, hipsCm: null, armsCm: null, legsCm: null,
    }]} />)

    expect(html).toContain('2026-08-08')
    expect(html).toContain('70.5 kg')
    expect(html).toContain('31.2 kg')
    expect(html).toContain('80 cm')
    expect(html).not.toContain('Grasa corporal')
    expect(html).not.toMatch(/diagnóstico|recomendación|tendencia|objetivo|<form|<button|<input/i)
  })

  it('renders an accessible empty state without clinical interpretation', () => {
    const html = renderToStaticMarkup(<ClientMeasurementsPanel measurements={[]} />)

    expect(html).toContain('No hay medidas corporales compartidas en este periodo.')
    expect(html).toContain('aria-live="polite"')
  })

  it('treats a dated row with no available values as an accessible empty state', () => {
    const html = renderToStaticMarkup(<ClientMeasurementsPanel measurements={[{
      recordedOn: '2026-08-08', weightKg: null, bodyFatPercentage: null, muscleMassKg: null,
      chestCm: null, waistCm: null, hipsCm: null, armsCm: null, legsCm: null,
    }]} />)

    expect(html).toContain('No hay medidas corporales compartidas en este periodo.')
    expect(html).not.toContain('2026-08-08')
  })
})
