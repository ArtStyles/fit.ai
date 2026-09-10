import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { buildPlanDistribution } from '../planViewModel'

vi.mock('@/components/i18n/I18nProvider', () => ({
  useI18n: () => ({ language: 'es', t: (text: string) => text }),
}))
import { PlanDistribution } from '../PlanDistribution'

describe('planned muscle map', () => {
  it('deduplicates muscle aliases per exercise before drawing totals', () => {
    const rows = [{ sets: 3, muscleGroups: ['Chest', 'pecho'] }]
    const html = renderToStaticMarkup(<PlanDistribution items={buildPlanDistribution(rows)} muscleActivity={rows} />)
    expect(html).toContain('Pecho: 3 series prescritas')
    expect(html).not.toContain('Pecho: 6 series prescritas')
  })

  it('keeps prescribed work without muscle metadata visible', () => {
    const rows = [{ sets: 2, muscleGroups: [] }]
    const html = renderToStaticMarkup(<PlanDistribution items={buildPlanDistribution(rows)} muscleActivity={rows} />)
    expect(html).toContain('data-muscle-map="planned"')
    expect(html).toContain('grupo no registrado (2)')
    expect(html).toContain('Pecho: 0 series prescritas')
  })

  it('shows the planned empty state when the plan has no exercises yet', () => {
    const html = renderToStaticMarkup(<PlanDistribution items={[]} muscleActivity={[]} />)
    expect(html).toContain('data-muscle-map="planned"')
    expect(html).toContain('Añade ejercicios a tu plan para ver su distribución.')
  })
})
