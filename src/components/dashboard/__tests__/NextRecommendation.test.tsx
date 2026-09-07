import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { NextRecommendation } from '../NextRecommendation'

vi.mock('next/navigation', () => ({
  usePathname: () => '/dashboard',
}))

vi.mock('@/components/i18n/I18nProvider', () => ({
  useI18n: () => ({ t: (source: string) => source }),
}))

describe('NextRecommendation AI access', () => {
  it('keeps the plan action without exposing the AI coach from Home', () => {
    const html = renderToStaticMarkup(
      <NextRecommendation recommendation={{
        kind: 'plan-adjustment',
        adjustmentCount: 2,
        href: '/plan',
      }} />,
    )

    expect(html).toContain('href="/plan"')
    expect(html).not.toContain('href="/chat"')
    expect(html).not.toContain('Preguntar al coach')
  })
})
