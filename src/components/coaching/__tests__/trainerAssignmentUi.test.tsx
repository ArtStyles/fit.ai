import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { chromium, expect as pwExpect, type Browser } from '@playwright/test'
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

  it('renders the proposed prescription without editable prescription fields and keeps retry-stable mutation keys', async () => {
    const source = await import('node:fs/promises').then(fs => fs.readFile(new URL('../ProposedProgramReview.tsx', import.meta.url), 'utf8'))
    expect(source).toContain('prescripción se mantiene bloqueada')
    expect(source).toContain('versionNumber')
    expect(source).not.toContain('name="sets"')
    expect(source).not.toContain('name="reps"')
    expect(source).not.toContain('name="weightKg"')
    expect(source).toContain('Aceptar rutina')
    expect(source).toContain('No aceptar rutina')
    expect(source).toContain('useRef<string | null>')
    expect(source).toContain('acceptanceKeyRef.current')
    expect(source).toContain('declineKeyRef.current')
  })

  it('shows the trainer message and labels prescription notes before the client accepts', async () => {
    const source = await import('node:fs/promises').then(fs => fs.readFile(new URL('../ProposedProgramReview.tsx', import.meta.url), 'utf8'))

    expect(source).toContain('changeSummary')
    expect(source).toContain('Mensaje del entrenador')
    expect(source).toContain('Indicación del entrenador')
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

  it('disables blocked recipients with visible reasons and submits only the ready recipient', async () => {
    const page = await browser.newPage()
    try {
      await page.goto(`${baseUrl}/src/components/coaching/__tests__/fixtures/assignProgramDialogInteraction.html`)
      await page.waitForFunction(() => Boolean((window as Window & { __ASSIGN_DIALOG_READY__?: boolean }).__ASSIGN_DIALOG_READY__))
      await page.getByRole('button', { name: 'Enviar a un cliente' }).click()
      const readyRecipient = page.getByRole('radio', { name: /Ana Lista/ })
      const proposedRecipient = page.getByRole('radio', { name: /Luis Pendiente/ })
      const activeRecipient = page.getByRole('radio', { name: /Eva Activa/ })

      await pwExpect(readyRecipient).toBeEnabled()
      await pwExpect(readyRecipient).toBeChecked()
      await pwExpect(proposedRecipient).toBeDisabled()
      await pwExpect(activeRecipient).toBeDisabled()
      await pwExpect(page.getByText('El cliente ya tiene una propuesta pendiente de revisión.')).toBeVisible()
      await pwExpect(page.getByText('El cliente ya tiene una rutina profesional activa.')).toBeVisible()

      const submit = page.getByRole('button', { name: 'Enviar propuesta bloqueada' })
      await pwExpect(submit).toBeEnabled()
      await submit.click()
      await page.waitForFunction(() => Boolean((window as Window & { __ASSIGNMENT_ACTIONS__?: unknown[] }).__ASSIGNMENT_ACTIONS__?.length))
      expect(await page.evaluate(() => (window as Window & { __ASSIGNMENT_ACTIONS__?: Array<Record<string, string>> }).__ASSIGNMENT_ACTIONS__)).toEqual([
        expect.objectContaining({ relationshipId: '11111111-1111-4111-8111-111111111111', templateId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' }),
      ])
    } finally { await page.close() }
  }, 15_000)

  it('explains both prerequisites when there are no eligible relationships', async () => {
    const page = await browser.newPage()
    try {
      await page.goto(`${baseUrl}/src/components/coaching/__tests__/fixtures/assignProgramDialogInteraction.html?empty=1`)

      await pwExpect(page.getByText('Necesitas un acompañamiento activo y una autorización de datos de entrenamiento vigente para enviar esta rutina.')).toBeVisible()
      await pwExpect(page.getByRole('button', { name: 'Enviar a un cliente' })).toHaveCount(0)
    } finally { await page.close() }
  }, 15_000)

  it('keeps proposal context visible and confirmation cancel prevents a decline dispatch', async () => {
    const page = await browser.newPage()
    try {
      await page.goto(`${baseUrl}/src/components/coaching/__tests__/fixtures/proposedProgramReviewInteraction.html`)
      await page.getByRole('heading', { name: 'Rutina inicial' }).waitFor()
      await pwExpect(page.getByText('Prioriza la tecnica antes que el peso.')).toBeVisible()
      await pwExpect(page.getByText('Mantener el tronco estable.')).toBeVisible()
      await page.getByLabel('Motivo opcional').fill('Necesito menos dias.')
      page.once('dialog', dialog => dialog.dismiss())
      await page.getByRole('button', { name: 'No aceptar rutina' }).click()
      expect(await page.evaluate(() => (window as Window & { __DECLINE_ASSIGNMENT_ACTIONS__?: unknown[] }).__DECLINE_ASSIGNMENT_ACTIONS__ ?? [])).toEqual([])
      await pwExpect(page.getByRole('button', { name: 'Aceptar rutina', exact: true })).toBeEnabled()
    } finally { await page.close() }
  }, 15_000)

  it('prevents accepting an ended-relationship proposal while keeping decline available', async () => {
    const page = await browser.newPage()
    page.on('dialog', dialog => dialog.accept())
    try {
      await page.goto(`${baseUrl}/src/components/coaching/__tests__/fixtures/proposedProgramReviewInteraction.html?canAccept=false`)
      await page.getByRole('heading', { name: 'Rutina inicial' }).waitFor()

      await pwExpect(page.getByText('Este acompañamiento ya no está activo.')).toBeVisible()
      await pwExpect(page.getByRole('button', { name: 'Aceptar rutina', exact: true })).toHaveCount(0)
      await pwExpect(page.getByRole('button', { name: 'No aceptar rutina' })).toBeEnabled()

      await page.getByRole('button', { name: 'No aceptar rutina' }).click()
      await pwExpect(page.getByRole('status')).toContainText('Rutina no aceptada')
      expect(await page.evaluate(() => (window as Window & { __DECLINE_ASSIGNMENT_ACTIONS__?: unknown[] }).__DECLINE_ASSIGNMENT_ACTIONS__ ?? [])).toHaveLength(1)
      expect(await page.evaluate(() => (window as Window & { __ACCEPT_ASSIGNMENT_ACTIONS__?: unknown[] }).__ACCEPT_ASSIGNMENT_ACTIONS__ ?? [])).toEqual([])
    } finally { await page.close() }
  }, 15_000)

  it('keeps an incomplete proposal visible and rejectable without offering acceptance', async () => {
    const page = await browser.newPage()
    page.on('dialog', dialog => dialog.accept())
    try {
      await page.goto(`${baseUrl}/src/components/coaching/__tests__/fixtures/proposedProgramReviewInteraction.html?exerciseDetails=unavailable`)
      await page.getByRole('heading', { name: 'Rutina inicial' }).waitFor()

      await pwExpect(page.getByRole('alert')).toContainText('No se pudieron cargar todos los detalles de los ejercicios.')
      await pwExpect(page.getByRole('button', { name: 'Aceptar rutina', exact: true })).toHaveCount(0)
      await pwExpect(page.getByRole('button', { name: 'No aceptar rutina' })).toBeEnabled()

      await page.getByRole('button', { name: 'No aceptar rutina' }).click()
      await pwExpect(page.getByRole('status')).toContainText('Rutina no aceptada')
    } finally { await page.close() }
  }, 15_000)

  it('resets terminal form state when refresh reveals an earlier proposal', async () => {
    const page = await browser.newPage()
    page.on('dialog', dialog => dialog.accept())
    try {
      await page.goto(`${baseUrl}/src/components/coaching/__tests__/fixtures/proposedProgramReviewInteraction.html?nextProposal=1`)
      await page.getByRole('heading', { name: 'Rutina inicial' }).waitFor()
      await page.getByLabel('Motivo opcional').fill('Prefiero revisar la anterior.')

      await page.getByRole('button', { name: 'No aceptar rutina' }).click()

      await page.getByRole('heading', { name: 'Rutina anterior pendiente' }).waitFor()
      await pwExpect(page.getByLabel('Motivo opcional')).toHaveValue('')
      await pwExpect(page.getByRole('button', { name: 'Aceptar rutina', exact: true })).toBeEnabled()
      await pwExpect(page.getByRole('button', { name: 'No aceptar rutina' })).toBeEnabled()
      await pwExpect(page.getByText('Rutina no aceptada. Actualizando propuestas…')).toHaveCount(0)
    } finally { await page.close() }
  }, 15_000)

  it('reuses the decline key after a recoverable error and reports terminal success visibly', async () => {
    const page = await browser.newPage()
    page.on('dialog', dialog => dialog.accept())
    try {
      await page.goto(`${baseUrl}/src/components/coaching/__tests__/fixtures/proposedProgramReviewInteraction.html?decline=error-once`)
      await page.getByLabel('Motivo opcional').fill('  Necesito menos dias.  ')
      await page.getByRole('button', { name: 'No aceptar rutina' }).click()
      await pwExpect(page.getByRole('alert')).toHaveText('La propuesta ya no esta disponible.')
      await page.getByRole('button', { name: 'No aceptar rutina' }).click()
      await pwExpect(page.getByRole('status')).toContainText('Rutina no aceptada')

      const calls = await page.evaluate(() => (window as Window & { __DECLINE_ASSIGNMENT_ACTIONS__?: Array<Record<string, string>> }).__DECLINE_ASSIGNMENT_ACTIONS__)
      expect(calls).toHaveLength(2)
      expect(calls?.[0]).toMatchObject({
        assignmentId: '11111111-1111-4111-8111-111111111111',
        reason: '  Necesito menos dias.  ',
        idempotencyKey: expect.any(String),
      })
      expect(calls?.[1]?.idempotencyKey).toBe(calls?.[0]?.idempotencyKey)
      await pwExpect(page.getByRole('button', { name: 'Aceptar rutina', exact: true })).toBeDisabled()
      await pwExpect(page.getByRole('button', { name: /Rutina no aceptada/ })).toBeDisabled()
    } finally { await page.close() }
  }, 15_000)

  it('uses one mutation lock so accept and decline cannot dispatch together', async () => {
    const declinePage = await browser.newPage()
    declinePage.on('dialog', dialog => dialog.accept())
    const acceptPage = await browser.newPage()
    acceptPage.on('dialog', dialog => dialog.accept())
    try {
      await declinePage.goto(`${baseUrl}/src/components/coaching/__tests__/fixtures/proposedProgramReviewInteraction.html?decline=pending`)
      await declinePage.getByRole('button', { name: 'No aceptar rutina' }).click()
      await pwExpect(declinePage.getByRole('button', { name: /No aceptando/ })).toBeDisabled()
      await pwExpect(declinePage.getByRole('button', { name: 'Aceptar rutina', exact: true })).toBeDisabled()
      expect(await declinePage.evaluate(() => (window as Window & { __ACCEPT_ASSIGNMENT_ACTIONS__?: unknown[] }).__ACCEPT_ASSIGNMENT_ACTIONS__ ?? [])).toEqual([])
      await declinePage.evaluate(() => (window as Window & { __RESOLVE_DECLINE_ASSIGNMENT__?: (value: unknown) => void }).__RESOLVE_DECLINE_ASSIGNMENT__?.({
        ok: true,
        assignmentId: '11111111-1111-4111-8111-111111111111',
        changed: true,
      }))
      await pwExpect(declinePage.getByRole('status')).toContainText('Rutina no aceptada')

      await acceptPage.goto(`${baseUrl}/src/components/coaching/__tests__/fixtures/proposedProgramReviewInteraction.html?accept=pending`)
      await acceptPage.getByRole('button', { name: 'Aceptar rutina', exact: true }).click()
      await pwExpect(acceptPage.getByRole('button', { name: /Activando/ })).toBeDisabled()
      await pwExpect(acceptPage.getByRole('button', { name: 'No aceptar rutina' })).toBeDisabled()
      expect(await acceptPage.evaluate(() => (window as Window & { __DECLINE_ASSIGNMENT_ACTIONS__?: unknown[] }).__DECLINE_ASSIGNMENT_ACTIONS__ ?? [])).toEqual([])
    } finally {
      await declinePage.close()
      await acceptPage.close()
    }
  }, 15_000)
})
