import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { chromium, expect as pwExpect, type Browser } from '@playwright/test'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { warmupFixture } from '@/test/browser/warmupFixture'

describe('Settings with real React form actions', () => {
  let browser: Browser
  let viteServer: { listen: () => Promise<void>; close: () => Promise<void>; httpServer: { address: () => string | { port: number } | null } }
  let fixtureUrl = ''

  beforeAll(async () => {
    const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..')
    const viteEntry = path.join(repoRoot, 'node_modules/.pnpm/node_modules/vite/dist/node/index.js')
    const { createServer } = await import(pathToFileURL(viteEntry).href)
    viteServer = await createServer({
      configFile: false,
      root: repoRoot,
      appType: 'spa',
      cacheDir: path.join(repoRoot, 'node_modules', '.vite-settings-actions-test'),
      oxc: { jsx: { runtime: 'automatic' } },
      optimizeDeps: { include: ['react', 'react-dom/client', 'react-dom', 'react/jsx-dev-runtime', 'lucide-react'] },
      resolve: {
        dedupe: ['react', 'react-dom'],
        alias: [
          { find: '@/app/actions/settings', replacement: path.join(repoRoot, 'src/components/settings/__tests__/fixtures/settingsActions.fixture.ts') },
          { find: '@', replacement: path.join(repoRoot, 'src') },
        ],
      },
      server: { host: '127.0.0.1', port: 0, strictPort: false, hmr: false },
    })
    await viteServer.listen()
    const address = viteServer.httpServer.address()
    if (!address || typeof address === 'string') throw new Error('Settings actions fixture did not bind a TCP port.')
    fixtureUrl = `http://127.0.0.1:${address.port}/src/components/settings/__tests__/fixtures/settingsActions.html`
    browser = await chromium.launch({ headless: true })
    await warmupFixture(browser, fixtureUrl, '__SETTINGS_ACTIONS_READY__')
  }, 90_000)

  afterAll(async () => { await browser?.close(); await viteServer?.close() }, 30_000)

  it('preserves a changed name after a failed save and a successful retry', async () => {
    const page = await browser.newPage()
    try {
      await page.goto(fixtureUrl)
      await page.getByLabel('Nombre', { exact: true }).fill('Ana María')
      await page.getByRole('button', { name: 'Guardar', exact: true }).click()
      await pwExpect(page.getByText('No se pudo guardar el nombre.', { exact: true })).toBeVisible()
      await pwExpect(page.getByLabel('Nombre', { exact: true })).toHaveValue('Ana María')
      await page.getByRole('button', { name: 'Guardar', exact: true }).click()
      await pwExpect(page.getByText('Nombre guardado.', { exact: true })).toBeVisible()
      await pwExpect(page.getByLabel('Nombre', { exact: true })).toHaveValue('Ana María')
      expect(await page.evaluate(() => window.__SETTINGS_ATTEMPTS__.map(attempt => attempt.values.fullName)))
        .toEqual(['Ana María', 'Ana María'])
    } finally { await page.close() }
  })

  it('keeps all personal fields after validation fails and submits the corrected retry', async () => {
    const page = await browser.newPage()
    try {
      await page.goto(fixtureUrl + '?form=personal')
      await page.getByLabel('Altura').fill('182.5')
      await page.getByLabel('Fecha de nacimiento').fill('2015-06-07')
      await page.getByLabel('Género').selectOption('female')
      await page.getByRole('button', { name: 'Guardar datos', exact: true }).click()
      await pwExpect(page.getByText('Fecha no válida.', { exact: true })).toBeVisible()
      await pwExpect(page.getByLabel('Altura')).toHaveValue('182.5')
      await pwExpect(page.getByLabel('Fecha de nacimiento')).toHaveValue('2015-06-07')
      await pwExpect(page.getByLabel('Género')).toHaveValue('female')
      await page.getByLabel('Fecha de nacimiento').fill('1995-06-07')
      await page.getByRole('button', { name: 'Guardar datos', exact: true }).click()
      await pwExpect(page.getByText('Datos guardados.', { exact: true })).toBeVisible()
      await pwExpect(page.getByLabel('Altura')).toHaveValue('182.5')
      await pwExpect(page.getByLabel('Fecha de nacimiento')).toHaveValue('1995-06-07')
      await pwExpect(page.getByLabel('Género')).toHaveValue('female')
      expect(await page.evaluate(() => window.__SETTINGS_ATTEMPTS__.map(attempt => attempt.values))).toEqual([
        { heightCm: '182.5', dateOfBirth: '2015-06-07', gender: 'female' },
        { heightCm: '182.5', dateOfBirth: '1995-06-07', gender: 'female' },
      ])
    } finally { await page.close() }
  })
})
