import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { chromium, expect as pwExpect, type Browser } from '@playwright/test'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import {
  auditCriticalAndSeriousAccessibility,
  expectActionTargetsAtLeast44,
  expectReducedMotionAndSafeArea,
  expectResponsiveGeometry,
  runAllCleanupSteps,
} from '../../../../tests/e2e/helpers/acceptance'

const SURFACES = ['application', 'requests', 'editor', 'assignment', 'timeline', 'proposal', 'workspace', 'public-profile', 'directory', 'catalog', 'active-dock'] as const
const VIEWPORTS = [
  { width: 375, height: 812 },
  { width: 768, height: 1024 },
  { width: 1024, height: 768 },
  { width: 1440, height: 900 },
] as const

describe('trainer accessibility acceptance in a local browser', () => {
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
      cacheDir: path.join(repoRoot, 'node_modules', '.vite-trainer-accessibility-test'),
      oxc: { jsx: { runtime: 'automatic' } },
      optimizeDeps: {
        include: [
          'react',
          'react-dom',
          'react-dom/client',
          'lucide-react',
          '@radix-ui/react-avatar',
          '@radix-ui/react-dialog',
          '@radix-ui/react-select',
        ],
      },
      resolve: { dedupe: ['react', 'react-dom'], alias: [
        { find: '@/app/actions/trainerApplications', replacement: path.join(repoRoot, 'src/components/coaching/__tests__/fixtures/trainerApplications.fixture.ts') },
        { find: '@/app/actions/trainerPrograms', replacement: path.join(repoRoot, 'src/components/coaching/__tests__/fixtures/trainerPrograms.fixture.ts') },
        { find: '@/app/actions/trainerAssignments', replacement: path.join(repoRoot, 'src/components/coaching/__tests__/fixtures/trainerAssignments.fixture.ts') },
        { find: '@/app/actions/coachingRequests', replacement: path.join(repoRoot, 'src/components/coaching/__tests__/fixtures/coachingRequestActions.fixture.ts') },
        { find: '@/app/actions/workspace', replacement: path.join(repoRoot, 'src/components/coaching/__tests__/fixtures/workspace.fixture.ts') },
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
    if (!address || typeof address === 'string') throw new Error('Trainer accessibility fixture did not bind a TCP port.')
    baseUrl = `http://127.0.0.1:${address.port}`
    browser = await chromium.launch({ headless: true })
  }, 30_000)

  afterAll(async () => {
    await browser?.close()
    await viteServer?.close()
  }, 30_000)

  it.each(SURFACES)('%s has no critical/serious Axe findings', async surface => {
    const context = await browser.newContext({ viewport: { width: 1024, height: 768 } })
    const page = await context.newPage()
    try {
      await page.goto(`${baseUrl}/src/components/coaching/__tests__/fixtures/trainerAccessibility.html?surface=${surface}`)
      await page.waitForFunction(() => Boolean((window as Window & { __TRAINER_ACCESSIBILITY_READY__?: boolean }).__TRAINER_ACCESSIBILITY_READY__))
      if (surface === 'editor') {
        await page.getByText('Editar entrenamiento', { exact: true }).click()
        await page.getByText('Editar ejercicio', { exact: true }).click()
      }
      if (surface === 'assignment') {
        await page.locator('button[aria-controls="assign-program-form"]').click()
      }
      await auditCriticalAndSeriousAccessibility(page)
    } finally {
      await context.close()
    }
  }, 15_000)

  it.each(VIEWPORTS)('keeps trainer controls and wide content contained at $width px', async viewport => {
    const context = await browser.newContext({ viewport })
    const page = await context.newPage()
    try {
      for (const surface of SURFACES) {
        await page.goto(`${baseUrl}/src/components/coaching/__tests__/fixtures/trainerAccessibility.html?surface=${surface}`)
        await page.waitForFunction(() => Boolean((window as Window & { __TRAINER_ACCESSIBILITY_READY__?: boolean }).__TRAINER_ACCESSIBILITY_READY__))
        if (surface === 'editor') {
          await page.getByText('Editar entrenamiento', { exact: true }).click()
          await page.getByText('Editar ejercicio', { exact: true }).click()
          await pwExpect(page.getByRole('button', { name: 'Guardar ejercicio' })).toBeVisible()
        }
        if (surface === 'assignment') {
          await page.locator('button[aria-controls="assign-program-form"]').click()
          await pwExpect(page.getByLabel(/Cliente del acompa/)).toBeVisible()
        }
        await expectResponsiveGeometry(page)
        await expectActionTargetsAtLeast44(page)
      }
    } finally {
      await context.close()
    }
  }, 30_000)

  it('associates validation errors and focuses the first invalid application field', async () => {
    const context = await browser.newContext({ viewport: { width: 375, height: 812 } })
    const page = await context.newPage()
    try {
      await page.goto(`${baseUrl}/src/components/coaching/__tests__/fixtures/trainerAccessibility.html?surface=application`)
      await page.getByRole('button', { name: 'Revisar y enviar' }).click()
      const professionalName = page.getByLabel('Nombre profesional')
      await pwExpect(professionalName).toBeFocused()
      await pwExpect(professionalName).toHaveAttribute('aria-invalid', 'true')
      const describedBy = await professionalName.getAttribute('aria-describedby')
      expect(describedBy).toMatch(/professionalName-error/)
      await pwExpect(page.locator('#professionalName-error')).toBeVisible()
    } finally {
      await context.close()
    }
  }, 15_000)

  it('moves focus to the public profile heading after route navigation', async () => {
    const context = await browser.newContext({ viewport: { width: 1024, height: 768 } })
    const page = await context.newPage()
    try {
      await page.goto(`${baseUrl}/src/components/coaching/__tests__/fixtures/trainerAccessibility.html?surface=public-profile`)
      await page.waitForFunction(() => Boolean((window as Window & { __TRAINER_ACCESSIBILITY_READY__?: boolean }).__TRAINER_ACCESSIBILITY_READY__))
      await pwExpect(page.getByRole('heading', { level: 1, name: 'Ada Entrenadora' })).toBeFocused()
    } finally {
      await context.close()
    }
  }, 15_000)

  it('clears trainer filters immediately and avoids native full-screen selectors', async () => {
    const context = await browser.newContext({ viewport: { width: 375, height: 812 } })
    const page = await context.newPage()
    try {
      await page.goto(`${baseUrl}/src/components/coaching/__tests__/fixtures/trainerAccessibility.html?surface=directory&filtered=1`)
      await page.waitForFunction(() => Boolean((window as Window & { __TRAINER_ACCESSIBILITY_READY__?: boolean }).__TRAINER_ACCESSIBILITY_READY__))
      await pwExpect(page.getByRole('searchbox', { name: 'Buscar entrenadores' })).toHaveValue('fuerza')
      await pwExpect(page.locator('select[name="modalidad"]')).toHaveCount(0)
      await pwExpect(page.getByRole('combobox', { name: 'Modalidad' })).toContainText('En línea')

      await page.getByRole('link', { name: 'Limpiar filtros' }).first().click()
      await pwExpect(page.getByRole('searchbox', { name: 'Buscar entrenadores' })).toHaveValue('')
      await page.getByText('Filtros avanzados', { exact: true }).click()
      await pwExpect(page.getByRole('combobox', { name: 'Modalidad' })).toContainText('Todas')
    } finally {
      await context.close()
    }
  }, 15_000)

  it('supports keyboard disclosure, focus order, native confirmation, and async announcements', async () => {
    const context = await browser.newContext({ viewport: { width: 768, height: 1024 } })
    const page = await context.newPage()
    try {
      await page.goto(`${baseUrl}/src/components/coaching/__tests__/fixtures/trainerAccessibility.html?surface=assignment`)
      await page.waitForFunction(() => Boolean((window as Window & { __TRAINER_ACCESSIBILITY_READY__?: boolean }).__TRAINER_ACCESSIBILITY_READY__))
      const disclosure = page.locator('button[aria-controls="assign-program-form"]')
      await pwExpect(disclosure).toHaveAccessibleName('Enviar a un cliente')
      await disclosure.focus()
      await page.keyboard.press('Enter')
      await pwExpect(disclosure).toHaveAttribute('aria-expanded', 'true')
      await page.keyboard.press('Tab')
      await pwExpect(page.getByLabel(/Cliente del acompa/)).toBeFocused()
      await page.keyboard.press('Tab')
      await pwExpect(page.getByLabel(/Resumen para el cliente/)).toBeFocused()

      await page.goto(`${baseUrl}/src/components/coaching/__tests__/fixtures/trainerAccessibility.html?surface=requests`)
      await page.waitForFunction(() => Boolean((window as Window & { __TRAINER_ACCESSIBILITY_READY__?: boolean }).__TRAINER_ACCESSIBILITY_READY__))
      const accept = page.getByRole('button', { name: 'Aceptar' })
      let confirmationSeen = false
      page.once('dialog', async dialog => {
        confirmationSeen = dialog.type() === 'confirm'
        await dialog.accept()
      })
      await accept.focus()
      await page.keyboard.press('Enter')
      await page.getByText('La solicitud fue aceptada.').waitFor({ state: 'visible' })
      expect(confirmationSeen).toBe(true)
      await pwExpect(page.locator('[aria-live="polite"]')).toContainText('La solicitud fue aceptada.')
    } finally {
      await context.close()
    }
  }, 15_000)

  it('honors reduced motion and Capacitor safe-area variables', async () => {
    const context = await browser.newContext({ viewport: { width: 375, height: 812 }, reducedMotion: 'reduce' })
    const page = await context.newPage()
    try {
      await page.goto(`${baseUrl}/src/components/coaching/__tests__/fixtures/trainerAccessibility.html?surface=editor`)
      await expectReducedMotionAndSafeArea(page)
    } finally {
      await context.close()
    }
  }, 15_000)

  it('rejects clipped descendant overflow even when the root hides horizontal overflow', async () => {
    const context = await browser.newContext({ viewport: { width: 375, height: 812 } })
    const page = await context.newPage()
    try {
      await page.goto(`${baseUrl}/src/components/coaching/__tests__/fixtures/trainerAccessibility.html?surface=workspace`)
      await page.waitForFunction(() => Boolean((window as Window & { __TRAINER_ACCESSIBILITY_READY__?: boolean }).__TRAINER_ACCESSIBILITY_READY__))
      await page.locator('main').evaluate(main => {
        const clipped = document.createElement('div')
        clipped.dataset.overflowSentinel = 'true'
        clipped.style.width = '2000px'
        clipped.textContent = 'Contenido recortado'
        main.append(clipped)
      })

      await expect(expectResponsiveGeometry(page)).rejects.toThrow(/exceeds|escapes/)
    } finally {
      await context.close()
    }
  }, 15_000)

  it('attempts every exact cleanup step when an earlier deletion fails', async () => {
    const calls: string[] = []
    await expect(runAllCleanupSteps([
      async () => {
        calls.push('template')
        throw new Error('template cleanup failed')
      },
      async () => {
        calls.push('relationships')
      },
    ])).rejects.toThrow('template cleanup failed')
    expect(calls).toEqual(['template', 'relationships'])
  })
})
