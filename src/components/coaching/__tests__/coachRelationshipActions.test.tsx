import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@/app/actions/coachingRelationships', () => ({
  endCoachingRelationship: async () => ({ ok: true, relationshipId: 'relationship-1', changed: true }),
}))

import { CoachRelationshipActions } from '../CoachRelationshipActions'

describe('CoachRelationshipActions', () => {
  it('requires an accessible confirmation before a trainer can finish a relationship', () => {
    const html = renderToStaticMarkup(<CoachRelationshipActions relationshipId="relationship-1" />)

    expect(html).toContain('Finalizar acompaÃ±amiento')
    expect(html).toContain('aria-controls')
    expect(html).toContain('aria-expanded="false"')
  })
})
