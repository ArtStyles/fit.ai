import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { MeasurementRow } from '@/app/actions/measurements'
import { I18nProvider } from '@/components/i18n/I18nProvider'
import { MeasurementForm } from '../MeasurementForm'
import { MeasurementsClient } from '../MeasurementsClient'
import { WeightChart } from '../WeightChart'

function renderWithProviders(element: React.ReactElement, language: 'es' | 'en' = 'es') {
  return renderToStaticMarkup(
    <I18nProvider language={language} syncDocumentLanguage={false}>
      {element}
    </I18nProvider>,
  )
}

function measurement(overrides: Partial<MeasurementRow> = {}): MeasurementRow {
  return {
    id: '641ca1dc-3816-4b76-a474-c22b368d710a',
    recorded_at: '2026-08-16T12:00:00.000Z',
    weight_kg: 72.5,
    body_fat_percentage: 20,
    muscle_mass_kg: 34,
    chest_cm: null,
    waist_cm: 80,
    hips_cm: null,
    arms_cm: null,
    legs_cm: null,
    notes: null,
    ...overrides,
  }
}

describe('MeasurementsClient', () => {
  it('renders the empty state with a Settings-aware 44px navigation target', () => {
    const html = renderWithProviders(
      <MeasurementsClient initialMeasurements={[]} fromSettings />,
    )

    expect(html).toContain('Medidas corporales')
    expect(html).toContain('Peso, composición y perímetros')
    expect(html).toContain('Sin medidas registradas')
    expect(html).toContain('aria-label="Ajustes"')
    expect(html).toContain('href="/settings"')
    expect(html).toContain('min-h-11')
  })

  it('localizes headings, actions, metrics and dates from the active language', () => {
    const html = renderWithProviders(
      <MeasurementsClient initialMeasurements={[measurement()]} fromSettings={false} />,
      'en',
    )

    for (const copy of [
      'Body measurements',
      'Weight, composition, and circumferences',
      'Log measurement',
      'Latest measurement',
      'Body fat',
      'Muscle mass',
      'Weight progress',
      'History',
      'Aug 16, 2026',
    ]) expect(html).toContain(copy)
    expect(html).toContain('aria-label="Dashboard"')
    expect(html).not.toContain('Última medida')
  })

  it('uses shared measurement ranges and accessible 44px form controls', () => {
    const html = renderWithProviders(
      <MeasurementForm initial={measurement()} onSaved={() => undefined} onClose={() => undefined} />,
    )

    expect(html).toContain('name="weight_kg"')
    expect(html).toContain('min="30"')
    expect(html).toContain('max="300"')
    expect(html).toContain('name="body_fat_percentage"')
    expect(html).toContain('min="1"')
    expect(html).toContain('max="75"')
    expect(html).toContain('maxLength="500"')
    expect(html).toContain('min-h-11')
  })

  it('keeps chart hooks compatible with empty and single-point histories', () => {
    expect(renderWithProviders(<WeightChart data={[]} />)).toContain(
      'Registra al menos 2 medidas para ver la gráfica',
    )
    expect(renderWithProviders(<WeightChart data={[measurement()]} />)).toContain(
      'Registra al menos 2 medidas para ver la gráfica',
    )
  })
})
