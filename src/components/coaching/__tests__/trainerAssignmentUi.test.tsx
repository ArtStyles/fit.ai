import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { chromium, type Browser } from '@playwright/test'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

describe('trainer assignment UI contracts', () => {
  it('wires a client-selected relationship to the proposal action without exposing activation controls', async () => {
    const source = await import('node:fs/promises').then(fs => fs.readFile(new URL('../AssignProgramDialog.tsx', import.meta.url), 'utf8'))
    expect(source).toContain("import('@/app/actions/trainerAssignments')")
    expect(source).toContain('proposeTrainerAssignment')
    expect(source).toContain('name="relationshipId"')
    expect(source).toContain('relationship.label')
    expect(source).toContain('idempotencyKey')
    expect(source).not.toContain('acceptTrainerAssignment')
  })

  it('keeps multiple active relationships distinguishable without showing client contact data', async () => {
    const source = await import('node:fs/promises').then(fs => fs.readFile(new URL('../../../app/(app)/coach/programs/[templateId]/page.tsx', import.meta.url), 'utf8'))
    expect(source).toContain('trainer_service_offerings(name)')
    expect(source).toContain('started_at')
    expect(source).toContain('id.slice(0, 8)')
    expect(source).not.toContain('contact_email')
    expect(source).not.toContain('contact_phone')
  })

  it('renders the proposed prescription as read-only review data with a retry-stable acceptance key', async () => {
    const source = await import('node:fs/promises').then(fs => fs.readFile(new URL('../ProposedProgramReview.tsx', import.meta.url), 'utf8'))
    expect(source).toContain('prescripción se mantiene bloqueada')
    expect(source).toContain('versionNumber')
    expect(source).not.toContain('<input')
    expect(source).toContain('Aceptar rutina')
    expect(source).toContain('useRef<string | null>')
    expect(source).toContain('acceptanceKeyRef.current')
  })
})

describe('trainer assignment browser interaction', () => {
  let browser: Browser
  let viteServer: { listen: () => Promise<void>; close: () => Promise<void>; httpServer: { address: () => string | { port: number } | null } }
  let baseUrl = ''

  beforeAll(async () => {
    const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..')
    const viteEntry = path.join(repoRoot, 'node_modules/.pnpm/node_modules/vite/dist/node/index.js')
    const { createServer } = await import(pathToFileURL(viteEntry).href)
    viteServer = await createServer({ configFile: false, root: repoRoot, appType: 'spa', cacheDir: path.join(repoRoot, 'node_modules', '.vite-trainer-assignment-test'), oxc: { jsx: { runtime: 'automatic' } }, resolve: { alias: [
      { find: '@/app/actions/trainerAssignments', replacement: path.join(repoRoot, 'src/components/coaching/__tests__/fixtures/trainerAssignments.fixture.ts') },
      { find: 'next/navigation', replacement: path.join(repoRoot, 'src/components/coaching/__tests__/fixtures/nextNavigation.fixture.ts') },
      { find: '@', replacement: path.join(repoRoot, 'src') },
    ] }, server: { host: '127.0.0.1', port: 0, strictPort: false, hmr: false } })
    await viteServer.listen()
    const address = viteServer.httpServer.address()
    if (!address || typeof address === 'string') throw new Error('Vite trainer assignment fixture did not bind a TCP port.')
    baseUrl = `http://127.0.0.1:${address.port}`
    browser = await chromium.launch({ headless: true })
  }, 30_000)

  afterAll(async () => { await browser?.close(); await viteServer?.close() })

  it('sends the selected distinguishable relationship id to the proposal action', async () => {
    const page = await browser.newPage()
    try {
      await page.goto(`${baseUrl}/src/components/coaching/__tests__/fixtures/assignProgramDialogInteraction.html`)
      await page.waitForFunction(() => Boolean((window as Window & { __ASSIGN_DIALOG_READY__?: boolean }).__ASSIGN_DIALOG_READY__))
      await page.getByRole('button', { name: 'Enviar a un cliente' }).click()
      await page.getByRole('combobox').selectOption('22222222-2222-4222-8222-222222222222')
      await page.getByRole('button', { name: 'Enviar propuesta bloqueada' }).click()
      await page.waitForFunction(() => Boolean((window as Window & { __ASSIGNMENT_ACTIONS__?: unknown[] }).__ASSIGNMENT_ACTIONS__?.length))
      expect(await page.evaluate(() => (window as Window & { __ASSIGNMENT_ACTIONS__?: Array<Record<string, string>> }).__ASSIGNMENT_ACTIONS__)).toEqual([
        expect.objectContaining({ relationshipId: '22222222-2222-4222-8222-222222222222', templateId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' }),
      ])
    } finally { await page.close() }
  }, 15_000)
})
