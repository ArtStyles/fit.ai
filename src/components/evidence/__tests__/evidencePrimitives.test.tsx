import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { I18nProvider } from '@/components/i18n/I18nProvider'
import { EvidenceHero } from '../EvidenceHero'
import { EvidenceInsight } from '../EvidenceInsight'
import { EvidenceRouteError } from '../EvidenceRouteError'
import { MetricStrip } from '../MetricStrip'

describe('evidence primitives', () => {
  it('keeps the page h1 owned by PageTopBar', () => {
    const html = renderToStaticMarkup(
      <EvidenceHero eyebrow="Evidence" title="Progress" description="Measured data" />,
    )

    expect(html).toContain('<h2')
    expect(html).not.toContain('<h1')
  })

  it('renders metric labels beside values without nested cards', () => {
    const html = renderToStaticMarkup(
      <MetricStrip items={[{ label: 'Sessions', value: '3', detail: '12 weeks' }]} />,
    )

    expect(html).toContain('<dt')
    expect(html).toContain('Sessions')
    expect(html).toContain('3')
    expect(html).toContain('data-evidence-metrics')
  })

  it('pairs an insight tone with visible text', () => {
    const html = renderToStaticMarkup(
      <EvidenceInsight title="Measured change" tone="success">Volume increased</EvidenceInsight>,
    )

    expect(html).toContain('data-evidence-tone="success"')
    expect(html).toContain('Measured change')
    expect(html).toContain('Volume increased')
  })

  it('announces route failures and exposes retry', () => {
    const html = renderToStaticMarkup(
      <I18nProvider language="es" syncDocumentLanguage={false}>
        <EvidenceRouteError reset={() => undefined} />
      </I18nProvider>,
    )

    expect(html).toContain('role="alert"')
    expect(html).toContain('Reintentar')
  })
})
