import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { chromium, expect as pwExpect, type Browser } from '@playwright/test'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

type RecordedCall = {
  action: string
  fields: Record<string, string | string[]>
}

describe('professional template editor browser interactions', () => {
  let browser: Browser
  let viteServer: { listen: () => Promise<void>; close: () => Promise<void>; httpServer: { address: () => string | { port: number } | null } }
  let baseUrl = ''

  beforeAll(async () => {
    const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..')
    const viteEntry = path.join(repoRoot, 'node_modules/.pnpm/node_modules/vite/dist/node/index.js')
    const fixtureActions = path.join(repoRoot, 'src/components/coaching/__tests__/fixtures/trainerPrograms.fixture.ts')
    const { createServer } = await import(pathToFileURL(viteEntry).href)
    viteServer = await createServer({
      configFile: false,
      root: repoRoot,
      appType: 'spa',
      cacheDir: path.join(repoRoot, 'node_modules', '.vite-program-template-test'),
      oxc: { jsx: { runtime: 'automatic' } },
      optimizeDeps: { include: ['react', 'react-dom', 'react-dom/client', 'lucide-react', '@radix-ui/react-dialog'] },
      resolve: {
        dedupe: ['react', 'react-dom'],
        alias: [
          { find: '@/app/actions/trainerPrograms', replacement: fixtureActions },
          { find: '@/app/actions/exerciseCatalog', replacement: fixtureActions },
          { find: 'next/navigation', replacement: path.join(repoRoot, 'src/components/coaching/__tests__/fixtures/nextNavigation.fixture.ts') },
          { find: 'next/image', replacement: path.join(repoRoot, 'src/components/coaching/__tests__/fixtures/nextImage.fixture.tsx') },
          { find: '@', replacement: path.join(repoRoot, 'src') },
        ],
      },
      server: { host: '127.0.0.1', port: 0, strictPort: false, hmr: false },
    })
    await viteServer.listen()
    const address = viteServer.httpServer.address()
    if (!address || typeof address === 'string') throw new Error('Vite template editor fixture did not bind a TCP port.')
    baseUrl = `http://127.0.0.1:${address.port}`
    browser = await chromium.launch({ headless: true })
  }, 30_000)

  afterAll(async () => {
    await browser?.close()
    await viteServer?.close()
  })

  it('keeps this editable professional template separate from published assignments', async () => {
    const page = await browser.newPage()
    try {
      await page.goto(`${baseUrl}/src/components/coaching/__tests__/fixtures/programTemplateEditorInteraction.html`)
      await pwExpect(page.getByText(/Las ediciones de esta plantilla no cambian asignaciones ya publicadas/)).toBeVisible()
    } finally { await page.close() }
  })

  it('submits the new routine fields before the lazy server action and navigates to its editor', async () => {
    const page = await browser.newPage()
    try {
      await page.goto(`${baseUrl}/src/components/coaching/__tests__/fixtures/programTemplateEditorInteraction.html?view=new`)
      await page.getByLabel('Nombre').fill('Fuerza base')
      await page.getByLabel('Objetivo').fill('Ganar fuerza')
      await page.getByRole('button', { name: 'Crear plantilla' }).click()
      await page.waitForFunction(() => Boolean((window as Window & { __PROGRAM_ACTIONS__?: unknown[] }).__PROGRAM_ACTIONS__?.length))

      expect(await page.evaluate(() => (window as Window & { __PROGRAM_ACTIONS__?: RecordedCall[] }).__PROGRAM_ACTIONS__)).toEqual([
        { action: 'create-template', fields: { name: 'Fuerza base', goal: 'Ganar fuerza', daysPerWeek: '3', description: '' } },
      ])
      expect(await page.evaluate(() => (window as Window & { __PROGRAM_PUSHES__?: string[] }).__PROGRAM_PUSHES__)).toEqual([
        '/coach/programs/11111111-1111-4111-8111-111111111111',
      ])
    } finally { await page.close() }
  })

  it('marks descriptive edits pending and returns to saved after explicit save', async () => {
    const page = await browser.newPage()
    try {
      await page.goto(`${baseUrl}/src/components/coaching/__tests__/fixtures/programTemplateEditorInteraction.html`)
      const templateSummary = page.getByRole('region', { name: 'Fuerza' })
      await pwExpect(templateSummary.getByText('Todo guardado')).toBeVisible()
      await page.getByLabel('Nombre de la rutina').fill('Fuerza total')
      await pwExpect(templateSummary.getByText('Cambios pendientes')).toBeVisible()
      await page.getByRole('button', { name: 'Guardar plantilla' }).click()
      await pwExpect(templateSummary.getByText('Todo guardado')).toBeVisible()

      expect(await page.evaluate(() => (window as Window & { __PROGRAM_ACTIONS__?: RecordedCall[] }).__PROGRAM_ACTIONS__)).toEqual([
        { action: 'update-template', fields: { templateId: '11111111-1111-4111-8111-111111111111', name: 'Fuerza total', daysPerWeek: '3', goal: '', description: '' } },
      ])
    } finally { await page.close() }
  })

  it('creates a day with a localized weekday and an internally computed order', async () => {
    const page = await browser.newPage()
    try {
      await page.goto(`${baseUrl}/src/components/coaching/__tests__/fixtures/programTemplateEditorInteraction.html`)
      await page.getByRole('button', { name: 'Agregar día' }).click()
      const form = page.getByRole('form', { name: 'Agregar día' })
      await form.getByLabel('Nombre del día').fill('Día C')
      await form.getByLabel('Día de la semana').selectOption({ label: 'Viernes' })
      await expect(form.getByLabel(/Orden/).count()).resolves.toBe(0)
      await form.getByRole('button', { name: 'Agregar día' }).click()
      await page.waitForFunction(() => Boolean((window as Window & { __PROGRAM_ACTIONS__?: RecordedCall[] }).__PROGRAM_ACTIONS__?.some(call => call.action === 'create-workout')))

      expect((await page.evaluate(() => (window as Window & { __PROGRAM_ACTIONS__?: RecordedCall[] }).__PROGRAM_ACTIONS__))?.at(-1)).toEqual({
        action: 'create-workout',
        fields: {
          templateId: '11111111-1111-4111-8111-111111111111',
          name: 'Día C',
          dayOfWeek: '5',
          orderInPlan: '3',
        },
      })
    } finally { await page.close() }
  })

  it('shows one active day and switches panels with tab semantics', async () => {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } })
    try {
      await page.goto(`${baseUrl}/src/components/coaching/__tests__/fixtures/programTemplateEditorInteraction.html`)
      await pwExpect(page.getByRole('tab', { name: /Día A/ })).toHaveAttribute('aria-selected', 'true')
      await pwExpect(page.getByRole('tabpanel', { name: /Día A/ })).toBeVisible()
      await page.getByRole('tab', { name: /Día B/ }).click()
      await pwExpect(page.getByRole('tabpanel', { name: /Día B/ })).toBeVisible()
      await pwExpect(page.getByRole('tabpanel', { name: /Día A/ })).toHaveCount(0)
    } finally { await page.close() }
  })

  it('keeps a failed multi-selection and retries the same batch', async () => {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } })
    try {
      await page.goto(`${baseUrl}/src/components/coaching/__tests__/fixtures/programTemplateEditorInteraction.html?batch=retry`)
      await page.getByRole('button', { name: 'Agregar varios ejercicios' }).click()
      const dialog = page.getByRole('dialog', { name: 'Agregar ejercicios' })
      await dialog.getByRole('button', { name: /Prensa/ }).click()
      await dialog.getByRole('button', { name: /Gemelos/ }).click()
      await pwExpect(dialog.getByText('Valores iniciales: 3 × 10 · RPE 7 · 60 s')).toBeVisible()
      await dialog.getByRole('button', { name: 'Agregar 2 ejercicios' }).click()
      await pwExpect(dialog).toBeVisible()
      await pwExpect(dialog.getByRole('alert')).toContainText('No se pudieron agregar los ejercicios.')
      await dialog.getByRole('button', { name: 'Agregar 2 ejercicios' }).click()
      await pwExpect(dialog).toBeHidden()
      const calls = await page.evaluate(() => (window as Window & { __PROGRAM_ACTIONS__?: RecordedCall[] }).__PROGRAM_ACTIONS__ ?? [])
      const batches = calls.filter(call => call.action === 'add-exercises')
      expect(batches).toHaveLength(2)
      expect(batches[0].fields.exerciseId).toEqual(['66666666-6666-4666-8666-666666666666', '77777777-7777-4777-8777-777777777777'])
      expect(batches[1].fields.exerciseId).toEqual(batches[0].fields.exerciseId)
    } finally { await page.close() }
  })

  it('submits two consecutive batches without an order field', async () => {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } })
    try {
      await page.goto(`${baseUrl}/src/components/coaching/__tests__/fixtures/programTemplateEditorInteraction.html`)
      for (const exerciseName of ['Prensa', 'Gemelos']) {
        await page.getByRole('button', { name: 'Agregar varios ejercicios' }).click()
        const dialog = page.getByRole('dialog', { name: 'Agregar ejercicios' })
        await dialog.getByRole('button', { name: new RegExp(exerciseName) }).click()
        await dialog.getByRole('button', { name: 'Agregar 1 ejercicio' }).click()
        await pwExpect(dialog).toBeHidden()
      }
      const calls = await page.evaluate(() => (window as Window & { __PROGRAM_ACTIONS__?: RecordedCall[] }).__PROGRAM_ACTIONS__ ?? [])
      const batches = calls.filter(call => call.action === 'add-exercises')
      expect(batches).toHaveLength(2)
      expect(batches.every(call => call.fields.orderIndex === undefined)).toBe(true)
    } finally { await page.close() }
  })

  it('keeps the confirmed order when a structural reorder fails', async () => {
    const page = await browser.newPage()
    try {
      await page.goto(`${baseUrl}/src/components/coaching/__tests__/fixtures/programTemplateEditorInteraction.html?reorder=error`)
      const before = await page.locator('[data-template-exercise-id]').evaluateAll(nodes => nodes.map(node => node.getAttribute('data-template-exercise-id')))
      await page.getByRole('button', { name: 'Bajar Sentadilla' }).click()
      await pwExpect(page.getByRole('status')).toContainText('No se pudo actualizar el orden.')
      const after = await page.locator('[data-template-exercise-id]').evaluateAll(nodes => nodes.map(node => node.getAttribute('data-template-exercise-id')))
      expect(after).toEqual(before)
    } finally { await page.close() }
  })

  it('keeps structural order out of descriptive and prescription forms', async () => {
    const page = await browser.newPage()
    try {
      await page.goto(`${baseUrl}/src/components/coaching/__tests__/fixtures/programTemplateEditorInteraction.html`)
      await page.getByText('Editar día', { exact: true }).click()
      const workout = page.getByRole('group', { name: 'Editar día Día A' })
      await workout.getByRole('button', { name: 'Guardar día' }).click()
      await page.getByRole('button', { name: 'Editar Sentadilla' }).click()
      const exercise = page.getByRole('group', { name: 'Editar ejercicio Sentadilla' })
      await exercise.getByRole('button', { name: 'Guardar ejercicio' }).click()
      await page.waitForFunction(() => ((window as Window & { __PROGRAM_ACTIONS__?: RecordedCall[] }).__PROGRAM_ACTIONS__ ?? []).filter(call => call.action.startsWith('update-')).length === 2)

      const calls = await page.evaluate(() => (window as Window & { __PROGRAM_ACTIONS__?: RecordedCall[] }).__PROGRAM_ACTIONS__ ?? [])
      expect(calls).toEqual([
        { action: 'update-workout', fields: { templateWorkoutId: '22222222-2222-4222-8222-222222222222', name: 'Día A', dayOfWeek: '1' } },
        { action: 'update-exercise', fields: { templateExerciseId: '33333333-3333-4333-8333-333333333333', exerciseId: '44444444-4444-4444-8444-444444444444', sets: '3', reps: '10', weightKg: '', targetRpe: '7', restSeconds: '60', notes: '' } },
      ])
    } finally { await page.close() }
  })
})
