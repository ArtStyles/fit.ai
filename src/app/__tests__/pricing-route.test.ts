import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

function source(relativePath: string): string {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), 'utf8')
}

describe('pricing route contract', () => {
  it('uses the approved guest CTA', () => {
    const plans = source('../../components/pricing/EarlyAccessPlans.tsx')

    expect(plans).toContain('Crear mi plan gratis')
    expect(plans).not.toContain('Continuar gratis')
  })

  it('keeps the Spanish-only pricing page out of search results', () => {
    const page = source('../pricing/page.tsx')

    expect(page).toContain('robots: { index: false, follow: true }')
  })
})
