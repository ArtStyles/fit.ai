import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { chromium, expect as pwExpect, type Browser, type Page } from '@playwright/test'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

describe('useNowPlayingSession foreground lifecycle', () => {
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
      cacheDir: path.join(repoRoot, 'node_modules', '.vite-now-playing-hook-test'),
      oxc: { jsx: { runtime: 'automatic' } },
      optimizeDeps: {
        include: ['react', 'react-dom', 'react-dom/client', 'react/jsx-dev-runtime'],
      },
      resolve: {
        dedupe: ['react', 'react-dom'],
        alias: [
          {
            find: '@capacitor/app',
            replacement: path.join(repoRoot, 'src/lib/native/__tests__/fixtures/useNowPlayingSessionApp.fixture.ts'),
          },
          { find: '@', replacement: path.join(repoRoot, 'src') },
        ],
      },
      server: { host: '127.0.0.1', port: 0, strictPort: false, hmr: false },
    })
    await viteServer.listen()
    const address = viteServer.httpServer.address()
    if (!address || typeof address === 'string') throw new Error('Hook fixture did not bind a TCP port.')
    baseUrl = `http://127.0.0.1:${address.port}`
    browser = await chromium.launch({ headless: true })
  }, 30_000)

  afterAll(async () => {
    await browser?.close()
    await viteServer?.close()
  }, 30_000)

  async function openFixture(query: string): Promise<Page> {
    const page = await browser.newPage()
    await page.goto(`${baseUrl}/src/lib/native/__tests__/fixtures/useNowPlayingSessionLifecycle.html?${query}`)
    await page.waitForFunction(() => window.__hookLifecycleReady)
    return page
  }

  it('does not register an app-state listener for unsupported web sessions', async () => {
    const page = await openFixture('authorization=unsupported')
    try {
      expect(await page.evaluate(() => window.__appStateAddCalls)).toBe(0)
    } finally {
      await page.close()
    }
  }, 40_000)

  it('registers after not-granted is known and refreshes when Android returns to foreground', async () => {
    const page = await openFixture('authorization=not_granted')
    try {
      expect(await page.evaluate(() => window.__appStateAddCalls)).toBe(1)
      const readsBeforeForeground = await page.evaluate(() => window.__hookAuthorizationReads)

      await page.evaluate(() => window.__emitAppForeground())

      await pwExpect.poll(() => page.evaluate(() => window.__hookAuthorizationReads))
        .toBe(readsBeforeForeground + 1)
    } finally {
      await page.close()
    }
  }, 40_000)

  it('contains rejected registration and removal promises and removes the mounted handle once', async () => {
    const rejectedRegistrationPage = await openFixture('authorization=not_granted&rejectRegistration=true')
    try {
      await rejectedRegistrationPage.evaluate(() => new Promise(resolve => setTimeout(resolve, 0)))
      expect(await rejectedRegistrationPage.evaluate(() => window.__hookUnhandledRejections)).toBe(0)
    } finally {
      await rejectedRegistrationPage.close()
    }

    const rejectedRemovalPage = await openFixture('authorization=not_granted&rejectRemoval=true')
    try {
      const removalsBeforeUnmount = await rejectedRemovalPage.evaluate(() => window.__appStateRemoveCalls)
      await rejectedRemovalPage.evaluate(() => window.__unmountHookFixture())
      await rejectedRemovalPage.evaluate(() => new Promise(resolve => setTimeout(resolve, 0)))

      expect(await rejectedRemovalPage.evaluate(() => window.__appStateRemoveCalls))
        .toBe(removalsBeforeUnmount + 1)
      expect(await rejectedRemovalPage.evaluate(() => window.__hookUnhandledRejections)).toBe(0)
    } finally {
      await rejectedRemovalPage.close()
    }
  }, 40_000)
})

declare global {
  interface Window {
    __appStateAddCalls: number
    __appStateRemoveCalls: number
    __emitAppForeground(): void
    __hookAuthorizationReads: number
    __hookLifecycleReady: boolean
    __hookUnhandledRejections: number
    __unmountHookFixture(): void
  }
}
