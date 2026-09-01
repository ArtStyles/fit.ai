import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { chromium, expect as pwExpect, type Browser } from '@playwright/test'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

describe('MusicIntegrationSettings StrictMode wiring', () => {
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
      cacheDir: path.join(repoRoot, 'node_modules', '.vite-music-settings-test'),
      oxc: { jsx: { runtime: 'automatic' } },
      optimizeDeps: {
        include: ['react', 'react-dom', 'react-dom/client', 'react/jsx-dev-runtime', 'lucide-react'],
      },
      resolve: {
        dedupe: ['react', 'react-dom'],
        alias: [
          {
            find: '@/lib/native/useNowPlayingSession',
            replacement: path.join(repoRoot, 'src/components/settings/__tests__/fixtures/musicIntegrationSettingsSession.fixture.ts'),
          },
          {
            find: '@/lib/native/musicSession',
            replacement: path.join(repoRoot, 'src/components/settings/__tests__/fixtures/musicIntegrationSettingsAdapter.fixture.ts'),
          },
          { find: '@', replacement: path.join(repoRoot, 'src') },
        ],
      },
      server: { host: '127.0.0.1', port: 0, strictPort: false, hmr: false },
    })
    await viteServer.listen()
    const address = viteServer.httpServer.address()
    if (!address || typeof address === 'string') throw new Error('Music settings fixture did not bind a TCP port.')
    baseUrl = `http://127.0.0.1:${address.port}`
    browser = await chromium.launch({ headless: true })
  }, 30_000)

  afterAll(async () => {
    await browser?.close()
    await viteServer?.close()
  }, 30_000)

  it('keeps each real Android settings action live after StrictMode setup-cleanup-setup', async () => {
    const page = await browser.newPage({ viewport: { width: 390, height: 800 } })
    try {
      await page.goto(`${baseUrl}/src/components/settings/__tests__/fixtures/musicIntegrationSettings.html`)
      await page.waitForFunction(() => Boolean(window.__MUSIC_SETTINGS_READY__))
      await page.evaluate(() => { window.__musicSettingsOpenCalls = 0 })

      await page.getByRole('button', { name: 'Habilitar en Android' }).click()
      await pwExpect.poll(() => page.evaluate(() => window.__musicSettingsOpenCalls)).toBe(1)
      expect(await page.evaluate(() => window.__musicSettingsOpenCalls)).toBe(1)

      await page.evaluate(() => window.__setMusicSettingsStatus?.('granted_idle'))
      const manage = page.getByRole('button', { name: 'Gestionar en Android' })
      await pwExpect(manage).toBeVisible()
      await manage.click()
      await pwExpect.poll(() => page.evaluate(() => window.__musicSettingsOpenCalls)).toBe(2)
      expect(await page.evaluate(() => window.__musicSettingsOpenCalls)).toBe(2)

      await page.evaluate(() => window.__setMusicSettingsStatus?.('error'))
      const manualAccess = page.getByRole('button', { name: 'Abrir ajustes de Android' })
      await pwExpect(manualAccess).toBeVisible()
      await manualAccess.click()
      await pwExpect.poll(() => page.evaluate(() => window.__musicSettingsOpenCalls)).toBe(3)
      expect(await page.evaluate(() => window.__musicSettingsOpenCalls)).toBe(3)
    } finally {
      await page.close()
    }
  }, 40_000)
})

declare global {
  interface Window {
    __MUSIC_SETTINGS_READY__?: boolean
    __musicSettingsOpenCalls: number
    __setMusicSettingsStatus?: (status: 'not_granted' | 'granted_idle' | 'error') => void
  }
}
