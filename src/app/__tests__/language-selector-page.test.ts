import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('neutral language selector', () => {
  it('offers explicit Spanish and English links without redirecting', () => {
    const source = readFileSync(new URL('../page.tsx', import.meta.url), 'utf8')

    expect(source).toContain('id="app-main-content"')
    expect(source).toContain("href: '/es'")
    expect(source).toContain("href: '/en'")
    expect(source).toContain('Español')
    expect(source).toContain('English')
  })
})
