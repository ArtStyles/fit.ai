import { describe, expect, it } from 'vitest'
import { summarizeProgress } from '../progressSummary'

describe('progress summary', () => {
  it('returns an educational empty state without inventing change', () => {
    expect(summarizeProgress({ sessions: 0, volumeNow: 0, volumeBefore: 0, records: 0 }, 'es'))
      .toBe('Completa tu primera sesión para empezar a medir constancia, volumen y marcas.')
  })

  it('describes measured improvement', () => {
    expect(summarizeProgress({ sessions: 6, volumeNow: 12000, volumeBefore: 10000, records: 2 }, 'en'))
      .toContain('20%')
  })
})
