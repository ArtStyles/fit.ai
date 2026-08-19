import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { getMeasurements } = vi.hoisted(() => ({ getMeasurements: vi.fn() }))

vi.mock('@/app/actions/measurements', () => ({ getMeasurements }))
vi.mock('@/components/measurements/MeasurementsClient', () => ({
  MeasurementsClient: ({ fromSettings, initialLoadError }: { fromSettings: boolean; initialLoadError: string | null }) => (
    <p data-back-target={fromSettings ? '/settings' : '/dashboard'} data-load-error={initialLoadError ?? ''}>measurements</p>
  ),
}))

describe('MedidasPage', () => {
  beforeEach(() => getMeasurements.mockResolvedValue({ success: true, measurements: [] }))

  const sources: Array<[{ from?: string | string[] } | undefined, string]> = [
    [{ from: 'settings' }, '/settings'],
    [undefined, '/dashboard'],
    [{ from: 'dashboard' }, '/dashboard'],
    [{ from: ['settings'] }, '/dashboard'],
    [{ from: ['settings', 'dashboard'] }, '/dashboard'],
  ]

  it.each(sources)('maps only the exact scalar settings source to the Settings back target', async (searchParams, target) => {
    const { default: MedidasPage } = await import('../page')
    const html = renderToStaticMarkup(await MedidasPage({ searchParams }))

    expect(html).toContain(`data-back-target="${target}"`)
  })

  it('passes a load failure to the client while preserving the Settings back target', async () => {
    getMeasurements.mockResolvedValue({
      success: false,
      measurements: [],
      error: 'No se pudieron cargar las medidas.',
    })
    const { default: MedidasPage } = await import('../page')
    const html = renderToStaticMarkup(await MedidasPage({ searchParams: { from: 'settings' } }))

    expect(html).toContain('data-back-target="/settings"')
    expect(html).toContain('data-load-error="No se pudieron cargar las medidas."')
  })
})
