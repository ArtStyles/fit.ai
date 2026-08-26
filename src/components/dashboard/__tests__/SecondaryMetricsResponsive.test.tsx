import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { chromium, type Browser } from '@playwright/test'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

describe('SecondaryMetrics responsive containment', () => {
  let browser: Browser
  let viteServer: {
    listen: () => Promise<void>
    close: () => Promise<void>
    httpServer: { address: () => string | { port: number } | null }
  }
  let baseUrl = ''

  beforeAll(async () => {
    const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..')
    const viteEntry = path.join(repoRoot, 'node_modules/.pnpm/node_modules/vite/dist/node/index.js')
    const { createServer } = await import(pathToFileURL(viteEntry).href)
    viteServer = await createServer({
      configFile: false,
      root: repoRoot,
      appType: 'spa',
      cacheDir: path.join(repoRoot, 'node_modules', '.vite-secondary-metrics-test'),
      oxc: { jsx: { runtime: 'automatic' } },
      optimizeDeps: {
        include: [
          'react',
          'react-dom',
          'react-dom/client',
          'react/jsx-dev-runtime',
          'clsx',
          'tailwind-merge',
          'lucide-react',
        ],
      },
      resolve: { dedupe: ['react', 'react-dom'], alias: [
        { find: '@/components/i18n/I18nProvider', replacement: path.join(repoRoot, 'src/components/dashboard/__tests__/fixtures/secondaryMetricsI18n.fixture.ts') },
        { find: 'next/navigation', replacement: path.join(repoRoot, 'src/components/coaching/__tests__/fixtures/nextNavigation.fixture.ts') },
        { find: 'next/link', replacement: path.join(repoRoot, 'src/components/coaching/__tests__/fixtures/nextLink.fixture.tsx') },
        { find: '@', replacement: path.join(repoRoot, 'src') },
      ] },
      server: { host: '127.0.0.1', port: 0, strictPort: false, hmr: false },
    })
    await viteServer.listen()
    const address = viteServer.httpServer.address()
    if (!address || typeof address === 'string') throw new Error('Secondary metrics fixture did not bind a TCP port.')
    baseUrl = `http://127.0.0.1:${address.port}`
    browser = await chromium.launch({ headless: true })
  }, 30_000)

  afterAll(async () => {
    await browser?.close()
    await viteServer?.close()
  }, 30_000)

  it.each([
    [320, true],
    [360, true],
    [390, false],
    [412, false],
    [1280, false],
  ])('keeps every progress row readable inside a %ipx viewport', async (viewportWidth, expectStackedSummary) => {
    const page = await browser.newPage({ viewport: { width: viewportWidth, height: 900 } })
    try {
      await page.goto(`${baseUrl}/src/components/dashboard/__tests__/fixtures/secondaryMetrics.html`)
      await page.waitForFunction(() => Boolean(window.__SECONDARY_METRICS_READY__))

      const geometry = await page.evaluate(() => {
        const fixture = document.querySelector<HTMLElement>('[data-dashboard-fixture]')
        const section = document.querySelector<HTMLElement>('section[aria-labelledby="metrics-title"]')
        if (!fixture || !section) throw new Error('Secondary metrics fixture did not render.')

        const fixtureRight = fixture.getBoundingClientRect().right
        const sectionBounds = section.getBoundingClientRect()
        const progressRows = [
          section.querySelector<HTMLElement>('a[href="/history/latest-session"]'),
          section.querySelector<HTMLElement>('a[href="/exercises/record-exercise"]'),
          section.querySelector<HTMLElement>('a[href="/plan"]'),
        ]
        if (progressRows.some(row => !row)) throw new Error('A progress detail row is missing.')

        const summaryLabels = Array.from(section.querySelectorAll<HTMLElement>('p'))
        const streakCell = summaryLabels.find(label => label.textContent === 'Racha activa')?.parentElement
        const volumeCell = summaryLabels.find(label => label.textContent === 'Volumen semanal')?.parentElement
        if (!streakCell || !volumeCell) throw new Error('The progress summary cells are missing.')
        const streakBounds = streakCell.getBoundingClientRect()
        const volumeBounds = volumeCell.getBoundingClientRect()

        const rows = progressRows.map(row => {
          const rowElement = row!
          const copy = rowElement.querySelector<HTMLElement>(':scope > span')
          if (!copy) throw new Error('A progress detail row has no copy container.')
          const lines = Array.from(copy.querySelectorAll<HTMLElement>(':scope > span'))
          const rowBounds = rowElement.getBoundingClientRect()
          const copyBounds = copy.getBoundingClientRect()

          return {
            rowRight: rowBounds.right,
            copyRight: copyBounds.right,
            lineCount: lines.length,
            lines: lines.map(line => {
              const style = getComputedStyle(line)
              return {
                clientWidth: line.clientWidth,
                scrollWidth: line.scrollWidth,
                overflowX: style.overflowX,
                textOverflow: style.textOverflow,
                whiteSpace: style.whiteSpace,
              }
            }),
          }
        })

        return {
          viewportWidth: window.innerWidth,
          documentScrollWidth: document.documentElement.scrollWidth,
          sectionRight: sectionBounds.right,
          fixtureRight,
          summaryIsStacked: volumeBounds.top >= streakBounds.bottom - 0.5,
          rows,
        }
      })

      expect(geometry.documentScrollWidth).toBeLessThanOrEqual(geometry.viewportWidth)
      expect(geometry.sectionRight).toBeLessThanOrEqual(geometry.fixtureRight + 0.5)
      expect(geometry.summaryIsStacked).toBe(expectStackedSummary)
      expect(geometry.rows.map(row => row.lineCount)).toEqual([3, 3, 1])
      for (const row of geometry.rows) {
        expect(row.rowRight).toBeLessThanOrEqual(geometry.sectionRight + 0.5)
        expect(row.copyRight).toBeLessThanOrEqual(row.rowRight + 0.5)
        for (const line of row.lines) {
          expect(line.clientWidth).toBeGreaterThan(0)
          expect(line.overflowX).toBe('hidden')
          expect(line.textOverflow).toBe('ellipsis')
          expect(line.whiteSpace).toBe('nowrap')
        }
      }

      expect(geometry.rows[0].lines[1].scrollWidth).toBeGreaterThan(geometry.rows[0].lines[1].clientWidth)
      expect(geometry.rows[1].lines[1].scrollWidth).toBeGreaterThan(geometry.rows[1].lines[1].clientWidth)
    } finally {
      await page.close()
    }
  }, 40_000)
})
