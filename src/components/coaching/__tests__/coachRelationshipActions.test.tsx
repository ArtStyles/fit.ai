import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@/app/actions/coachingRelationships', () => ({
  endCoachingRelationship: async () => ({ ok: true, relationshipId: 'relationship-1', changed: true }),
}))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))

import { CoachRelationshipActions, performCoachRelationshipEnd } from '../CoachRelationshipActions'

describe('CoachRelationshipActions', () => {
  it('requires an accessible confirmation before a trainer can finish a relationship', () => {
    const html = renderToStaticMarkup(<CoachRelationshipActions relationshipId="relationship-1" status="paused_by_platform" />)

    expect(html).toContain('Finalizar acompaÃ±amiento')
    expect(html).toContain('aria-controls')
    expect(html).toContain('aria-expanded="false"')
    expect(html).toContain('Pausado por la plataforma')
    expect(html).toMatch(/pendiente de confirmaci.+ del cliente/)
    expect(html).not.toContain('Reanudar acompañamiento')
  })

  it('keeps only the end action and refreshes the trainer queue after a successful end', async () => {
    const refresh = vi.fn()
    const setBusy = vi.fn()
    const setMessage = vi.fn()

    await performCoachRelationshipEnd('relationship-1', 'attempt-1', async formData => {
      expect(formData.get('relationshipId')).toBe('relationship-1')
      expect(formData.get('idempotencyKey')).toBe('attempt-1')
      return { ok: true, relationshipId: 'relationship-1', changed: true }
    }, { setBusy, setMessage, refresh })

    expect(setBusy.mock.calls.map(([value]) => value)).toEqual([true, false])
    expect(setMessage).toHaveBeenCalledWith({ text: 'El acompañamiento fue finalizado.', error: false })
    expect(refresh).toHaveBeenCalledOnce()
  })
})
