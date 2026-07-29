import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { I18nProvider } from '@/components/i18n/I18nProvider'
import { PullToRefreshIndicatorContent } from '../PullToRefreshIndicator'

function renderIndicator(
  reducedMotion = false,
  completionPulse = false,
  thresholdPulse = false,
) {
  return renderToStaticMarkup(
    <I18nProvider language="en" syncDocumentLanguage={false}>
      <PullToRefreshIndicatorContent
        phase="refreshing"
        progress={1}
        visualDistance={45.76}
        reducedMotion={reducedMotion}
        completionPulse={completionPulse}
        thresholdPulse={thresholdPulse}
      />
    </I18nProvider>,
  )
}

describe('PullToRefreshIndicatorContent', () => {
  it('renders the Vekira mark, two energy waves, and an accessible refresh status', () => {
    const html = renderIndicator()

    expect(html).toContain('data-pull-refresh-phase="refreshing"')
    expect(html).toContain('role="status"')
    expect(html).toContain('Updating content')
    expect(html).toContain('M86 86h82l126 352h-84L86 86Z')
    expect(html).toContain('m308 438-78-138')
    expect(html.match(/<span class="vekira-ptr-wave/g)).toHaveLength(2)
    expect(html).not.toContain('animate-spin')
    expect(html).not.toContain('rotate(')
  })

  it('exposes reduced motion to the CSS contract', () => {
    expect(renderIndicator(true)).toContain('data-reduced-motion="true"')
  })

  it('marks a completed refresh for the final visual heartbeat', () => {
    expect(renderIndicator(false, true)).toContain('data-completion-pulse="true"')
  })

  it('keeps the one-shot threshold pulse independent from the refresh phase', () => {
    expect(renderIndicator(false, false, true)).toContain(
      'data-threshold-pulse="true"',
    )
  })
})
