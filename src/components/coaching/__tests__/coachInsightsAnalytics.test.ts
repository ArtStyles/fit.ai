import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { chromium, type Browser } from '@playwright/test'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { coachInsightsViewKey } from '../CoachInsightsAnalytics'

describe('CoachInsightsAnalytics view identity', () => {
  it('keeps a single view identity when a rerender supplies an equivalent new props object', () => {
    const firstRender = coachInsightsViewKey({
      kind: 'client-insights', weeks: 4, prescribedSessionCount: 8, evidenceSessionCount: 6, measurementsShared: false,
    })
    const rerenderWithNewObject = coachInsightsViewKey({
      kind: 'client-insights', weeks: 4, prescribedSessionCount: 8, evidenceSessionCount: 6, measurementsShared: false,
    })

    expect(rerenderWithNewObject).toBe(firstRender)
  })

  it('changes the view identity only for a material aggregate or period change', () => {
    const baseline = coachInsightsViewKey({
      kind: 'overview', counts: { activeClients: 3, pendingRequests: 1, pausedRelationships: 0 },
    })
    const changed = coachInsightsViewKey({
      kind: 'overview', counts: { activeClients: 4, pendingRequests: 1, pausedRelationships: 0 },
    })

    expect(changed).not.toBe(baseline)
  })
})

describe('CoachInsightsAnalytics browser behavior', () => {
  let browser: Browser
  let viteServer: { listen: () => Promise<void>; close: () => Promise<void>; httpServer: { address: () => string | { port: number } | null } }
  let baseUrl = ''

  beforeAll(async () => {
    const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..')
    const viteEntry = path.join(repoRoot, 'node_modules/.pnpm/node_modules/vite/dist/node/index.js')
    const { createServer } = await import(pathToFileURL(viteEntry).href)
    viteServer = await createServer({
      configFile: false,
      root: repoRoot,
      appType: 'spa',
      cacheDir: path.join(repoRoot, 'node_modules', '.vite-coach-insights-analytics-test'),
      oxc: { jsx: { runtime: 'automatic' } },
      resolve: { alias: [
        { find: '@/lib/analytics/events', replacement: path.join(repoRoot, 'src/components/coaching/__tests__/fixtures/analytics.fixture.ts') },
        { find: '@', replacement: path.join(repoRoot, 'src') },
      ] },
      server: { host: '127.0.0.1', port: 0, strictPort: false, hmr: false },
    })
    await viteServer.listen()
    const address = viteServer.httpServer.address()
    if (!address || typeof address === 'string') throw new Error('Coach Insights analytics fixture did not bind a TCP port.')
    baseUrl = `http://127.0.0.1:${address.port}`
    browser = await chromium.launch({ headless: true })
  }, 30_000)

  afterAll(async () => { await browser?.close(); await viteServer?.close() })

  it('records one view for an equivalent new props object and another only after a material change', async () => {
    const page = await browser.newPage()
    try {
      await page.goto(`${baseUrl}/src/components/coaching/__tests__/fixtures/coachInsightsAnalyticsInteraction.html`)
      await page.waitForFunction(() => Boolean((window as Window & { __COACH_ANALYTICS_READY__?: boolean }).__COACH_ANALYTICS_READY__))
      await page.waitForFunction(() => (window as Window & { __COACH_ANALYTICS_EVENTS__?: unknown[] }).__COACH_ANALYTICS_EVENTS__?.length === 1)

      await page.evaluate(() => (window as unknown as Window & { renderCoachInsightsAnalytics: (props: Record<string, unknown>) => void }).renderCoachInsightsAnalytics({
        kind: 'client-insights', weeks: 4, prescribedSessionCount: 8, evidenceSessionCount: 6, measurementsShared: false,
      }))
      await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))))
      expect(await page.evaluate(() => (window as Window & { __COACH_ANALYTICS_EVENTS__?: unknown[] }).__COACH_ANALYTICS_EVENTS__?.length)).toBe(1)

      await page.evaluate(() => (window as unknown as Window & { renderCoachInsightsAnalytics: (props: Record<string, unknown>) => void }).renderCoachInsightsAnalytics({
        kind: 'client-insights', weeks: 12, prescribedSessionCount: 8, evidenceSessionCount: 6, measurementsShared: false,
      }))
      await page.waitForFunction(() => (window as Window & { __COACH_ANALYTICS_EVENTS__?: unknown[] }).__COACH_ANALYTICS_EVENTS__?.length === 2)
      expect(await page.evaluate(() => (window as Window & { __COACH_ANALYTICS_EVENTS__?: Array<{ name: string; properties: Record<string, unknown> }> }).__COACH_ANALYTICS_EVENTS__)).toEqual([
        { name: 'coach_client_insights_viewed', properties: { period_weeks: 4, prescribed_session_count: 8, evidence_session_count: 6 } },
        { name: 'coach_client_insights_viewed', properties: { period_weeks: 12, prescribed_session_count: 8, evidence_session_count: 6 } },
      ])
    } finally { await page.close() }
  }, 15_000)
})
