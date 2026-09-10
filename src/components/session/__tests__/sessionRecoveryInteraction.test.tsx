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
      define: { 'process.env.NEXT_PUBLIC_LOCAL_APP': '"false"' },
      optimizeDeps: { entries: [fixture('sessionRecovery.html')], include: ['react', 'react-dom', 'react-dom/client', 'react/jsx-dev-runtime', 'lucide-react', 'framer-motion', 'zustand', '@radix-ui/react-dialog', '@radix-ui/react-toast', '@radix-ui/react-slot', '@radix-ui/react-select', '@radix-ui/react-dropdown-menu', '@radix-ui/react-avatar', '@capacitor/core', '@capacitor/haptics', 'class-variance-authority', 'clsx', 'tailwind-merge'] },
      resolve: { dedupe: ['react', 'react-dom'], alias: [
        ...['@/app/actions/authorizeSession', '@/app/actions/readiness', '@/app/actions/saveSession', '@/app/actions/posts', '@/app/actions/workspace', '@/app/(auth)/actions'].map(find => ({ find, replacement: fixture('sessionActions.fixture.ts') })),
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

  it('does not leave a phantom dock after a completed workout rejects a fresh start', async () => {
    const page = await browser.newPage({ viewport: { width: 375, height: 900 }, reducedMotion: 'reduce' })
    try {
      await page.goto(baseUrl + fixtureRoute + '?readiness=completed')
      await pwExpect(page.getByRole('alert')).toContainText('Esta rutina ya fue completada.')
      const before = await sessionState(page)
      const backup = await page.evaluate(key => JSON.parse(localStorage.getItem(key) ?? '{}'), backupKey)
      await page.locator('button').filter({ hasText: 'Dashboard de prueba' }).dispatchEvent('click')
      await pwExpect(page.getByRole('complementary', { name: 'Entrenamiento en curso' })).toHaveCount(0)
      expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key) ?? '{}'), backupKey)).toEqual(backup)
      expect(backup.clientSessionId).toBe(before.clientSessionId)
      expect(backup.exercises).toHaveLength(1)
      await page.reload()
      await pwExpect(page.getByRole('alert')).toContainText('Esta rutina ya fue completada.')
      expect((await sessionState(page)).clientSessionId).toBe(before.clientSessionId)
      await page.locator('button').filter({ hasText: 'Dashboard de prueba' }).dispatchEvent('click')
      await pwExpect(page.getByRole('complementary', { name: 'Entrenamiento en curso' })).toHaveCount(0)
    } finally { await page.close() }
  })

  it('repairs an older phantom backup after a verified denial without deleting its identity or exercises', async () => {
    const page = await browser.newPage({ viewport: { width: 375, height: 900 }, reducedMotion: 'reduce' })
    try {
      await page.goto(baseUrl + fixtureRoute + '?readiness=completed')
      await pwExpect(page.getByRole('alert')).toContainText('Esta rutina ya fue completada.')
      const legacy = await page.evaluate(key => {
        const draft = JSON.parse(localStorage.getItem(key) ?? '{}')
        delete draft.activationState
        localStorage.setItem(key, JSON.stringify(draft))
        localStorage.setItem('fitai_active_session_v2_account-a', JSON.stringify({ version: 2, userId: 'account-a', workoutId: draft.workoutId }))
        return draft
      }, backupKey)
      await page.reload()
      await pwExpect(page.getByRole('alert')).toContainText('Esta rutina ya fue completada.')
      const repaired = await page.evaluate(key => JSON.parse(localStorage.getItem(key) ?? '{}'), backupKey)
      expect(repaired).toMatchObject({ ...legacy, activationState: 'preparing' })
      await page.locator('button').filter({ hasText: 'Dashboard de prueba' }).dispatchEvent('click')
      await pwExpect(page.getByRole('complementary', { name: 'Entrenamiento en curso' })).toHaveCount(0)
    } finally { await page.close() }
  })

  it('keeps an older finished session available when reauthorization fails without absence evidence', async () => {
    const page = await browser.newPage({ viewport: { width: 375, height: 900 }, reducedMotion: 'reduce' })
    try {
      await page.goto(baseUrl + fixtureRoute)
      await page.getByRole('button', { name: 'Completar serie 1', exact: true }).click()
      await page.getByRole('button', { name: 'Finalizar', exact: true }).click()
      await pwExpect(page.getByText('Sesión completa', { exact: true })).toBeVisible()
      const legacy = await page.evaluate(key => {
        const draft = JSON.parse(localStorage.getItem(key) ?? '{}')
        delete draft.activationState
        localStorage.setItem(key, JSON.stringify(draft))
        return draft
      }, backupKey)
      await page.goto(baseUrl + fixtureRoute + '?readiness=generic')
      await pwExpect(page.getByRole('alert')).toContainText('No se pudo preparar la sesión.')
      const preserved = await page.evaluate(key => JSON.parse(localStorage.getItem(key) ?? '{}'), backupKey)
      expect(preserved).toMatchObject(legacy)
      expect(preserved.activationState).toBe('active')
      await page.locator('button').filter({ hasText: 'Dashboard de prueba' }).dispatchEvent('click')
      await pwExpect(page.getByRole('complementary', { name: 'Entrenamiento en curso' })).toBeVisible()
      await pwExpect(page.getByText('1 de 1 series', { exact: true })).toBeVisible()
    } finally { await page.close() }
  })

  it.each([375, 1440])('recovers pending session readiness without changing the session ID at %ipx', async width => {
    const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: 'reduce' })
    const page = await context.newPage()
    try {
      await page.goto(baseUrl + fixtureRoute + '?readiness=pending')
      const dialog = page.getByRole('dialog', { name: 'Preparación antes de entrenar', exact: true })
      await pwExpect(dialog).toBeVisible()
      await pwExpect(dialog).toContainText('Revisa tus respuestas antes de continuar con este entrenamiento.')
      await pwExpect(dialog).not.toContainText('la generación automática se detendrá')
      const before = await sessionState(page)
      const attemptsBefore = await page.evaluate(() => JSON.parse(localStorage.getItem('fixture-authorize-attempts') ?? '[]'))
      await pwExpect(dialog.getByPlaceholder('Zona: rodilla, hombro...')).toHaveValue('Rodilla')
      await page.keyboard.press('Escape')
      await pwExpect(dialog).toHaveCount(0)
      const recovery = page.getByRole('button', { name: 'Completar preparación', exact: true })
      await pwExpect(recovery).toBeFocused()
      await pwExpect(page.getByRole('link', { name: 'Volver al plan', exact: true })).toHaveAttribute('href', '/plan')
      expect(await page.evaluate(() => JSON.parse(localStorage.getItem('fixture-authorize-attempts') ?? '[]'))).toEqual(attemptsBefore)
      await recovery.click()
      await pwExpect(dialog).toBeVisible()
      await dialog.getByLabel('Actividad habitual').selectOption('regularly_active')
      await dialog.getByRole('button', { name: 'Guardar y continuar', exact: true }).click()
      await pwExpect(page.getByRole('button', { name: 'Completar serie 1', exact: true })).toBeVisible()
      await pwExpect(dialog).toHaveCount(0)
      expect(await sessionState(page)).toMatchObject({ userId: before.userId, clientSessionId: before.clientSessionId })
      const saved = await page.evaluate(() => ({
        attempts: JSON.parse(localStorage.getItem('fixture-authorize-attempts') ?? '[]'),
        answers: JSON.parse(localStorage.getItem('fixture-readiness-answers') ?? '{}'),
      }))
      expect(saved.attempts.length).toBe(attemptsBefore.length + 1)
      expect(saved.attempts.every((attempt: { clientSessionId: string }) => attempt.clientSessionId === before.clientSessionId)).toBe(true)
      expect(saved.answers).toMatchObject({ activityLevel: 'regularly_active', limitations: [{ region: 'Rodilla', movementsToAvoid: ['saltos'], clinicianCleared: true }] })
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    } finally { await context.close() }
  })

  it('keeps professional readiness blocked after saving and does not auto-open another review', async () => {
    const page = await browser.newPage({ viewport: { width: 375, height: 900 }, reducedMotion: 'reduce' })
    try {
      await page.goto(baseUrl + fixtureRoute + '?readiness=pending')
      const dialog = page.getByRole('dialog', { name: 'Preparación antes de entrenar', exact: true })
      await pwExpect(dialog).toBeVisible()
      const before = await sessionState(page)
      await dialog.getByLabel('Presento dolor torácico', { exact: false }).check()
      await dialog.getByRole('button', { name: 'Guardar y continuar', exact: true }).click()
      await pwExpect(dialog).toHaveCount(0)
      await pwExpect(page.getByRole('heading', { name: 'Necesitas autorización profesional', exact: true })).toBeVisible()
      await pwExpect(page.getByRole('alert')).toContainText('profesional de salud')
      await pwExpect(page.getByRole('button', { name: 'Completar serie 1', exact: true })).toHaveCount(0)
      const recovery = page.getByRole('button', { name: 'Revisar respuestas', exact: true })
      await recovery.click()
      await pwExpect(dialog).toBeVisible()
      await pwExpect(dialog.getByLabel('Presento dolor torácico', { exact: false })).toBeChecked()
      await pwExpect(dialog.getByPlaceholder('Zona: rodilla, hombro...')).toHaveValue('Rodilla')
      await page.keyboard.press('Escape')
      await pwExpect(dialog).toHaveCount(0)
      await pwExpect(recovery).toBeFocused()
      expect(await sessionState(page)).toMatchObject({ clientSessionId: before.clientSessionId })
    } finally { await page.close() }
  })

  it('opens professional readiness only on request and retains the generic authorization retry', async () => {
    const page = await browser.newPage({ viewport: { width: 375, height: 900 }, reducedMotion: 'reduce' })
    try {
      await page.goto(baseUrl + fixtureRoute + '?readiness=professional_clearance_required')
      await pwExpect(page.getByRole('button', { name: 'Revisar respuestas', exact: true })).toBeVisible()
      await pwExpect(page.getByRole('dialog')).toHaveCount(0)
      await pwExpect(page.getByRole('link', { name: 'Volver al plan', exact: true })).toHaveAttribute('href', '/plan')
      await page.goto(baseUrl + fixtureRoute + '?readiness=generic')
      const before = await sessionState(page)
      await page.evaluate(() => localStorage.setItem('fixture-readiness-status', 'cleared'))
      await page.getByRole('button', { name: 'Reintentar autorización', exact: true }).click()
      await pwExpect(page.getByRole('button', { name: 'Completar serie 1', exact: true })).toBeVisible()
      expect(await sessionState(page)).toMatchObject({ clientSessionId: before.clientSessionId })
    } finally { await page.close() }
  })

  it('retains edited readiness answers on save failure without authorizing or unlocking', async () => {
    const page = await browser.newPage({ viewport: { width: 375, height: 900 }, reducedMotion: 'reduce' })
    try {
      await page.goto(baseUrl + fixtureRoute + '?readiness=pending')
      const dialog = page.getByRole('dialog', { name: 'Preparación antes de entrenar', exact: true })
      await pwExpect(dialog).toBeVisible()
      await page.evaluate(() => localStorage.setItem('fixture-readiness-save-fails', 'true'))
      const before = await page.evaluate(() => localStorage.getItem('fixture-authorize-attempts'))
      await dialog.getByLabel('Actividad habitual').selectOption('regularly_active')
      await dialog.getByPlaceholder('Zona: rodilla, hombro...').fill('Hombro')
      await dialog.getByRole('button', { name: 'Guardar y continuar', exact: true }).click()
      await pwExpect(dialog.getByRole('alert')).toContainText('No se pudo guardar')
      await pwExpect(dialog.getByLabel('Actividad habitual')).toHaveValue('regularly_active')
      await pwExpect(dialog.getByPlaceholder('Zona: rodilla, hombro...')).toHaveValue('Hombro')
      expect(await page.evaluate(() => localStorage.getItem('fixture-authorize-attempts'))).toBe(before)
      await pwExpect(page.getByRole('button', { name: 'Completar serie 1', exact: true })).toHaveCount(0)
    } finally { await page.close() }
  })

  it('does not authorize a session after a readiness save resolves on an abandoned route', async () => {
    const page = await browser.newPage({ viewport: { width: 375, height: 900 }, reducedMotion: 'reduce' })
    try {
      await page.goto(baseUrl + fixtureRoute + '?readiness=pending')
      const dialog = page.getByRole('dialog', { name: 'Preparación antes de entrenar', exact: true })
      await pwExpect(dialog).toBeVisible()
      await page.evaluate(() => localStorage.setItem('fixture-readiness-save-hold', 'true'))
      const before = await page.evaluate(() => localStorage.getItem('fixture-authorize-attempts'))
      await dialog.getByRole('button', { name: 'Guardar y continuar', exact: true }).click()
      await pwExpect(dialog.getByRole('button', { name: 'Guardando…', exact: true })).toBeDisabled()
      // Route changes can unmount the session even while the saving dialog is locked.
      await page.locator('button').filter({ hasText: 'Dashboard de prueba' }).dispatchEvent('click')
      await pwExpect(dialog).toHaveCount(0)
      await page.evaluate(() => {
        (window as Window & { __RESOLVE_READINESS_SAVE__?: () => void }).__RESOLVE_READINESS_SAVE__?.()
      })
      await pwExpect.poll(async () => page.evaluate(() => localStorage.getItem('fixture-readiness-status'))).not.toBeNull()
      expect(await page.evaluate(() => localStorage.getItem('fixture-authorize-attempts'))).toBe(before)
      await pwExpect(page.getByRole('button', { name: 'Completar serie 1', exact: true })).toHaveCount(0)
    } finally { await page.close() }
  })

  it('ignores a readiness save callback from a previous account lifecycle', async () => {
    const page = await browser.newPage({ viewport: { width: 375, height: 900 }, reducedMotion: 'reduce' })
    try {
      await page.goto(baseUrl + fixtureRoute + '?readiness=pending')
      const dialog = page.getByRole('dialog', { name: 'Preparación antes de entrenar', exact: true })
      await pwExpect(dialog).toBeVisible()
      await page.evaluate(() => localStorage.setItem('fixture-readiness-save-hold', 'true'))
      await dialog.getByRole('button', { name: 'Guardar y continuar', exact: true }).click()
      await pwExpect(dialog.getByRole('button', { name: 'Guardando…', exact: true })).toBeDisabled()
      await page.locator('button').filter({ hasText: 'Cuenta B' }).dispatchEvent('click')
      await pwExpect.poll(async () => (await sessionState(page)).userId).toBe('account-b')
      await pwExpect.poll(async () => page.evaluate(() => JSON.parse(localStorage.getItem('fixture-authorize-attempts') ?? '[]').length)).toBeGreaterThan(1)
      const before = await page.evaluate(() => localStorage.getItem('fixture-authorize-attempts'))
      await page.evaluate(() => {
        (window as Window & { __RESOLVE_READINESS_SAVE__?: () => void }).__RESOLVE_READINESS_SAVE__?.()
      })
      await pwExpect.poll(async () => page.evaluate(() => localStorage.getItem('fixture-readiness-status'))).not.toBeNull()
      expect(await page.evaluate(() => localStorage.getItem('fixture-authorize-attempts'))).toBe(before)
      await pwExpect(page.getByRole('button', { name: 'Completar serie 1', exact: true })).toHaveCount(0)
    } finally { await page.close() }
  })

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
