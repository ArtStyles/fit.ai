import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const page = readFileSync(new URL('../../../app/(app)/dashboard/page.tsx', import.meta.url), 'utf8')
const header = readFileSync(new URL('../DashboardHeader.tsx', import.meta.url), 'utf8')
const recommendation = readFileSync(new URL('../NextRecommendation.tsx', import.meta.url), 'utf8')
const viewModel = readFileSync(new URL('../dashboardViewModel.ts', import.meta.url), 'utf8')
const weekly = readFileSync(new URL('../WeeklyStatus.tsx', import.meta.url), 'utf8')
const secondary = readFileSync(new URL('../SecondaryMetrics.tsx', import.meta.url), 'utf8')

describe('dashboard structure', () => {
  it('renders the action-first sections in the required order', () => {
    const orderedSections = [
      '<DashboardHeader',
      '<DashboardNotice',
      '<TodayActionCard',
      '<WeeklyStatus',
      '<NextRecommendation',
      '<SecondaryMetrics',
    ]
    const positions = orderedSections.map(section => page.indexOf(section))

    expect(positions.every(position => position >= 0)).toBe(true)
    expect(positions).toEqual([...positions].sort((a, b) => a - b))
  })

  it('dispatches at most one notice instead of rendering parallel banners', () => {
    expect(page.match(/<DashboardNotice\b/g)).toHaveLength(1)
    expect(page).not.toMatch(/<(DashboardPromoBanner|AINotesBanner|CheckInBanner)\b/)
  })

  it('places the contextual coach link beside the recommendation', () => {
    expect(recommendation).toContain('href={recommendation.chatHref}')
    expect(viewModel).toContain("chatHref: '/chat'")
    expect(page).not.toMatch(/fixed[^\n]+\/chat|\/chat[^\n]+fixed/)
  })

  it('uses a single page H1 in the header', () => {
    expect(header.match(/<h1\b/g)).toHaveLength(1)
    expect(page).not.toMatch(/<h1\b/)
  })

  it('removes the floating pricing promo and duplicate dashboard promos', () => {
    expect(header).not.toContain('href="/pricing"')
    expect(page).not.toContain('<DailyBrief')
    expect(page).not.toContain('<HeroCard')
  })

  it('does not add a dashboard data request', () => {
    const requestOperations = page.match(/\n\s*\.(?:from|rpc)\(/g) ?? []
    expect(requestOperations.length).toBeLessThanOrEqual(10)
    expect(page).toContain(".rpc('get_dashboard_payload'")
  })

  it('preserves mobile explanations for unavailable schedule days', () => {
    expect(weekly).toContain('aria-live="polite"')
    expect(weekly).toContain('onClick={() => setActiveMessage')
  })

  it('keeps the existing volume trend when enough series data exists', () => {
    expect(secondary).toContain('<Sparkline data={metrics.volumeSeries}')
  })
})
