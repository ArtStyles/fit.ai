import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { TimelineNode, TimelineRail } from '../TimelineRail'

describe('training timeline', () => {
  it('exposes status as text and not only color', () => {
    const html = renderToStaticMarkup(
      <TimelineRail>
        <TimelineNode tone="completed" label="Completado">
          Push
        </TimelineNode>
      </TimelineRail>,
    )

    expect(html).toContain('aria-label="Completado"')
    expect(html).toContain('data-timeline-tone="completed"')
  })
})
