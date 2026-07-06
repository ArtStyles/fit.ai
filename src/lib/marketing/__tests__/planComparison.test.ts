import { describe, expect, it } from 'vitest'
import { PLAN_COMPARISON } from '../planComparison'

describe('plan comparison', () => {
  it('states the real free plan limit and never offers checkout', () => {
    expect(PLAN_COMPARISON.find(row => row.key === 'saved-plans')).toMatchObject({ free: '2', pro: 'Ilimitados' })
    expect(JSON.stringify(PLAN_COMPARISON)).not.toMatch(/stripe|checkout|comprar|buy now/i)
  })
})
