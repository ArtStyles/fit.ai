import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const page = readFileSync(new URL('../../../app/(app)/dashboard/page.tsx', import.meta.url), 'utf8')
const primaryFlow = readFileSync(new URL('../DashboardPrimaryFlow.tsx', import.meta.url), 'utf8')
const header = readFileSync(new URL('../DashboardHeader.tsx', import.meta.url), 'utf8')
const recommendation = readFileSync(new URL('../NextRecommendation.tsx', import.meta.url), 'utf8')
const viewModel = readFileSync(new URL('../dashboardViewModel.ts', import.meta.url), 'utf8')
const journey = readFileSync(new URL('../DashboardWeekJourney.tsx', import.meta.url), 'utf8')
const secondary = readFileSync(new URL('../SecondaryMetrics.tsx', import.meta.url), 'utf8')

describe('dashboard structure', () => {
  it('renders one chronological journey as the dashboard composition', () => {
    const orderedSections = [
      '<DashboardHeader',
      '<DashboardMainNotice',
      '<DashboardWeekJourney',
    ]
    const positions = orderedSections.map(section => page.indexOf(section))

    expect(positions.every(position => position >= 0)).toBe(true)
    expect(positions).toEqual([...positions].sort((a, b) => a - b))
    expect(page.match(/<DashboardWeekJourney\b/g)).toHaveLength(1)
  })

  it('places one coaching summary after the accessible title and before music and the weekly journey', () => {
    const flowPositions = ['{title}', '{coaching}', '{music}', '{journey}']
      .map(section => primaryFlow.indexOf(section))
    const pagePositions = [
      'title={<h1 className="sr-only"',
      'coaching={coachingSummary ? (',
      '<CoachingSummaryCard',
      'music={<MusicNowPlayingSlot',
      'journey={<DashboardWeekJourney',
    ].map(section => page.indexOf(section))

    expect(flowPositions.every(position => position >= 0)).toBe(true)
    expect(flowPositions).toEqual([...flowPositions].sort((a, b) => a - b))
    expect(pagePositions.every(position => position >= 0)).toBe(true)
    expect(pagePositions).toEqual([...pagePositions].sort((a, b) => a - b))
    expect(page.match(/<CoachingSummaryCard\b/g)).toHaveLength(1)
  })

  it('loads the private coaching summary at the page boundary inside the existing parallel load', () => {
    const dashboardPageStart = page.indexOf('export default async function DashboardPage')
    const parallelLoadStart = page.indexOf('await Promise.all([', dashboardPageStart)
    const parallelLoadEnd = page.indexOf('\n  ])', parallelLoadStart)
    const summaryLoad = page.indexOf('loadClientCoachingSummary(', parallelLoadStart)
    const summaryLoadSource = page.slice(summaryLoad, summaryLoad + 160)

    expect(dashboardPageStart).toBeGreaterThanOrEqual(0)
    expect(parallelLoadStart).toBeGreaterThanOrEqual(0)
    expect(summaryLoad).toBeGreaterThan(parallelLoadStart)
    expect(summaryLoad).toBeLessThan(parallelLoadEnd)
    expect(summaryLoadSource).toContain('supabase as unknown as ClientCoachingSummaryClient')
    expect(summaryLoadSource).toContain('user.id')
    expect(page).not.toMatch(/active_trainer_directory[^]*client_user_id/)
  })

  it('keeps the persistent coaching load error out of live announcement semantics', () => {
    const coachingStart = page.indexOf('coaching={')
    const coachingEnd = page.indexOf('music={<MusicNowPlayingSlot', coachingStart)
    const coachingSource = page.slice(coachingStart, coachingEnd)

    expect(coachingStart).toBeGreaterThanOrEqual(0)
    expect(coachingEnd).toBeGreaterThan(coachingStart)
    expect(coachingSource).toContain('coachingSummaryError')
    expect(coachingSource).not.toMatch(/role="status"|aria-live/)
  })

  it('uses a real desktop grid without duplicating the current workout', () => {
    expect(journey).toContain('lg:grid-cols-[minmax(0,1fr)_22rem]')
    expect(page).not.toContain('<TodayActionCard')
    expect(page).not.toContain('<WeeklyStatus')
  })

  it('dispatches at most one notice instead of rendering parallel banners', () => {
    expect(page.match(/<DashboardMainNotice\b/g)).toHaveLength(1)
    expect(page).not.toMatch(/<(DashboardPromoBanner|AINotesBanner|CheckInBanner)\b/)
    expect(header).toContain('href="/notifications"')
    expect(header).not.toContain('aria-expanded')
  })

  it('keeps AI coach access out of the Home recommendation', () => {
    expect(recommendation).not.toContain('href={recommendation.chatHref}')
    expect(viewModel).not.toContain("chatHref: '/chat'")
    expect(page).not.toContain('/chat')
  })

  it('uses a single server-rendered page H1 in the dashboard main content', () => {
    expect(header).not.toMatch(/<h1\b/)
    expect(page.match(/<h1\b/g)).toHaveLength(1)
    expect(page).toContain('sr-only')
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
    expect(journey).toContain('aria-live="polite"')
    expect(journey).toContain('onClick={() => setActiveMessage')
  })

  it('keeps the existing volume trend when enough series data exists', () => {
    expect(secondary).toContain('<Sparkline data={metrics.volumeSeries}')
  })
})
