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
const EDITOR_MOBILE_VIEWPORTS = [320, 360, 390, 430, 450] as const
const EDITOR_AXE_CASES = [
  { theme: 'dark', editorState: 'metadata editor' },
  { theme: 'dark', editorState: 'batch dialog' },
  { theme: 'light', editorState: 'metadata editor' },
  { theme: 'light', editorState: 'batch dialog' },
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
      if (surface === 'assignment') {
        await page.locator('button[aria-controls="assign-program-form"]').click()
      }
      await auditCriticalAndSeriousAccessibility(page)
    } finally {
      await context.close()
    }
  }, 30_000)

  it.each(EDITOR_AXE_CASES)('editor with $editorState open in $theme theme has no critical/serious Axe findings', async ({ theme, editorState }) => {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } })
    const page = await context.newPage()
    try {
      await page.goto(`${baseUrl}/src/components/coaching/__tests__/fixtures/trainerAccessibility.html?surface=editor`)
      await page.waitForFunction(() => Boolean((window as Window & { __TRAINER_ACCESSIBILITY_READY__?: boolean }).__TRAINER_ACCESSIBILITY_READY__))
      await page.evaluate(currentTheme => {
        document.documentElement.classList.toggle('dark', currentTheme === 'dark')
      }, theme)
      if (editorState === 'metadata editor') {
        const metadata = page.getByText('Editar información', { exact: true })
        await metadata.click()
        await pwExpect(page.getByLabel('Nombre de la rutina')).toBeVisible()
      } else {
        await page.getByRole('button', { name: 'Agregar varios ejercicios' }).click()
        await pwExpect(page.getByRole('dialog', { name: 'Agregar ejercicios' })).toBeVisible()
      }
      await auditCriticalAndSeriousAccessibility(page)
    } finally {
      await context.close()
    }
  }, 30_000)

  it.each(EDITOR_MOBILE_VIEWPORTS)('contains the active-day editor and readable metrics at %i px', async width => {
    const context = await browser.newContext({ viewport: { width, height: 844 } })
    const page = await context.newPage()
    try {
      await page.goto(`${baseUrl}/src/components/coaching/__tests__/fixtures/trainerAccessibility.html?surface=editor`)
      await page.waitForFunction(() => Boolean((window as Window & { __TRAINER_ACCESSIBILITY_READY__?: boolean }).__TRAINER_ACCESSIBILITY_READY__))
      await expectResponsiveGeometry(page)
      await expectActionTargetsAtLeast44(page)
      await pwExpect(page.getByRole('tablist', { name: 'Días de la rutina' })).toBeVisible()
      const metrics = page.locator('[data-exercise-metrics]')
      await pwExpect(metrics).toHaveCount(2)
      expect(await metrics.evaluateAll(groups => groups.map(group => {
        const groupRect = group.getBoundingClientRect()
        const cells = Array.from(group.children).map(child => child.getBoundingClientRect())
        return {
          contained: cells.every(cell => cell.left >= groupRect.left - 1 && cell.right <= groupRect.right + 1),
          separate: cells.every((cell, index) => index === 0 || cell.left >= cells[index - 1].right - 1),
          labels: Array.from(group.querySelectorAll('dt')).map(label => label.textContent?.trim()),
          values: Array.from(group.querySelectorAll('dd')).map(value => value.textContent?.trim()),
        }
      }))).toEqual([
        { contained: true, separate: true, labels: ['Series × reps', 'Intensidad', 'Descanso'], values: ['3 × 10', 'RPE 7', '60 s'] },
        { contained: true, separate: true, labels: ['Series × reps', 'Intensidad', 'Descanso'], values: ['4 × 8', 'RPE 8', '90 s'] },
      ])

      const actionPanel = page.getByRole('complementary', { name: 'Resumen semanal' }).getByRole('region', { name: 'Resumen semanal' })
      expect(await actionPanel.evaluate(element => Number.parseFloat(getComputedStyle(element).paddingBottom))).toBeGreaterThanOrEqual(12)
    } finally {
      await context.close()
    }
  }, 30_000)

  it('uses roving tab focus and arrow keys while exposing one active day panel', async () => {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } })
    const page = await context.newPage()
    try {
      await page.goto(`${baseUrl}/src/components/coaching/__tests__/fixtures/trainerAccessibility.html?surface=editor`)
      await page.waitForFunction(() => Boolean((window as Window & { __TRAINER_ACCESSIBILITY_READY__?: boolean }).__TRAINER_ACCESSIBILITY_READY__))
      const dayA = page.getByRole('tab', { name: /Día A/ })
      const dayB = page.getByRole('tab', { name: /Día B/ })
      await pwExpect(dayA).toHaveAttribute('aria-selected', 'true')
      await pwExpect(dayA).toHaveAttribute('tabindex', '0')
      await pwExpect(dayB).toHaveAttribute('aria-selected', 'false')
      await pwExpect(dayB).toHaveAttribute('tabindex', '-1')
      const dayAPanelId = await dayA.getAttribute('aria-controls') ?? ''
      const dayBPanelId = await dayB.getAttribute('aria-controls') ?? ''
      const dayAPanel = page.locator(`#${dayAPanelId}`)
      const dayBPanel = page.locator(`#${dayBPanelId}`)
      await pwExpect(dayAPanel).toHaveCount(1)
      await pwExpect(dayBPanel).toHaveCount(1)
      await pwExpect(page.locator('[role="tabpanel"]')).toHaveCount(2)
      await pwExpect(page.getByRole('tabpanel')).toHaveCount(1)
      await pwExpect(dayAPanel).toHaveAttribute('aria-labelledby', await dayA.getAttribute('id') ?? '')
      await pwExpect(dayBPanel).toBeHidden()
      await pwExpect(dayBPanel).toHaveAttribute('inert', '')

      await dayA.focus()
      await page.keyboard.press('ArrowRight')
      await pwExpect(dayB).toBeFocused()
      await pwExpect(dayB).toHaveAttribute('aria-selected', 'true')
      await pwExpect(page.getByRole('tabpanel', { name: 'Día B' })).toBeVisible()
      await pwExpect(page.getByRole('tabpanel')).toHaveCount(1)

      await page.keyboard.press('ArrowLeft')
      await pwExpect(dayA).toBeFocused()
      await pwExpect(dayA).toHaveAttribute('aria-selected', 'true')
      await pwExpect(page.getByRole('tabpanel', { name: 'Día A' })).toBeVisible()

      await page.keyboard.press('End')
      await pwExpect(dayB).toBeFocused()
      await pwExpect(dayB).toHaveAttribute('aria-selected', 'true')
      await pwExpect(page.getByRole('tabpanel', { name: 'Día B' })).toBeVisible()

      await page.keyboard.press('Home')
      await pwExpect(dayA).toBeFocused()
      await pwExpect(dayA).toHaveAttribute('aria-selected', 'true')
      await pwExpect(page.getByRole('tabpanel', { name: 'Día A' })).toBeVisible()
    } finally {
      await context.close()
    }
  }, 15_000)

  it('restores focus to the external batch opener after successful confirmation and keeps its pending target touch-sized', async () => {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } })
    const page = await context.newPage()
    try {
      await page.goto(`${baseUrl}/src/components/coaching/__tests__/fixtures/trainerAccessibility.html?surface=editor&refresh=stale`)
      await page.waitForFunction(() => Boolean((window as Window & { __TRAINER_ACCESSIBILITY_READY__?: boolean }).__TRAINER_ACCESSIBILITY_READY__))
      const opener = page.getByRole('button', { name: 'Agregar varios ejercicios' })
      await opener.click()
      const dialog = page.getByRole('dialog', { name: 'Agregar ejercicios' })
      const firstExercise = dialog.getByRole('button', { name: /Ejercicio 01/ })
      await firstExercise.focus()
      await page.keyboard.press('Space')
      const confirm = dialog.getByRole('button', { name: 'Agregar 1 ejercicio' })
      await confirm.focus()
      await page.keyboard.press('Enter')

      await pwExpect(dialog).toBeHidden()
      await pwExpect(opener).toBeFocused()
      await pwExpect(opener).toHaveAttribute('aria-disabled', 'true')
      await expectActionTargetsAtLeast44(page)
      const target = await opener.evaluate(element => {
        const rect = element.getBoundingClientRect()
        return { width: rect.width, height: rect.height }
      })
      expect(target.width).toBeGreaterThanOrEqual(43.5)
      expect(target.height).toBeGreaterThanOrEqual(43.5)
    } finally {
      await context.close()
    }
  }, 15_000)

  it('measures aria-disabled targets instead of excluding them from the touch contract', async () => {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } })
    const page = await context.newPage()
    try {
      await page.goto(`${baseUrl}/src/components/coaching/__tests__/fixtures/trainerAccessibility.html?surface=editor`)
      await page.locator('main').evaluate(main => {
        const target = document.createElement('button')
        target.setAttribute('aria-disabled', 'true')
        target.setAttribute('aria-label', 'Objetivo pendiente pequeño')
        target.style.width = '44px'
        target.style.height = '20px'
        main.append(target)
      })

      await expect(expectActionTargetsAtLeast44(page)).rejects.toThrow(/Objetivo pendiente pequeño/)
    } finally {
      await context.close()
    }
  }, 15_000)

  it('scrolls the route editor clear of the fixed bottom navigation and includes the simulated safe-area inset', async () => {
    const context = await browser.newContext({ viewport: { width: 390, height: 640 } })
    const page = await context.newPage()
    try {
      await page.goto(`${baseUrl}/src/components/coaching/__tests__/fixtures/trainerAccessibility.html?surface=editor-shell`)
      await page.waitForFunction(() => Boolean((window as Window & { __TRAINER_ACCESSIBILITY_READY__?: boolean }).__TRAINER_ACCESSIBILITY_READY__))
      await page.evaluate(() => {
        document.documentElement.style.setProperty('--safe-area-inset-bottom', '24px')
      })
      const viewport = page.locator('[data-app-scroll-viewport]')
      const bottomNav = page.getByRole('navigation', { name: 'Navegación principal' })
      await pwExpect(viewport).toBeVisible()
      await pwExpect(bottomNav).toBeVisible()
      await viewport.evaluate(element => { element.scrollTop = element.scrollHeight })

      const geometry = await page.evaluate(() => {
        const scrollViewport = document.querySelector<HTMLElement>('[data-app-scroll-viewport]')!
        const nav = document.querySelector<HTMLElement>('nav.fitai-safe-bottom')!
        const panel = document.querySelector<HTMLElement>('aside[aria-labelledby="routine-summary-title"] section')!
        return {
          atScrollEnd: scrollViewport.scrollHeight - scrollViewport.clientHeight - scrollViewport.scrollTop,
          panelBottom: panel.getBoundingClientRect().bottom,
          navTop: nav.getBoundingClientRect().top,
          panelPaddingBottom: Number.parseFloat(getComputedStyle(panel).paddingBottom),
          safeInset: getComputedStyle(document.documentElement).getPropertyValue('--safe-area-inset-bottom').trim(),
          appSafeInset: getComputedStyle(document.documentElement).getPropertyValue('--app-safe-area-bottom').trim(),
        }
      })
      expect(geometry.atScrollEnd).toBeLessThanOrEqual(1)
      expect(geometry.panelBottom).toBeLessThanOrEqual(geometry.navTop)
      expect(geometry.safeInset).toBe('24px')
      expect(geometry.appSafeInset).toBe('24px')
      expect(geometry.panelPaddingBottom).toBeGreaterThanOrEqual(24)
    } finally {
      await context.close()
    }
  }, 15_000)

  it('selects a batch with Space and Enter and restores focus after keyboard close', async () => {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } })
    const page = await context.newPage()
    try {
      await page.goto(`${baseUrl}/src/components/coaching/__tests__/fixtures/trainerAccessibility.html?surface=editor`)
      await page.waitForFunction(() => Boolean((window as Window & { __TRAINER_ACCESSIBILITY_READY__?: boolean }).__TRAINER_ACCESSIBILITY_READY__))
      const opener = page.getByRole('button', { name: 'Agregar varios ejercicios' })
      await opener.focus()
      await page.keyboard.press('Enter')
      const dialog = page.getByRole('dialog', { name: 'Agregar ejercicios' })
      await pwExpect(dialog).toBeVisible()

      const firstExercise = dialog.getByRole('button', { name: /Ejercicio 01/ })
      const secondExercise = dialog.getByRole('button', { name: /Ejercicio 02/ })
      await firstExercise.focus()
      await page.keyboard.press('Space')
      await secondExercise.focus()
      await page.keyboard.press('Enter')
      await pwExpect(firstExercise).toHaveAttribute('aria-pressed', 'true')
      await pwExpect(secondExercise).toHaveAttribute('aria-pressed', 'true')
      await pwExpect(dialog.getByRole('button', { name: 'Agregar 2 ejercicios' })).toBeVisible()

      const close = dialog.getByRole('button', { name: 'Cerrar' })
      await close.focus()
      await page.keyboard.press('Enter')
      await pwExpect(dialog).toBeHidden()
      await pwExpect(opener).toBeFocused()
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
          await page.getByText('Editar día', { exact: true }).click()
          await page.getByRole('button', { name: 'Editar Sentadilla con barra' }).click()
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

      await page.getByRole('link', { name: 'Quitar Modalidad: En línea' }).click()
      await pwExpect(page.getByRole('link', { name: 'Quitar Modalidad: En línea' })).toHaveCount(0)
      await pwExpect(page.getByRole('searchbox', { name: 'Buscar entrenadores' })).toHaveValue('fuerza')
      await pwExpect(page.getByRole('textbox', { name: 'Ubicación' })).toHaveValue('La Habana')
      await pwExpect(page.getByRole('combobox', { name: 'Modalidad' })).toContainText('Todas')

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
