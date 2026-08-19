import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { getMeasurements } = vi.hoisted(() => ({ getMeasurements: vi.fn() }))

vi.mock('@/app/actions/measurements', () => ({ getMeasurements }))
vi.mock('@/components/measurements/MeasurementsClient', () => ({
  MeasurementsClient: ({ fromSettings }: { fromSettings: boolean }) => (
    <p data-back-target={fromSettings ? '/settings' : '/dashboard'}>measurements</p>
  ),
}))

describe('MedidasPage', () => {
  beforeEach(() => getMeasurements.mockResolvedValue([]))

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
})
