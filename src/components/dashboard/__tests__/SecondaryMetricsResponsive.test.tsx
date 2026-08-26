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

  it.each([360, 390, 412, 1280])('keeps long progress details inside a %ipx viewport', async viewportWidth => {
    const page = await browser.newPage({ viewport: { width: viewportWidth, height: 900 } })
    try {
      await page.goto(`${baseUrl}/src/components/dashboard/__tests__/fixtures/secondaryMetrics.html`)
      await page.waitForFunction(() => Boolean(window.__SECONDARY_METRICS_READY__))

      const geometry = await page.evaluate(() => {
        const fixture = document.querySelector<HTMLElement>('[data-dashboard-fixture]')
        const section = document.querySelector<HTMLElement>('section[aria-labelledby="metrics-title"]')
        const links = Array.from(section?.querySelectorAll<HTMLElement>('a') ?? [])
        if (!fixture || !section) throw new Error('Secondary metrics fixture did not render.')

        const fixtureRight = fixture.getBoundingClientRect().right
        const sectionBounds = section.getBoundingClientRect()
        return {
          viewportWidth: window.innerWidth,
          documentScrollWidth: document.documentElement.scrollWidth,
          sectionRight: sectionBounds.right,
          fixtureRight,
          overflowingLinks: links.filter(link => link.getBoundingClientRect().right > sectionBounds.right + 0.5).length,
        }
      })

      expect(geometry.documentScrollWidth).toBeLessThanOrEqual(geometry.viewportWidth)
      expect(geometry.sectionRight).toBeLessThanOrEqual(geometry.fixtureRight + 0.5)
      expect(geometry.overflowingLinks).toBe(0)
    } finally {
      await page.close()
    }
  }, 40_000)
})
