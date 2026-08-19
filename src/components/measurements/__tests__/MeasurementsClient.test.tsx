import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

const { refresh } = vi.hoisted(() => ({ refresh: vi.fn() }))

vi.mock('next/navigation', () => ({
  usePathname: () => '/medidas',
  useRouter: () => ({ refresh }),
}))
import type { MeasurementRow } from '@/app/actions/measurements'
import { I18nProvider } from '@/components/i18n/I18nProvider'
import { MeasurementHistory } from '../MeasurementHistory'
import { MeasurementForm } from '../MeasurementForm'
import * as MeasurementFormModule from '../MeasurementForm'
import { MeasurementsClient, refreshMeasurementsRoute } from '../MeasurementsClient'
import { WeightChart } from '../WeightChart'

function renderWithProviders(
  element: React.ReactElement,
  language: 'es' | 'en' = 'es',
  timeZone = 'America/Havana',
) {
  return renderToStaticMarkup(
    <I18nProvider language={language} timeZone={timeZone} syncDocumentLanguage={false}>
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

type FormInteractionContract = {
  createMeasurementDraft?: (initial?: MeasurementRow) => Record<string, string>
  measurementPayloadFromDraft?: (draft: Record<string, string>) => Record<string, number | string | null>
  submitMeasurementInteraction?: (
    action: () => Promise<{
      success: boolean
      id?: string
      error?: string
      fieldErrors?: Record<string, string>
    }>,
    onPendingChange?: (pending: boolean) => void,
  ) => Promise<{
    ok: boolean
    id?: string
    error?: string
    fieldErrors: Record<string, string>
  }>
  shouldRevealExtraMeasurementFields?: (fieldErrors: Record<string, string>) => boolean
}

const formContract = MeasurementFormModule as unknown as FormInteractionContract

describe('MeasurementsClient', () => {
  it('retries a failed load through an App Router refresh', () => {
    refreshMeasurementsRoute({ refresh })

    expect(refresh).toHaveBeenCalledOnce()
  })

  it('renders a retryable load error instead of the empty-history state', () => {
    const html = renderWithProviders(
      <MeasurementsClient
        initialMeasurements={[]}
        initialLoadError="No se pudieron cargar las medidas."
        fromSettings
      />,
    )

    expect(html).toContain('role="alert"')
    expect(html).toContain('No se pudieron cargar las medidas.')
    expect(html).toContain('Reintentar')
    expect(html).not.toContain('Sin medidas registradas')
    expect(html).not.toContain('aria-label="Registrar"')
    expect(html).toContain('aria-label="Ajustes"')
  })

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

  it('formats measurement timestamps with the profile timezone', () => {
    const boundary = measurement({ recorded_at: '2026-08-20T03:30:00.000Z' })
    const havana = renderWithProviders(
      <MeasurementsClient initialMeasurements={[boundary]} fromSettings={false} />,
      'en',
      'America/Havana',
    )
    const utc = renderWithProviders(
      <MeasurementsClient initialMeasurements={[boundary]} fromSettings={false} />,
      'en',
      'UTC',
    )

    expect(havana).toContain('Aug 19, 2026')
    expect(utc).toContain('Aug 20, 2026')
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

  it('preserves edited circumferences in the payload after their section is collapsed', () => {
    const createDraft = formContract.createMeasurementDraft
    const payloadFromDraft = formContract.measurementPayloadFromDraft
    expect(createDraft).toBeTypeOf('function')
    expect(payloadFromDraft).toBeTypeOf('function')
    if (!createDraft || !payloadFromDraft) return

    const expandedDraft = createDraft(measurement({ chest_cm: 96, hips_cm: 99 }))
    const editedBeforeCollapse = { ...expandedDraft, chest_cm: '101.5' }
    const payloadAfterCollapse = payloadFromDraft(editedBeforeCollapse)

    expect(payloadAfterCollapse.chest_cm).toBe(101.5)
    expect(payloadAfterCollapse.hips_cm).toBe(99)
  })

  it('keeps field errors and the form open when submission fails or rejects', async () => {
    const submit = formContract.submitMeasurementInteraction
    expect(submit).toBeTypeOf('function')
    if (!submit) return

    await expect(submit(async () => ({
      success: false,
      error: 'Revisa los campos de la medida.',
      fieldErrors: { chest_cm: 'Debe ser un número entre 10 y 300.' },
    }))).resolves.toEqual({
      ok: false,
      error: 'Revisa los campos de la medida.',
      fieldErrors: { chest_cm: 'Debe ser un número entre 10 y 300.' },
    })

    await expect(submit(async () => { throw new Error('offline') })).resolves.toEqual({
      ok: false,
      error: 'No se pudo guardar la medida.',
      fieldErrors: {},
    })
  })

  it('confines other mutations for the complete async submission window', async () => {
    const submit = formContract.submitMeasurementInteraction
    expect(submit).toBeTypeOf('function')
    if (!submit) return

    let release!: (result: { success: true; id: string }) => void
    const action = new Promise<{ success: true; id: string }>(resolve => { release = resolve })
    const transitions: boolean[] = []

    const submission = submit(() => action, pending => transitions.push(pending))
    expect(transitions).toEqual([true])

    release({ success: true, id: '641ca1dc-3816-4b76-a474-c22b368d710a' })
    await expect(submission).resolves.toMatchObject({ ok: true })
    expect(transitions).toEqual([true, false])
  })

  it('reveals collapsed circumference controls when the server rejects one of them', () => {
    const shouldReveal = formContract.shouldRevealExtraMeasurementFields
    expect(shouldReveal).toBeTypeOf('function')
    if (!shouldReveal) return

    expect(shouldReveal({ chest_cm: 'Debe ser un número entre 10 y 300.' })).toBe(true)
    expect(shouldReveal({ weight_kg: 'Debe ser un número entre 30 y 300.' })).toBe(false)
  })

  it('renders muscle mass as a unique history metric instead of an empty row', () => {
    const html = renderWithProviders(
      <MeasurementHistory
        rows={[measurement({
          weight_kg: null,
          body_fat_percentage: null,
          muscle_mass_kg: 34.5,
          waist_cm: null,
        })]}
        onDelete={() => undefined}
        onEdit={() => undefined}
        disabled={false}
        pendingDeleteId={null}
      />,
    )

    expect(html.match(/34,5 kg masa muscular/g)).toHaveLength(1)
    expect(html).not.toContain('Sin datos principales')
  })

  it('keeps the operation live region mounted in the empty state', () => {
    const html = renderWithProviders(
      <MeasurementsClient initialMeasurements={[]} fromSettings />,
    )

    expect(html).toContain('aria-live="polite"')
    expect(html).toContain('aria-atomic="true"')
  })
})
