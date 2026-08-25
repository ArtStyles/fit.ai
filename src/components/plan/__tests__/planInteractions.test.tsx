import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { chromium, expect as pwExpect, type Browser } from '@playwright/test'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

describe('plan editor mobile interactions', () => {
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
      cacheDir: path.join(repoRoot, 'node_modules', '.vite-plan-interactions-test'),
      oxc: { jsx: { runtime: 'automatic' } },
      optimizeDeps: {
        include: [
          'react', 'react-dom', 'react-dom/client', 'lucide-react', 'framer-motion',
          '@radix-ui/react-dialog', '@radix-ui/react-select',
        ],
      },
      resolve: { dedupe: ['react', 'react-dom'], alias: [
        { find: '@/components/feedback/SubmitButton', replacement: path.join(repoRoot, 'src/components/plan/__tests__/fixtures/submitButton.fixture.tsx') },
        { find: '@/app/actions/plan', replacement: path.join(repoRoot, 'src/components/plan/__tests__/fixtures/planActions.fixture.ts') },
        { find: '@/app/actions/adjustPlan', replacement: path.join(repoRoot, 'src/components/plan/__tests__/fixtures/adjustPlan.fixture.ts') },
        { find: '@/app/actions/exerciseCatalog', replacement: path.join(repoRoot, 'src/components/plan/__tests__/fixtures/exerciseCatalog.fixture.ts') },
        { find: 'next/navigation', replacement: path.join(repoRoot, 'src/components/coaching/__tests__/fixtures/nextNavigation.fixture.ts') },
        { find: 'next/link', replacement: path.join(repoRoot, 'src/components/coaching/__tests__/fixtures/nextLink.fixture.tsx') },
        { find: 'next/image', replacement: path.join(repoRoot, 'src/components/coaching/__tests__/fixtures/nextImage.fixture.tsx') },
        { find: '@', replacement: path.join(repoRoot, 'src') },
      ] },
      server: { host: '127.0.0.1', port: 0, strictPort: false, hmr: false },
    })
    await viteServer.listen()
    const address = viteServer.httpServer.address()
    if (!address || typeof address === 'string') throw new Error('Plan fixture did not bind a TCP port.')
    baseUrl = `http://127.0.0.1:${address.port}`
    browser = await chromium.launch({ headless: true })
  }, 30_000)

  afterAll(async () => {
    await browser?.close()
    await viteServer?.close()
  }, 30_000)

  it('shows a circular exercise image that opens its preview from the day detail', async () => {
    const context = await browser.newContext({ viewport: { width: 375, height: 812 } })
    const page = await context.newPage()
    try {
      await page.goto(`${baseUrl}/src/components/plan/__tests__/fixtures/planInteractions.html?surface=workspace`)
      await page.waitForFunction(() => Boolean((window as Window & { __PLAN_INTERACTIONS_READY__?: boolean }).__PLAN_INTERACTIONS_READY__))
      await page.getByRole('button', { name: /Día A/ }).click()

      const workoutDialog = page.getByRole('dialog', { name: 'Día A' })
      const imageTrigger = workoutDialog.getByRole('button', { name: /Ampliar imagen de/ })
      await pwExpect(imageTrigger).toBeVisible()
      expect(await imageTrigger.evaluate(element => {
        const bounds = element.getBoundingClientRect()
        return {
          width: bounds.width,
          height: bounds.height,
          borderRadius: getComputedStyle(element).borderRadius,
        }
      })).toEqual({ width: 48, height: 48, borderRadius: '9999px' })

      await imageTrigger.click()
      const preview = page.getByRole('dialog', { name: /NombreDeEjercicioExtremadamenteLargo/ })
      await pwExpect(preview).toBeVisible()
      await pwExpect(preview.getByRole('img', { name: /NombreDeEjercicioExtremadamenteLargo/ })).toBeVisible()
    } finally {
      await context.close()
    }
  }, 20_000)

  it('keeps the circular image preview available while editing the workout structure', async () => {
    const context = await browser.newContext({ viewport: { width: 375, height: 812 } })
    const page = await context.newPage()
    try {
      await page.goto(`${baseUrl}/src/components/plan/__tests__/fixtures/planInteractions.html?surface=workspace`)
      await page.waitForFunction(() => Boolean((window as Window & { __PLAN_INTERACTIONS_READY__?: boolean }).__PLAN_INTERACTIONS_READY__))
      await page.getByRole('button', { name: /Día A/ }).click()
      await page.getByRole('button', { name: 'Editar estructura' }).click()

      const workoutDialog = page.getByRole('dialog', { name: 'Día A' })
      const imageTrigger = workoutDialog.getByRole('button', { name: /Ampliar imagen de/ })
      await pwExpect(imageTrigger).toBeVisible()
      expect(await imageTrigger.evaluate(element => {
        const bounds = element.getBoundingClientRect()
        return {
          width: bounds.width,
          height: bounds.height,
          borderRadius: getComputedStyle(element).borderRadius,
        }
      })).toEqual({ width: 48, height: 48, borderRadius: '9999px' })

      await imageTrigger.click()
      await pwExpect(page.getByRole('dialog', { name: /NombreDeEjercicioExtremadamenteLargo/ })).toBeVisible()
    } finally {
      await context.close()
    }
  }, 20_000)

  it('does not offer a coach adjustment from the workout structure editor', async () => {
    const context = await browser.newContext({ viewport: { width: 375, height: 812 } })
    const page = await context.newPage()
    try {
      await page.goto(`${baseUrl}/src/components/plan/__tests__/fixtures/planInteractions.html?surface=workspace`)
      await page.waitForFunction(() => Boolean((window as Window & { __PLAN_INTERACTIONS_READY__?: boolean }).__PLAN_INTERACTIONS_READY__))
      await page.getByRole('button', { name: /Día A/ }).click()
      await page.getByRole('button', { name: 'Editar estructura' }).click()

      const workoutDialog = page.getByRole('dialog', { name: 'Día A' })
      await pwExpect(workoutDialog.getByRole('button', { name: 'Volver a lectura' })).toBeVisible()
      await pwExpect(workoutDialog.getByRole('button', { name: 'Pedir ajuste al coach' })).toHaveCount(0)
    } finally {
      await context.close()
    }
  }, 20_000)

  it('keeps long names inside the mobile editor and executes long-press actions', async () => {
    const context = await browser.newContext({ viewport: { width: 375, height: 812 } })
    const page = await context.newPage()
    try {
      await page.goto(`${baseUrl}/src/components/plan/__tests__/fixtures/planInteractions.html?surface=workspace`)
      await page.waitForFunction(() => Boolean((window as Window & { __PLAN_INTERACTIONS_READY__?: boolean }).__PLAN_INTERACTIONS_READY__))
      await page.getByRole('button', { name: /Día A/ }).click()
      await page.getByRole('button', { name: 'Editar estructura' }).click()

      const workoutDialog = page.getByRole('dialog', { name: 'Día A' })
      const name = workoutDialog.locator('p').filter({ hasText: /NombreDeEjercicioExtremadamenteLargo/ })
      await pwExpect(name).toBeVisible()
      const geometry = await name.evaluate(element => {
        const dialog = element.closest('[role="dialog"]')
        return {
          clientWidth: element.clientWidth,
          scrollWidth: element.scrollWidth,
          right: element.getBoundingClientRect().right,
          dialogRight: dialog?.getBoundingClientRect().right ?? 0,
        }
      })
      expect(geometry.scrollWidth).toBeLessThanOrEqual(geometry.clientWidth)
      expect(geometry.right).toBeLessThanOrEqual(geometry.dialogRight)

      await name.click({ button: 'right' })
      await page.getByRole('menuitem', { name: 'Editar detalles' }).click()
      const editDetails = page.getByRole('dialog', { name: 'Editar detalles' })
      await pwExpect(editDetails).toBeVisible()
      await editDetails.getByRole('button', { name: 'Cerrar' }).click()

      await workoutDialog.getByRole('button', { name: 'Agregar ejercicio' }).click()
      const catalog = page.getByRole('dialog', { name: 'Agregar ejercicios' })
      await pwExpect(catalog).toBeVisible()
      await pwExpect(workoutDialog.locator('input[name="sets"], input[name="reps"], input[name="weightKg"], input[name="restSeconds"], input[name="targetRpe"], textarea[name="notes"]')).toHaveCount(0)
      await catalog.getByRole('button', { name: /Ejercicio 01/ }).click()
      await catalog.getByRole('button', { name: 'Agregar 1 ejercicio' }).click()
      await pwExpect.poll(
        () => page.evaluate(() => (window as Window & { __ADDED_EXERCISE_IDS__?: string[] }).__ADDED_EXERCISE_IDS__),
        { timeout: 5_000 },
      ).toEqual(['exercise-01'])
    } finally {
      await context.close()
    }
  }, 40_000)

  it('uses compact category controls and paginates the catalog while preserving selections', async () => {
    const context = await browser.newContext({ viewport: { width: 375, height: 812 } })
    const page = await context.newPage()
    try {
      await page.goto(`${baseUrl}/src/components/plan/__tests__/fixtures/planInteractions.html?surface=catalog`)
      await page.waitForFunction(() => Boolean((window as Window & { __PLAN_INTERACTIONS_READY__?: boolean }).__PLAN_INTERACTIONS_READY__))
      const catalog = page.getByRole('dialog', { name: 'Agregar ejercicio' })
      await pwExpect(catalog.locator('select:not([aria-hidden="true"])')).toHaveCount(0)
      await pwExpect(catalog.getByRole('combobox')).toHaveCount(2)
      await pwExpect(catalog.locator('ul > li > button')).toHaveCount(24)

      await catalog.getByRole('combobox', { name: 'Filtrar por equipo' }).click()
      const categoryList = page.getByRole('listbox')
      await pwExpect(categoryList).toBeVisible()
      const categoryBounds = await categoryList.boundingBox()
      expect(categoryBounds?.height ?? 1000).toBeLessThan(300)
      expect((categoryBounds?.x ?? 0) + (categoryBounds?.width ?? 1000)).toBeLessThanOrEqual(375)
      await categoryList.getByRole('option', { name: 'Todo el equipo' }).click()

      await catalog.getByRole('button', { name: /Ejercicio 01/ }).click()
      await catalog.getByRole('button', { name: 'Siguiente' }).click()
      await pwExpect(catalog.getByText('Página 2 de 2')).toBeVisible()
      await pwExpect(catalog.locator('ul > li > button')).toHaveCount(6)
      await catalog.getByRole('button', { name: /Ejercicio 30/ }).click()
      await catalog.getByRole('button', { name: 'Agregar 2 ejercicios' }).click()

      await page.waitForFunction(() => Boolean((window as Window & { __CATALOG_SELECTION__?: string[] }).__CATALOG_SELECTION__))
      expect(await page.evaluate(() => (window as Window & { __CATALOG_SELECTION__?: string[] }).__CATALOG_SELECTION__)).toEqual([
        'exercise-01', 'exercise-30',
      ])
    } finally {
      await context.close()
    }
  }, 20_000)

  it('keeps selection and focus context when async confirmation fails', async () => {
    const context = await browser.newContext({ viewport: { width: 375, height: 812 } })
    const page = await context.newPage()
    try {
      await page.goto(`${baseUrl}/src/components/plan/__tests__/fixtures/planInteractions.html?surface=catalog&confirm=retry`)
      await page.waitForFunction(() => Boolean((window as Window & { __PLAN_INTERACTIONS_READY__?: boolean }).__PLAN_INTERACTIONS_READY__))
      const catalog = page.getByRole('dialog', { name: 'Agregar ejercicio' })
      await catalog.getByRole('button', { name: /Ejercicio 01/ }).click()
      await catalog.getByRole('button', { name: 'Agregar 1 ejercicio' }).click()
      await pwExpect.poll(() => page.evaluate(() => (window as Window & { __CATALOG_ATTEMPTS__?: number }).__CATALOG_ATTEMPTS__)).toBe(1)
      await pwExpect.poll(() => page.evaluate(() => (window as Window & { __CATALOG_OPEN__?: boolean }).__CATALOG_OPEN__)).toBe(true)
      await pwExpect(catalog).toBeVisible()
      await pwExpect(catalog.getByRole('button', { name: /Ejercicio 01/ })).toHaveAttribute('aria-pressed', 'true')
      await catalog.getByRole('button', { name: 'Agregar 1 ejercicio' }).click()
      await pwExpect.poll(() => page.evaluate(() => (window as Window & { __CATALOG_SELECTION__?: string[] }).__CATALOG_SELECTION__)).toEqual(['exercise-01'])
      await pwExpect.poll(() => page.evaluate(() => (window as Window & { __CATALOG_OPEN__?: boolean }).__CATALOG_OPEN__)).toBe(false)
      await pwExpect(catalog).toBeHidden()
    } finally {
      await context.close()
    }
  }, 40_000)

  it('keeps the workout structure open after saving exercise details', async () => {
    const context = await browser.newContext({ viewport: { width: 375, height: 812 } })
    const page = await context.newPage()
    try {
      await page.goto(`${baseUrl}/src/components/plan/__tests__/fixtures/planInteractions.html?surface=workspace`)
      await page.waitForFunction(() => Boolean((window as Window & { __PLAN_INTERACTIONS_READY__?: boolean }).__PLAN_INTERACTIONS_READY__))
      await page.getByRole('button', { name: /Día A/ }).click()
      await page.getByRole('button', { name: 'Editar estructura' }).click()

      const workoutDialog = page.getByRole('dialog', { name: 'Día A' })
      const exerciseName = workoutDialog.locator('p').filter({ hasText: /NombreDeEjercicioExtremadamenteLargo/ })
      await exerciseName.click({ button: 'right' })
      await page.getByRole('menuitem', { name: 'Editar detalles' }).click()

      const detailsDialog = page.getByRole('dialog', { name: 'Editar detalles' })
      await detailsDialog.locator('input[name="reps"]').fill('12')
      await detailsDialog.getByRole('button', { name: 'Guardar detalles' }).click()

      await pwExpect.poll(
        () => page.evaluate(() => (window as Window & { __UPDATED_EXERCISE_REPS__?: string }).__UPDATED_EXERCISE_REPS__),
      ).toBe('12')
      await pwExpect(detailsDialog).toBeHidden()
      await pwExpect(workoutDialog).toBeVisible()
      await pwExpect(workoutDialog.getByRole('button', { name: 'Volver a lectura' })).toBeVisible()
    } finally {
      await context.close()
    }
  }, 40_000)

  it('uses the full exercise catalog to replace the selected workout row', async () => {
    const context = await browser.newContext({ viewport: { width: 375, height: 812 } })
    const page = await context.newPage()
    try {
      await page.goto(`${baseUrl}/src/components/plan/__tests__/fixtures/planInteractions.html?surface=workspace`)
      await page.waitForFunction(() => Boolean((window as Window & { __PLAN_INTERACTIONS_READY__?: boolean }).__PLAN_INTERACTIONS_READY__))
      await page.getByRole('button', { name: /Día A/ }).click()
      await page.getByRole('button', { name: 'Editar estructura' }).click()

      const workoutDialog = page.getByRole('dialog', { name: 'Día A' })
      const exerciseName = workoutDialog.locator('p').filter({ hasText: /NombreDeEjercicioExtremadamenteLargo/ })
      await exerciseName.click({ button: 'right' })
      await page.getByRole('menuitem', { name: 'Reemplazar ejercicio' }).click()

      const catalog = page.getByRole('dialog', { name: 'Reemplazar ejercicio' })
      await pwExpect(catalog.getByRole('searchbox', { name: 'Buscar ejercicios' })).toBeVisible()
      await pwExpect(catalog.getByRole('combobox')).toHaveCount(2)
      await catalog.getByRole('button', { name: /Ejercicio 02/ }).click()
      await catalog.getByRole('button', { name: 'Reemplazar 1 ejercicio' }).click()

      await pwExpect.poll(
        () => page.evaluate(() => (window as Window & { __REPLACED_EXERCISE__?: { rowId: string; exerciseId: string } }).__REPLACED_EXERCISE__),
      ).toEqual({ rowId: 'row-1', exerciseId: 'exercise-02' })
      await pwExpect(workoutDialog).toBeVisible()
      await pwExpect(workoutDialog.getByRole('button', { name: 'Volver a lectura' })).toBeVisible()
    } finally {
      await context.close()
    }
  }, 40_000)
})
