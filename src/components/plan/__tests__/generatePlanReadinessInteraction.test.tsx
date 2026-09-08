import { warmupFixture } from '@/test/browser/warmupFixture'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { chromium, expect as pwExpect, type Browser, type Locator, type Page } from '@playwright/test'
import path from 'node:path'
import { mkdir } from 'node:fs/promises'
import { fileURLToPath, pathToFileURL } from 'node:url'
import type { ReadinessFixtureState } from './fixtures/generatePlanReadinessActions.fixture'

describe('initial plan readiness recovery', () => {
  let browser: Browser
  let viteServer: {
    listen: () => Promise<void>
    close: () => Promise<void>
    httpServer: { address: () => string | { port: number } | null }
  }
  let baseUrl = ''

  beforeAll(async () => {
    const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..')
    const fixture = (name: string) => path.join(repoRoot, 'src/components/plan/__tests__/fixtures', name)
    const viteEntry = path.join(repoRoot, 'node_modules/.pnpm/node_modules/vite/dist/node/index.js')
    const { createServer } = await import(pathToFileURL(viteEntry).href)
    viteServer = await createServer({
      configFile: false,
      root: repoRoot,
      appType: 'spa',
      cacheDir: path.join(repoRoot, 'node_modules', '.vite-generate-plan-readiness-test'),
      oxc: { jsx: { runtime: 'automatic' } },
      optimizeDeps: {
        entries: [fixture('generatePlanReadiness.html')],
        include: ['react', 'react-dom', 'react-dom/client', 'react/jsx-dev-runtime', 'lucide-react', '@radix-ui/react-dialog', '@radix-ui/react-toast', '@radix-ui/react-slot', 'class-variance-authority', 'clsx', 'tailwind-merge'],
      },
      resolve: { dedupe: ['react', 'react-dom'], alias: [
        { find: '@/app/actions/generatePlan', replacement: fixture('generatePlanReadinessActions.fixture.ts') },
        { find: '@/app/actions/readiness', replacement: fixture('generatePlanReadinessActions.fixture.ts') },
        { find: 'next/navigation', replacement: fixture('generatePlanReadinessNavigation.fixture.ts') },
        { find: '@', replacement: path.join(repoRoot, 'src') },
      ] },
      server: { host: '127.0.0.1', port: 0, strictPort: false, hmr: false },
    })
    await viteServer.listen()
    const address = viteServer.httpServer.address()
    if (!address || typeof address === 'string') throw new Error('Readiness fixture did not bind a TCP port.')
    baseUrl = `http://127.0.0.1:${address.port}/src/components/plan/__tests__/fixtures/generatePlanReadiness.html`
    browser = await chromium.launch({ headless: true })
    await warmupFixture(browser, baseUrl, '__GENERATE_READINESS_READY__')
  }, 90_000)

  afterAll(async () => {
    await browser?.close()
    await viteServer?.close()
  }, 30_000)

  async function readState(page: Page) {
    return page.evaluate(() => {
      const { resolveSave: _resolveSave, ...state } = (window as unknown as Window & { __READINESS_FIXTURE__: ReadinessFixtureState }).__READINESS_FIXTURE__
      return state
    })
  }

  async function openReview(page: Page, scenario = 'review', autoStart = false) {
    await page.goto(`${baseUrl}?scenario=${scenario}&autostart=${autoStart}`)
    if (!autoStart) await page.getByRole('button', { name: 'Generar mi plan', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: 'Revisión antes de generar', exact: true })
    await pwExpect(dialog).toBeVisible()
    return dialog
  }

  async function editAnswers(dialog: Locator) {
    await dialog.getByLabel('Actividad habitual').selectOption('regularly_active')
    await dialog.getByRole('button', { name: 'Bicicleta', exact: true }).click()
    await dialog.getByRole('button', { name: 'Caminar', exact: true }).click()
    await dialog.getByPlaceholder('Zona: rodilla, hombro...').fill('Hombro')
    await dialog.getByPlaceholder('Movimientos a evitar, separados por comas').fill('press vertical, fondos')
  }

  async function expectEditedAnswers(dialog: Locator) {
    await pwExpect(dialog.getByLabel('Actividad habitual')).toHaveValue('regularly_active')
    await pwExpect(dialog.getByRole('button', { name: 'Bicicleta', exact: true })).toHaveAttribute('aria-pressed', 'true')
    await pwExpect(dialog.getByRole('button', { name: 'Caminar', exact: true })).toHaveAttribute('aria-pressed', 'false')
    await pwExpect(dialog.getByPlaceholder('Zona: rodilla, hombro...')).toHaveValue('Hombro')
    await pwExpect(dialog.getByPlaceholder('Movimientos a evitar, separados por comas')).toHaveValue('press vertical, fondos')
  }

  const editedInput = {
    activityLevel: 'regularly_active',
    cardioPreferences: ['cycling'],
    warningSymptoms: [], knownDisease: false, recentSurgery: false, medicallyCleared: false,
    limitations: [{ region: 'Hombro', side: 'left', status: 'stable', movementsToAvoid: ['press vertical', 'fondos'], clinicianCleared: true }],
  }

  it.each([360, 1280])('opens readiness and can reopen after dismissal without another generation at %ipx', async width => {
    const page = await browser.newPage({ viewport: { width, height: 900 } })
    try {
      const dialog = await openReview(page)
      expect(await page.getByText('No se pudo generar', { exact: true }).count()).toBe(0)
      await pwExpect(dialog.getByLabel('Actividad habitual')).toHaveValue('insufficiently_active')
      await pwExpect(dialog.getByPlaceholder('Zona: rodilla, hombro...')).toHaveValue('Rodilla')
      expect((await readState(page)).generateCalls).toHaveLength(1)
      await mkdir('artifacts/readiness-recovery', { recursive: true })
      await page.screenshot({ path: `artifacts/readiness-recovery/review-${width}.png`, fullPage: true, animations: 'disabled' })
      const bounds = await dialog.boundingBox()
      expect(bounds).not.toBeNull()
      expect(bounds!.x).toBeGreaterThanOrEqual(0)
      expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width)
      expect(bounds!.y).toBeGreaterThanOrEqual(0)
      expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(900)
      const submit = dialog.getByRole('button', { name: 'Guardar y generar', exact: true })
      await submit.scrollIntoViewIfNeeded()
      await pwExpect(submit).toBeInViewport()
      await page.screenshot({ path: `artifacts/readiness-recovery/review-submit-${width}.png`, fullPage: true, animations: 'disabled' })
      await dialog.getByRole('button', { name: 'Cerrar', exact: true }).click()
      await pwExpect(dialog).toBeHidden()
      const recovery = page.getByRole('button', { name: 'Completar preparación', exact: true })
      await pwExpect(recovery).toBeVisible()
      await pwExpect(recovery).toBeFocused()
      await page.screenshot({ path: `artifacts/readiness-recovery/recovery-${width}.png`, fullPage: true, animations: 'disabled' })
      await recovery.click()
      await pwExpect(dialog).toBeVisible()
      await pwExpect(dialog.getByRole('button', { name: 'Guardar y generar', exact: true })).toBeEnabled()
      expect((await readState(page)).generateCalls).toHaveLength(1)
      await page.keyboard.press('Escape')
      await pwExpect(dialog).toBeHidden()
      await pwExpect(recovery).toBeFocused()
      await page.keyboard.press('Enter')
      await pwExpect(dialog).toBeVisible()
      await pwExpect(dialog.getByRole('button', { name: 'Guardar y generar', exact: true })).toBeEnabled()
      expect((await readState(page)).generateCalls).toHaveLength(1)
      expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false)
    } finally { await page.close() }
  })

  it.each([
    { width: 360, autoStart: false }, { width: 1280, autoStart: false },
    { width: 360, autoStart: true }, { width: 1280, autoStart: true },
  ])('saves answers before resuming initial generation at $width px with autostart=$autoStart', async ({ width, autoStart }) => {
    const page = await browser.newPage({ viewport: { width, height: 900 } })
    try {
      const dialog = await openReview(page, 'review', autoStart)
      await editAnswers(dialog)
      await dialog.getByRole('button', { name: 'Guardar y generar', exact: true }).click()
      await pwExpect(page.getByRole('heading', { name: '¡Tu plan está listo!', exact: true })).toBeVisible()
      await pwExpect(dialog).toBeHidden()
      const state = await readState(page)
      expect(state.saveCalls).toEqual([editedInput])
      expect(state.events).toEqual(['generate', 'load', 'save', 'saved', 'generate'])
      expect(state.generateCalls).toHaveLength(2)
      for (const request of state.generateCalls) {
        expect(request).toEqual({ mode: 'initial', requestId: expect.any(String) })
        expect(request.requestId).toMatch(/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i)
      }
      if (autoStart) {
        expect(state.navigation).toEqual(['/dashboard'])
        expect(state.refreshes).toBe(1)
      } else {
        expect(state.navigation).toEqual([])
        await page.getByRole('button', { name: 'Ir al dashboard', exact: true }).click()
        expect((await readState(page)).navigation).toEqual(['/dashboard'])
      }
    } finally { await page.close() }
  })

  it.each(['save-error', 'save-throw'])('preserves edited answers and permits saving again after %s', async scenario => {
    const page = await browser.newPage({ viewport: { width: 360, height: 900 } })
    const pageErrors: string[] = []
    page.on('pageerror', error => pageErrors.push(error.message))
    try {
      const dialog = await openReview(page, scenario)
      await editAnswers(dialog)
      const submit = dialog.getByRole('button', { name: 'Guardar y generar', exact: true })
      await submit.click()
      await pwExpect(dialog.getByText(/No se pudo guardar/)).toBeVisible()
      await pwExpect(submit).toBeEnabled()
      await expectEditedAnswers(dialog)
      expect((await readState(page)).generateCalls).toHaveLength(1)
      expect((await readState(page)).saveCalls).toEqual([editedInput])
      await mkdir('artifacts/readiness-recovery', { recursive: true })
      await page.screenshot({ path: `artifacts/readiness-recovery/${scenario}-360.png`, fullPage: true, animations: 'disabled' })
      await submit.click()
      await pwExpect(page.getByRole('heading', { name: '¡Tu plan está listo!', exact: true })).toBeVisible()
      const state = await readState(page)
      expect(state.saveCalls).toEqual([editedInput, editedInput])
      expect(state.generateCalls).toHaveLength(2)
      expect(state.loadCalls).toBe(1)
      expect(pageErrors).toEqual([])
    } finally { await page.close() }
  })

  it.each(['load-error', 'load-throw'])('leaves loading and permits reopening after %s without generating again', async scenario => {
    const page = await browser.newPage({ viewport: { width: 360, height: 900 } })
    const pageErrors: string[] = []
    page.on('pageerror', error => pageErrors.push(error.message))
    try {
      const dialog = await openReview(page, scenario)
      await pwExpect(dialog.getByText(/No se pudo cargar/)).toBeVisible()
      await pwExpect(dialog.getByText('Cargando tu revisión actual…', { exact: true })).toBeHidden()
      await pwExpect(dialog.getByRole('button', { name: 'Guardar y generar', exact: true })).toHaveCount(0)
      await dialog.getByRole('button', { name: 'Cerrar', exact: true }).first().click()
      await page.getByRole('button', { name: 'Completar preparación', exact: true }).click()
      await pwExpect(dialog.getByRole('button', { name: 'Guardar y generar', exact: true })).toBeEnabled()
      await pwExpect(dialog.getByPlaceholder('Zona: rodilla, hombro...')).toHaveValue('Rodilla')
      const state = await readState(page)
      expect(state.loadCalls).toBe(2)
      expect(state.generateCalls).toHaveLength(1)
      expect(state.saveCalls).toEqual([])
      expect(pageErrors).toEqual([])
    } finally { await page.close() }
  })

  it('waits for pending save before generating and prevents duplicate submission', async () => {
    const page = await browser.newPage({ viewport: { width: 360, height: 900 } })
    try {
      const dialog = await openReview(page, 'save-hold', true)
      await editAnswers(dialog)
      await dialog.getByRole('button', { name: 'Guardar y generar', exact: true }).click()
      await pwExpect(dialog.getByRole('button', { name: 'Guardando…', exact: true })).toBeDisabled()
      await pwExpect(dialog.getByLabel('Actividad habitual')).toBeDisabled()
      await pwExpect(dialog.getByPlaceholder('Zona: rodilla, hombro...')).toBeDisabled()
      await dialog.getByRole('button', { name: 'Cerrar', exact: true }).click()
      await page.keyboard.press('Escape')
      await pwExpect(dialog).toBeVisible()
      const pending = await readState(page)
      expect(pending.generateCalls).toHaveLength(1)
      expect(pending.saveCalls).toEqual([editedInput])
      expect(pending.navigation).toEqual([])
      expect(pending.events).toEqual(['generate', 'load', 'save'])
      await page.evaluate(() => (window as unknown as Window & { __READINESS_FIXTURE__: ReadinessFixtureState }).__READINESS_FIXTURE__.resolveSave?.())
      await pwExpect(page.getByRole('heading', { name: '¡Tu plan está listo!', exact: true })).toBeVisible()
      const saved = await readState(page)
      expect(saved.generateCalls).toHaveLength(2)
      expect(saved.saveCalls).toHaveLength(1)
      expect(saved.navigation).toEqual(['/dashboard'])
      expect(saved.events).toEqual(['generate', 'load', 'save', 'saved', 'generate'])
    } finally { await page.close() }
  })

  it('keeps a persistent readiness block after save without navigation or automatic retry loops', async () => {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
    try {
      const dialog = await openReview(page, 'persistent-review', true)
      await pwExpect(dialog.getByLabel('Tengo una enfermedad cardiovascular, metabólica o renal diagnosticada.')).toBeChecked()
      await dialog.getByRole('button', { name: 'Guardar y generar', exact: true }).click()
      await page.waitForFunction(() => (window as unknown as Window & { __READINESS_FIXTURE__: ReadinessFixtureState }).__READINESS_FIXTURE__.generateCalls.length >= 2)
      await pwExpect(dialog).toBeVisible()
      await pwExpect(dialog.getByRole('button', { name: 'Guardar y generar', exact: true })).toBeEnabled()
      await pwExpect(page.getByRole('heading', { name: '¡Tu plan está listo!', exact: true })).toHaveCount(0)
      await dialog.getByRole('button', { name: 'Cerrar', exact: true }).click()
      await pwExpect(page.getByRole('button', { name: 'Completar preparación', exact: true })).toBeVisible()
      await pwExpect(page.locator('main').getByText('Antes de generar una rutina necesitas orientación o autorización de un profesional de salud cualificado.', { exact: true })).toBeVisible()
      const state = await readState(page)
      expect(state.generateCalls).toHaveLength(2)
      expect(state.saveCalls).toHaveLength(1)
      expect(state.navigation).toEqual([])
      expect(state.refreshes).toBe(0)
    } finally { await page.close() }
  })

  it('retries a generic generation error without opening readiness', async () => {
    const page = await browser.newPage({ viewport: { width: 360, height: 900 } })
    try {
      await page.goto(`${baseUrl}?scenario=generic`)
      await page.getByRole('button', { name: 'Generar mi plan', exact: true }).click()
      const retry = page.getByRole('button', { name: 'Reintentar', exact: true })
      await pwExpect(retry).toBeVisible()
      await pwExpect(page.getByText('No se pudo generar', { exact: true })).toBeVisible()
      await pwExpect(page.getByRole('dialog')).toHaveCount(0)
      expect((await readState(page)).loadCalls).toBe(0)
      await retry.click()
      await pwExpect(page.getByRole('heading', { name: '¡Tu plan está listo!', exact: true })).toBeVisible()
      const state = await readState(page)
      expect(state.generateCalls).toHaveLength(2)
      expect(state.loadCalls).toBe(0)
      expect(state.saveCalls).toEqual([])
    } finally { await page.close() }
  })
})
