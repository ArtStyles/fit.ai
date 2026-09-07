import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { chromium, expect as pwExpect, type Browser, type Page } from '@playwright/test'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { warmupFixture } from '@/test/browser/warmupFixture'

const fixtureRoute = '/src/components/session/__tests__/fixtures/sessionRecovery.html'
const backupKey = 'fitai_session_v2_account-a_22222222-2222-4222-8222-222222222222'
async function sessionState(page: Page) {
  return JSON.parse(await page.locator('[data-session-state]').textContent() ?? '{}') as {
    userId: string; clientSessionId: string; finishedAt: number; isFinished: boolean
  }
}

describe('session ownership and completion recovery in the browser', () => {
  let browser: Browser
  let server: { listen: () => Promise<void>; close: () => Promise<void>; httpServer: { address: () => string | { port: number } | null } }
  let baseUrl = ''
  beforeAll(async () => {
    const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..')
    const { createServer } = await import(pathToFileURL(path.join(root, 'node_modules/.pnpm/node_modules/vite/dist/node/index.js')).href)
    const fixture = (name: string) => path.join(root, 'src/components/session/__tests__/fixtures', name)
    const shared = (name: string) => path.join(root, 'src/components/coaching/__tests__/fixtures', name)
    server = await createServer({
      configFile: false, root, appType: 'spa', cacheDir: path.join(root, 'node_modules/.vite-session-recovery-test'),
      oxc: { jsx: { runtime: 'automatic' } },
      optimizeDeps: { entries: [fixture('sessionRecovery.html')], include: ['react', 'react-dom', 'react-dom/client', 'react/jsx-dev-runtime', 'lucide-react', 'framer-motion', 'zustand', '@radix-ui/react-dialog', '@radix-ui/react-toast', '@radix-ui/react-slot', '@radix-ui/react-select', '@radix-ui/react-dropdown-menu', '@radix-ui/react-avatar', '@capacitor/core', '@capacitor/haptics', 'class-variance-authority', 'clsx', 'tailwind-merge'] },
      resolve: { dedupe: ['react', 'react-dom'], alias: [
        ...['@/app/actions/authorizeSession', '@/app/actions/saveSession', '@/app/actions/posts', '@/app/actions/workspace', '@/app/(auth)/actions'].map(find => ({ find, replacement: fixture('sessionActions.fixture.ts') })),
        { find: 'next/navigation', replacement: fixture('navigation.fixture.ts') },
        { find: 'next/link', replacement: shared('nextLink.fixture.tsx') },
        { find: 'next/image', replacement: shared('nextImage.fixture.tsx') },
        { find: '@', replacement: path.join(root, 'src') },
      ] },
      server: { host: '127.0.0.1', port: 0, strictPort: false, hmr: false },
    })
    await server.listen()
    const address = server.httpServer.address()
    if (!address || typeof address === 'string') throw new Error('Session fixture did not bind')
    baseUrl = `http://127.0.0.1:${address.port}`
    browser = await chromium.launch({ headless: true })
    await warmupFixture(browser, baseUrl + fixtureRoute, '__SESSION_RECOVERY_READY__')
  }, 90_000)
  afterAll(async () => { await browser?.close(); await server?.close() }, 30_000)

  for (const width of [375, 1440]) {
    it(`requires a durable finished backup before saving at ${width}px`, async () => {
      const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: 'reduce' })
      const page = await context.newPage()
      try {
        await page.goto(baseUrl + fixtureRoute)
        await page.getByRole('button', { name: 'Completar serie 1', exact: true }).click()
        await page.evaluate(() => {
          const state = window as Window & { __BLOCK_FINISHED_WRITES__?: boolean }
          state.__BLOCK_FINISHED_WRITES__ = true
          const original = Storage.prototype.setItem
          Storage.prototype.setItem = function(key, value) {
            if (state.__BLOCK_FINISHED_WRITES__ && key.startsWith('fitai_session_v2_') && JSON.parse(value).finishedAt > 0) throw new Error('Quota exceeded')
            original.call(this, key, value)
          }
        })
        await page.getByRole('button', { name: 'Finalizar', exact: true }).click()
        await pwExpect(page.getByText('Sesión completa', { exact: true })).toBeVisible()
        const finished = await sessionState(page)
        await page.getByRole('button', { name: 'Guardar sesión', exact: true }).click()
        await pwExpect(page.getByRole('alert')).toContainText('No se pudo respaldar la sesión')
        expect(await page.evaluate(() => localStorage.getItem('fixture-save-attempts'))).toBeNull()
        await page.evaluate(() => {
          (window as Window & { __BLOCK_FINISHED_WRITES__?: boolean }).__BLOCK_FINISHED_WRITES__ = false
          localStorage.setItem('fixture-network-restored', 'true')
        })
        await page.getByRole('button', { name: 'Guardar sesión', exact: true }).click()
        await pwExpect(page.getByRole('button', { name: 'Volver al dashboard', exact: true })).toBeEnabled()
        const attempts = await page.evaluate(() => JSON.parse(localStorage.getItem('fixture-save-attempts') ?? '[]'))
        expect(attempts).toHaveLength(1)
        expect(attempts[0]).toMatchObject({ clientSessionId: finished.clientSessionId, finishedAt: finished.finishedAt })
      } finally { await context.close() }
    })

    it(`restores a finished session after a lost save response at ${width}px`, async () => {
      const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: 'reduce' })
      const page = await context.newPage()
      try {
        await page.goto(baseUrl + fixtureRoute)
        await page.getByRole('button', { name: 'Completar serie 1', exact: true }).click()
        await page.getByRole('button', { name: 'Finalizar', exact: true }).click()
        await pwExpect(page.getByText('Sesión completa', { exact: true })).toBeVisible()
        const finished = await sessionState(page)
        expect(finished.finishedAt).toBeGreaterThan(0)
        const persisted = await page.evaluate(key => JSON.parse(localStorage.getItem(key) ?? '{}'), backupKey)
        expect(persisted).toMatchObject({ finishedAt: finished.finishedAt, clientSessionId: finished.clientSessionId })
        await page.getByRole('button', { name: 'Guardar sesión', exact: true }).click()
        await pwExpect(page.getByRole('alert').filter({ hasText: 'Error de red' })).toBeVisible()
        await page.reload()
        await pwExpect(page.getByText('Sesión completa', { exact: true })).toBeVisible()
        expect(await sessionState(page)).toMatchObject(finished)
        await pwExpect(page.getByRole('button', { name: 'Finalizar', exact: true })).toHaveCount(0)
        await page.evaluate(() => localStorage.setItem('fixture-network-restored', 'true'))
        await page.getByRole('button', { name: 'Guardar sesión', exact: true }).click()
        await pwExpect(page.getByRole('button', { name: 'Volver al dashboard', exact: true })).toBeEnabled()
        const saved = await page.evaluate(key => ({ attempts: JSON.parse(localStorage.getItem('fixture-save-attempts') ?? '[]'), committed: JSON.parse(localStorage.getItem('fixture-committed') ?? '{}'), backup: localStorage.getItem(key) }), backupKey)
        expect(saved.attempts).toHaveLength(2)
        for (const attempt of saved.attempts) expect(attempt).toMatchObject({ clientSessionId: finished.clientSessionId, finishedAt: finished.finishedAt })
        expect(Object.keys(saved.committed)).toEqual([finished.clientSessionId])
        expect(saved.backup).toBeNull()
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
      } finally { await context.close() }
    })

    it(`hides account A's dock and memory while account B is active at ${width}px`, async () => {
      const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: 'reduce' })
      const page = await context.newPage()
      try {
        await page.goto(baseUrl + fixtureRoute)
        await page.getByRole('button', { name: 'Completar serie 1', exact: true }).click()
        const original = await page.evaluate(key => localStorage.getItem(key), backupKey)
        await page.getByRole('button', { name: 'Dashboard de prueba', exact: true }).dispatchEvent('click')
        await pwExpect(page.getByRole('link', { name: /Entrenamiento de cuenta A/ })).toBeVisible()
        await page.getByRole('button', { name: 'Cuenta B', exact: true }).dispatchEvent('click')
        await pwExpect(page.getByRole('link', { name: /Entrenamiento de cuenta A/ })).toHaveCount(0)
        await pwExpect.poll(async () => (await sessionState(page)).userId).toBe('')
        expect(await page.evaluate(key => localStorage.getItem(key), backupKey)).toBe(original)
        await page.getByRole('button', { name: 'Cuenta A', exact: true }).dispatchEvent('click')
        await pwExpect(page.getByRole('link', { name: /Entrenamiento de cuenta A/ })).toBeVisible()
        await pwExpect(page.getByText('1 de 1 series', { exact: true })).toBeVisible()
      } finally { await context.close() }
    })
  }
})
