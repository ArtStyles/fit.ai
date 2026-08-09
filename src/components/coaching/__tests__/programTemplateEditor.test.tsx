import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { chromium, type Browser } from '@playwright/test'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

describe('professional template editor contract', () => {
  it('keeps the editor surface explicitly separate from personal plan actions', async () => {
    const source = await import('node:fs/promises').then(fs => fs.readFile(new URL('../ProgramTemplateEditor.tsx', import.meta.url), 'utf8'))
    expect(source).toContain('Las ediciones de esta plantilla no cambian asignaciones ya publicadas')
    expect(source).not.toContain("@/app/actions/plan")
    expect(source).not.toContain('workout_plans')
  })
})

describe('professional template editor browser interactions', () => {
  let browser: Browser
  let viteServer: { listen: () => Promise<void>; close: () => Promise<void>; httpServer: { address: () => string | { port: number } | null } }
  let baseUrl = ''

  beforeAll(async () => {
    const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..')
    const viteEntry = path.join(repoRoot, 'node_modules/.pnpm/node_modules/vite/dist/node/index.js')
    const { createServer } = await import(pathToFileURL(viteEntry).href)
    viteServer = await createServer({ configFile: false, root: repoRoot, appType: 'spa', cacheDir: path.join(repoRoot, 'node_modules', '.vite-program-template-test'), oxc: { jsx: { runtime: 'automatic' } }, resolve: { alias: [
      { find: '@/app/actions/trainerPrograms', replacement: path.join(repoRoot, 'src/components/coaching/__tests__/fixtures/trainerPrograms.fixture.ts') },
      { find: 'next/navigation', replacement: path.join(repoRoot, 'src/components/coaching/__tests__/fixtures/nextNavigation.fixture.ts') },
      { find: '@', replacement: path.join(repoRoot, 'src') },
    ] }, server: { host: '127.0.0.1', port: 0, strictPort: false, hmr: false } })
    await viteServer.listen()
    const address = viteServer.httpServer.address()
    if (!address || typeof address === 'string') throw new Error('Vite template editor fixture did not bind a TCP port.')
    baseUrl = `http://127.0.0.1:${address.port}`
    browser = await chromium.launch({ headless: true })
  }, 30_000)

  afterAll(async () => { await browser?.close(); await viteServer?.close() })

  it('recovers controls after a save error and executes add and atomic reorder actions in a real browser', async () => {
    const page = await browser.newPage()
    try {
      await page.goto(`${baseUrl}/src/components/coaching/__tests__/fixtures/programTemplateEditorInteraction.html?save=error`)
      await page.waitForFunction(() => Boolean((window as Window & { __PROGRAM_EDITOR_READY__?: boolean }).__PROGRAM_EDITOR_READY__))
      await page.getByRole('button', { name: 'Guardar plantilla' }).click()
      await page.waitForFunction(() => Array.from(document.querySelectorAll('[role="status"]')).some(node => node.textContent?.includes('No se pudo guardar la rutina.')))
      await page.waitForFunction(() => !(document.querySelector('button[type="submit"]') as HTMLButtonElement | null)?.disabled)
      await page.getByRole('button', { name: 'Bajar Sentadilla' }).click()
      await page.waitForFunction(() => Array.from(document.querySelectorAll('[role="status"]')).some(node => node.textContent?.includes('Orden actualizado.')))
      await page.locator('form').filter({ hasText: 'Ejercicio' }).locator('button').filter({ hasText: 'Sentadilla' }).click()
      await page.getByRole('button', { name: 'Agregar ejercicio' }).click()
      await page.waitForFunction(() => Array.from(document.querySelectorAll('[role="status"]')).some(node => node.textContent?.includes('Ejercicio agregado.')))
      expect(await page.evaluate(() => (window as Window & { __PROGRAM_REFRESHES__?: number }).__PROGRAM_REFRESHES__)).toBeGreaterThanOrEqual(2)
    } finally { await page.close() }
  }, 15_000)
})
