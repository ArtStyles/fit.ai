import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

function source(relativePath: string): string {
  const path = fileURLToPath(new URL(relativePath, import.meta.url))
  return existsSync(path) ? readFileSync(path, 'utf8') : ''
}

describe('pricing route contract', () => {
  it('uses the approved beta Pro CTA', () => {
    const plans = source('../../components/pricing/EarlyAccessPlans.tsx')

    expect(plans).toContain('<ProInterestCta')
    expect(plans).not.toContain('Continuar gratis')
    expect(plans).not.toContain('Pro próximamente')
  })

  it('turns Pro into measurable beta interest without a checkout flow', () => {
    const plans = source('../../components/pricing/EarlyAccessPlans.tsx')
    const proCta = source('../../components/pricing/ProInterestCta.tsx')
    const pricingAnalytics = source('../../components/pricing/PricingAnalytics.tsx')

    expect(plans).toContain('Pro está en beta')
    expect(plans).toContain('sin cobros todavía')
    expect(proCta).toContain('Quiero acceso Pro')
    expect(proCta).toContain('/register?plan=pro-early-access')
    expect(proCta).toContain("trackEvent('pro_interest_submitted'")
    expect(proCta).toContain("await trackEventConfirmed('pro_interest_submitted'")
    expect(proCta).toContain('No pudimos registrar tu interés. Intenta de nuevo.')
    expect(pricingAnalytics).toContain("trackEvent('paywall_viewed'")
    expect(`${plans}\n${proCta}`).not.toMatch(/stripe|href=["']\/checkout|checkout_started/i)
  })

  it('keeps the Spanish-only pricing page out of search results', () => {
    const page = source('../pricing/page.tsx')

    expect(page).toContain('robots: { index: false, follow: true }')
  })
})
