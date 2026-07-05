import { describe, expect, it } from 'vitest'
import { HOME_CONTENT } from '../homeContent'

describe('bilingual home content', () => {
  it.each(['es', 'en'] as const)('%s has every approved section', locale => {
    const content = HOME_CONTENT[locale]
    expect(content.hero.title.length).toBeGreaterThan(30)
    expect(content.loop).toHaveLength(4)
    expect(content.previews).toHaveLength(3)
    expect(content.faq.length).toBeGreaterThanOrEqual(5)
  })

  it('does not contain unverified social-proof claims', () => {
    expect(JSON.stringify(HOME_CONTENT)).not.toMatch(/10K|98%|usuarios activos|active users/i)
  })
})
