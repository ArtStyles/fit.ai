import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { chromium, expect as pwExpect, type Browser, type Page } from '@playwright/test'
import { existsSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import {
  auditCriticalAndSeriousAccessibility,
  expectActionTargetsAtLeast44,
  expectReducedMotionAndSafeArea,
  expectResponsiveGeometry,
} from '../../../../tests/e2e/helpers/acceptance'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..')
const fixtureDir = path.join(
  repoRoot,
  'src/components/navigation/__tests__/fixtures',
)
const fixtureHtml = path.join(fixtureDir, 'accountWorkspace.html')
if (!existsSync(fixtureHtml)) {
  throw new Error('Account workspace fixture HTML is missing.')
}
const actionFixture = path.join(fixtureDir, 'workspaceAction.fixture.ts')
const viteEntry = path.join(
  repoRoot,
  'node_modules/.pnpm/node_modules/vite/dist/node/index.js',
)

const MOBILE_VIEWPORTS = [
  { width: 320, height: 800 },
  { width: 360, height: 800 },
  { width: 390, height: 844 },
  { width: 412, height: 915 },
] as const

type WorkspaceWindow = Window & {
  __ACCOUNT_WORKSPACE_READY__?: boolean
  __ANDROID_BACK__: () => boolean
  __NEXT_LINK_NAVIGATE__: (href: string) => void
  __READ_ACTIVE_SESSION_BYTES__: () => { pointer: string | null; backup: string | null }
  __SEED_ACTIVE_SESSION__: () => { pointer: string | null; backup: string | null }
  __SET_LOGICAL_PATHNAME__: (path: string, mode: 'push' | 'replace') => void
  __SIGN_OUTS__: number
  __WORKSPACE_ACTIONS__: string[]
  __WORKSPACE_COMMITS__: string[]
  __WORKSPACE_REFRESHES__: number
  __WORKSPACE_REPLACES__: string[]
}

type WorkspaceState = Pick<
  WorkspaceWindow,
  '__SIGN_OUTS__'
  | '__WORKSPACE_ACTIONS__'
  | '__WORKSPACE_COMMITS__'
  | '__WORKSPACE_REFRESHES__'
  | '__WORKSPACE_REPLACES__'
>

async function expectWorkspaceChromeContained(page: Page) {
  const failures = await page.locator([
    'header',
    'header h1',
    '[data-fixture-title]',
    'nav[aria-label="Navegaci\u00f3n principal"]',
    '[data-fixed-topbar-actions]',
    '[data-bottom-nav-item]',
    '[data-bottom-nav-label]',
    '[role="dialog"]',
    '[role="dialog"] button',
    '[role="dialog"] a',
    '[role="menu"]',
    '[role="menuitem"]',
    '[role="menuitemradio"]',
  ].join(', ')).evaluateAll(elements => elements.flatMap((element, index) => {
    const node = element as HTMLElement
    const style = getComputedStyle(node)
    const rect = node.getBoundingClientRect()
    if (
      style.display === 'none'
      || style.visibility === 'hidden'
      || rect.width === 0
      || rect.height === 0
    ) return []
    const insideViewport = rect.left >= -1 && rect.right <= window.innerWidth + 1
    const mustFitText = node.matches([
      '[data-fixed-topbar-actions]',
      'header h1',
      '[data-fixture-title]',
      '[data-bottom-nav-label]',
      '[role="dialog"]',
      '[role="menu"]',
      '[role="menuitem"]',
      '[role="menuitemradio"]',
    ].join(', '))
    const isTitle = node.matches('header h1, [data-fixture-title]')
    const clipsTitleExplicitly = isTitle
      && ['hidden', 'clip'].includes(style.overflowX)
    const contentFits = !mustFitText
      || node.scrollWidth <= node.clientWidth + 1
      || clipsTitleExplicitly
    return insideViewport && contentFits
      ? []
      : [{ index, tag: node.tagName, rect: rect.toJSON(), scrollWidth: node.scrollWidth }]
  }))
  expect(failures).toEqual([])
}

async function readWorkspaceState(page: Page): Promise<WorkspaceState> {
  return page.evaluate(() => {
    const state = window as unknown as WorkspaceWindow
    return {
      __SIGN_OUTS__: state.__SIGN_OUTS__,
      __WORKSPACE_ACTIONS__: state.__WORKSPACE_ACTIONS__,
      __WORKSPACE_COMMITS__: state.__WORKSPACE_COMMITS__,
      __WORKSPACE_REFRESHES__: state.__WORKSPACE_REFRESHES__,
      __WORKSPACE_REPLACES__: state.__WORKSPACE_REPLACES__,
    }
  })
}

async function expectNavLabelsFit(page: Page, expectedCount: number) {
  await pwExpect(page.locator('[data-bottom-nav-item]')).toHaveCount(expectedCount)
  const geometry = await page.evaluate(() => {
    const labels = Array.from(
      document.querySelectorAll<HTMLElement>('[data-bottom-nav-label]'),
    )
    const labelRects = labels.map(label => label.getBoundingClientRect())
    return {
      labelsFit: labels.every(label => label.scrollWidth <= label.clientWidth + 1),
      labelsInside: labelRects.every(label => (
        label.left >= -1 && label.right <= window.innerWidth + 1
      )),
      labelsSeparated: labelRects.every((label, index) => (
        index === labelRects.length - 1
        || label.right <= labelRects[index + 1].left + 1
      )),
      rootFits: document.documentElement.scrollWidth <= window.innerWidth,
    }
  })
  expect(geometry).toEqual({
    labelsFit: true,
    labelsInside: true,
    labelsSeparated: true,
    rootFits: true,
  })
}

async function waitForWorkspaceState(page: Page, expected: Partial<WorkspaceState>) {
  await page.waitForFunction(expectedState => {
    const state = window as unknown as WorkspaceWindow
    return Object.entries(expectedState).every(([key, value]) => (
      JSON.stringify(state[key as keyof WorkspaceState]) === JSON.stringify(value)
    ))
  }, expected, { timeout: 15_000 })
}

async function capture(page: Page, filename: string) {
  const artifactDir = path.join(repoRoot, '.artifacts/workspace-navigation')
  mkdirSync(artifactDir, { recursive: true })
  await page.waitForFunction(() => Array.from(document.querySelectorAll(
    '[role="dialog"], [role="menu"]',
  )).every(element => element.getAnimations({ subtree: true })
    .every(animation => animation.playState !== 'running')),
  undefined, { timeout: 5_000 })
  await page.screenshot({ path: path.join(artifactDir, filename), fullPage: true })
}

describe('account workspace responsive acceptance in a local browser', () => {
  let browser: Browser
  let viteServer: {
    listen: () => Promise<void>
    close: () => Promise<void>
    httpServer: { address: () => string | { port: number } | null }
  }
  let baseUrl = ''

  beforeAll(async () => {
    const { createServer } = await import(pathToFileURL(viteEntry).href)
    viteServer = await createServer({
      configFile: false,
      root: repoRoot,
      appType: 'spa',
      cacheDir: path.join(repoRoot, 'node_modules', '.vite-account-workspace-test'),
      oxc: { jsx: { runtime: 'automatic' } },
      optimizeDeps: {
        include: [
          'react',
          'react-dom',
          'react-dom/client',
          'react/jsx-dev-runtime',
          'lucide-react',
          'clsx',
          'tailwind-merge',
          'zustand',
          '@capacitor/core',
          '@capacitor/haptics',
          '@radix-ui/react-avatar',
          '@radix-ui/react-dialog',
          '@radix-ui/react-dropdown-menu',
        ],
      },
      resolve: {
        dedupe: ['react', 'react-dom'],
        alias: [
          { find: '@/app/actions/workspace', replacement: actionFixture },
          { find: '@/app/(auth)/actions', replacement: actionFixture },
          { find: '@/app/actions/authorizeSession', replacement: actionFixture },
          { find: 'next/navigation', replacement: path.join(fixtureDir, 'nextNavigation.fixture.ts') },
          { find: 'next/link', replacement: path.join(fixtureDir, 'nextLink.fixture.tsx') },
          { find: '@', replacement: path.join(repoRoot, 'src') },
        ],
      },
      server: { host: '127.0.0.1', port: 0, strictPort: false, hmr: false },
    })
    await viteServer.listen()
    const address = viteServer.httpServer.address()
    if (!address || typeof address === 'string') {
      throw new Error('Account workspace fixture did not bind a TCP port.')
    }
    baseUrl = `http://127.0.0.1:${address.port}`
    browser = await chromium.launch({ headless: true })
  }, 30_000)

  afterAll(async () => {
    await browser?.close()
    await viteServer?.close()
  }, 30_000)

  async function openFixture(page: Page, query: string) {
    const response = await page.goto(
      baseUrl
      + '/src/components/navigation/__tests__/fixtures/accountWorkspace.html?'
      + query,
    )
    if (!response?.ok()) {
      throw new Error(`Account workspace fixture returned ${response?.status() ?? 'no response'}.`)
    }
    await page.waitForFunction(() => Boolean((window as unknown as WorkspaceWindow)
      .__ACCOUNT_WORKSPACE_READY__), undefined, { timeout: 15_000 })
  }

  it.each(MOBILE_VIEWPORTS)(
    'keeps five personal destinations readable and Entrenar centered at $width px',
    async viewport => {
      const context = await browser.newContext({ viewport })
      const page = await context.newPage()
      try {
        await openFixture(page, 'pathname=/dashboard&preferred=coach')
        await pwExpect(page.locator('[data-bottom-nav-item][href="/coaching"]')).toHaveCount(0)
        const geometry = await page.evaluate(() => {
          const train = document.querySelector<HTMLElement>(
            '[data-bottom-nav-item="/entrenar"]',
          )!
          const rect = train.getBoundingClientRect()
          return { delta: Math.abs(rect.left + rect.width / 2 - window.innerWidth / 2) }
        })
        expect(geometry.delta).toBeLessThanOrEqual(2)
        await expectNavLabelsFit(page, 5)
        await expectActionTargetsAtLeast44(page)
        await expectWorkspaceChromeContained(page)
      } finally {
        await context.close()
      }
    },
  )

  it.each(MOBILE_VIEWPORTS)(
    'keeps four coach destinations readable at $width px',
    async viewport => {
      const context = await browser.newContext({ viewport })
      const page = await context.newPage()
      try {
        await openFixture(page, 'pathname=/coach&preferred=personal')
        await pwExpect(page.locator('[data-bottom-nav-item][href="/coach/profile"]')).toHaveCount(0)
        await pwExpect(page.locator('[data-bottom-nav-item][href="/coach/services"]')).toHaveCount(0)
        await expectNavLabelsFit(page, 4)
        await expectActionTargetsAtLeast44(page)
        await expectWorkspaceChromeContained(page)
      } finally {
        await context.close()
      }
    },
  )

  it.each([{ width: 320, language: 'en' }, { width: 412, language: 'en' }])(
    'keeps English labels in both workspaces at $width px',
    async ({ width, language }) => {
      const context = await browser.newContext({ viewport: { width, height: 844 } })
      const page = await context.newPage()
      try {
        await openFixture(page, `pathname=/dashboard&language=${language}`)
        await pwExpect(page.locator('html')).toHaveAttribute('lang', 'en')
        await expectNavLabelsFit(page, 5)
        await expectWorkspaceChromeContained(page)
        await openFixture(page, `pathname=/coach&language=${language}`)
        await pwExpect(page.locator('html')).toHaveAttribute('lang', 'en')
        await expectNavLabelsFit(page, 4)
        await expectWorkspaceChromeContained(page)
      } finally {
        await context.close()
      }
    },
  )

  it.each([
    { width: 320, surface: 'topbar' },
    { width: 360, surface: 'topbar' },
    { width: 320, surface: 'feed' },
    { width: 360, surface: 'feed' },
    { width: 320, surface: 'toolbar' },
    { width: 360, surface: 'toolbar' },
  ])('keeps $surface title and actions separated at $width px', async testCase => {
    const context = await browser.newContext({
      viewport: { width: testCase.width, height: 800 },
    })
    const page = await context.newPage()
    try {
      await openFixture(page, `surface=${testCase.surface}&pathname=/exercises`)
      const title = page.locator('[data-fixture-title], h1').first()
      const actions = testCase.surface === 'toolbar'
        ? page.getByRole('button', { name: 'Abrir cuenta y espacios' })
        : page.locator('[data-fixed-topbar-actions]')
      const titleBox = await title.boundingBox()
      const actionBox = await actions.boundingBox()
      expect(titleBox).not.toBeNull()
      expect(actionBox).not.toBeNull()
      expect((titleBox?.x ?? 0) + (titleBox?.width ?? 0))
        .toBeLessThanOrEqual((actionBox?.x ?? 0) + 1)
      await expectResponsiveGeometry(page)
      await expectWorkspaceChromeContained(page)
    } finally {
      await context.close()
    }
  })

  it('honors reduced motion and safe area while its mobile sheet is open', async () => {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      reducedMotion: 'reduce',
    })
    const page = await context.newPage()
    try {
      await openFixture(page, 'surface=menu&pathname=/dashboard')
      await page.locator('[data-account-workspace-trigger]:visible').click()
      await pwExpect(page.getByRole('dialog')).toBeVisible()
      await expectReducedMotionAndSafeArea(page)
      await expectWorkspaceChromeContained(page)
    } finally {
      await context.close()
    }
  })

  it('traps focus, respects safe area, and lets Escape and Android Back close the mobile sheet', async () => {
    const context = await browser.newContext({
      viewport: { width: 390, height: 640 },
      reducedMotion: 'reduce',
    })
    const page = await context.newPage()
    try {
      await openFixture(page, 'surface=menu&pathname=/dashboard')
      await page.evaluate(() => {
        document.documentElement.style.setProperty('--safe-area-inset-bottom', '24px')
      })
      const trigger = page.getByRole('button', { name: 'Abrir cuenta y espacios' }).first()
      await pwExpect(trigger).toHaveAccessibleDescription('Espacio activo: Personal')
      await trigger.focus()
      await page.keyboard.press('Enter')
      const dialog = page.getByRole('dialog')
      await pwExpect(dialog).toBeVisible()
      await pwExpect(dialog.getByRole('link', { name: 'Mi acompa\u00f1amiento' })).toBeVisible()
      const personal = page.getByRole('button', { name: 'Personal' })
      await pwExpect(personal).toBeFocused()
      await pwExpect(personal).toHaveAttribute('aria-pressed', 'true')
      await expectActionTargetsAtLeast44(page)
      await expectWorkspaceChromeContained(page)

      const focusables = dialog.locator('button:not([disabled]), a[href]')
      const firstFocusable = focusables.first()
      const lastFocusable = focusables.last()
      await lastFocusable.focus()
      await page.keyboard.press('Tab')
      await pwExpect(firstFocusable).toBeFocused()
      await firstFocusable.focus()
      await page.keyboard.press('Shift+Tab')
      await pwExpect(lastFocusable).toBeFocused()

      await page.waitForFunction(() => {
        const dialogNode = document.querySelector<HTMLElement>('[role="dialog"]')
        return Boolean(dialogNode)
          && dialogNode!.getBoundingClientRect().bottom <= window.innerHeight + 1
      }, undefined, { timeout: 5_000 })
      const safeGeometry = await dialog.evaluate(element => ({
        bottom: element.getBoundingClientRect().bottom,
        viewport: window.innerHeight,
        paddingBottom: Number.parseFloat(getComputedStyle(element).paddingBottom),
      }))
      expect(safeGeometry.bottom).toBeLessThanOrEqual(safeGeometry.viewport)
      expect(safeGeometry.paddingBottom).toBeGreaterThanOrEqual(24)

      await page.keyboard.press('Escape')
      await pwExpect(dialog).toBeHidden()
      await pwExpect(trigger).toBeFocused()

      await trigger.click()
      await pwExpect(dialog).toBeVisible()
      expect(await page.evaluate(() => (window as unknown as WorkspaceWindow).__ANDROID_BACK__())).toBe(true)
      await pwExpect(dialog).toBeHidden()
      await pwExpect(trigger).toBeFocused()
    } finally {
      await context.close()
    }
  })

  it('scrolls the short mobile sheet to its sign out action', async () => {
    const context = await browser.newContext({ viewport: { width: 390, height: 320 } })
    const page = await context.newPage()
    try {
      await openFixture(page, 'surface=menu&pathname=/dashboard')
      await page.locator('[data-account-workspace-trigger]:visible').click()
      const scrollRegion = page.locator('[data-fitai-dialog-scroll-region]')
      const scrollGeometry = await scrollRegion.evaluate(element => ({
        clientHeight: element.clientHeight,
        scrollHeight: element.scrollHeight,
      }))
      expect(scrollGeometry.scrollHeight).toBeGreaterThan(scrollGeometry.clientHeight)
      const signOut = page.getByRole('button', { name: 'Cerrar sesi\u00f3n' })
      await signOut.scrollIntoViewIfNeeded()
      await pwExpect(signOut).toBeVisible()
      await pwExpect(signOut).toBeEnabled()
      await signOut.click()
      expect((await readWorkspaceState(page)).__SIGN_OUTS__).toBe(1)
    } finally {
      await context.close()
    }
  })

  it('serializes a pending workspace change and blocks concurrent account actions', async () => {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } })
    const page = await context.newPage()
    try {
      await openFixture(page, 'surface=menu&pathname=/dashboard&delay=1000')
      const trigger = page.getByRole('button', { name: 'Abrir cuenta y espacios' }).first()
      await trigger.focus()
      await page.keyboard.press('Enter')
      const coach = page.getByRole('button', { name: 'Entrenador' })
      await coach.focus()
      await page.keyboard.press('Space')
      await page.keyboard.press('Space')
      const visibleTrigger = page.locator('[data-account-workspace-trigger]:visible').first()
      await pwExpect(visibleTrigger).toHaveAttribute('aria-busy', 'true')
      await pwExpect(page.getByRole('button', { name: 'Personal' })).toBeDisabled()
      await pwExpect(coach).toBeDisabled()
      await pwExpect(page.getByRole('status')).toContainText('Cambiando al espacio')
      await page.evaluate(() => {
        document.querySelector<HTMLAnchorElement>('a[href="/settings"]')?.click()
        document.querySelector<HTMLElement>('[data-account-sign-out]')?.click()
      })
      expect((await readWorkspaceState(page)).__SIGN_OUTS__).toBe(0)
      await waitForWorkspaceState(page, {
        __WORKSPACE_ACTIONS__: ['coach'],
        __WORKSPACE_COMMITS__: ['coach'],
        __WORKSPACE_REPLACES__: ['/coach'],
        __WORKSPACE_REFRESHES__: 1,
      })
      await pwExpect(page.getByRole('dialog')).toBeHidden()
      await trigger.click()
      await pwExpect(page.locator('[data-account-workspace-trigger]:visible').first())
        .toHaveAccessibleDescription('Espacio activo: Entrenador')
      await pwExpect(page.getByRole('button', { name: 'Entrenador' }))
        .toHaveAttribute('aria-pressed', 'true')
    } finally {
      await context.close()
    }
  }, 20_000)

  it('unmounts the inactive breakpoint portal before opening the current menu', async () => {
    const context = await browser.newContext({ viewport: { width: 390, height: 640 } })
    const page = await context.newPage()
    try {
      await openFixture(page, 'surface=menu&pathname=/dashboard')
      await page.locator('[data-account-workspace-trigger]:visible').click()
      await pwExpect(page.getByRole('dialog')).toBeVisible()
      await page.setViewportSize({ width: 1280, height: 800 })
      await pwExpect(page.getByRole('dialog')).toHaveCount(0)
      await pwExpect(page.locator('[data-account-workspace-trigger]:visible')).toHaveCount(1)
      await expectWorkspaceChromeContained(page)

      await page.locator('[data-account-workspace-trigger]:visible').click()
      await pwExpect(page.getByRole('menu')).toBeVisible()
      await page.setViewportSize({ width: 390, height: 640 })
      await pwExpect(page.getByRole('menu')).toHaveCount(0)
      await pwExpect(page.locator('[data-account-workspace-trigger]:visible')).toHaveCount(1)
      await expectWorkspaceChromeContained(page)
    } finally {
      await context.close()
    }
  })

  it.each([
    { outcome: 'invalid', refreshes: 0 },
    { outcome: 'unavailable', refreshes: 1 },
    { outcome: 'network', refreshes: 0 },
  ])('keeps the sheet recoverable when the action outcome is $outcome', async ({ outcome, refreshes }) => {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } })
    const page = await context.newPage()
    try {
      await openFixture(page, `surface=menu&pathname=/dashboard&outcome=${outcome}`)
      await page.locator('[data-account-workspace-trigger]:visible').click()
      await page.getByRole('button', { name: 'Entrenador' }).click()
      await pwExpect(page.getByRole('alert')).toBeVisible()
      await pwExpect(page.getByRole('dialog')).toBeVisible()
      const state = await readWorkspaceState(page)
      expect(state.__WORKSPACE_COMMITS__).toEqual([])
      expect(state.__WORKSPACE_REPLACES__).toEqual([])
      expect(state.__WORKSPACE_REFRESHES__).toBe(refreshes)
      await page.keyboard.press('Escape')
      await pwExpect(page.getByRole('dialog')).toBeHidden()
    } finally {
      await context.close()
    }
  })

  it('treats an action redirect as navigation without a local commit or error', async () => {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } })
    const page = await context.newPage()
    try {
      await openFixture(page, 'surface=menu&pathname=/dashboard&outcome=redirect')
      await page.locator('[data-account-workspace-trigger]:visible').click()
      await page.getByRole('button', { name: 'Entrenador' }).click()
      await waitForWorkspaceState(page, { __WORKSPACE_ACTIONS__: ['coach'] })
      await pwExpect(page.getByRole('dialog')).toBeHidden()
      await pwExpect(page.getByRole('alert')).toHaveCount(0)
      const state = await readWorkspaceState(page)
      expect(state.__WORKSPACE_COMMITS__).toEqual([])
      expect(state.__WORKSPACE_REPLACES__).toEqual([])
      expect(state.__WORKSPACE_REFRESHES__).toBe(0)
    } finally {
      await context.close()
    }
  })

  it.each([
    { pathname: '/dashboard', preferred: 'coach', expected: 'Personal', links: 5 },
    { pathname: '/coach/clients', preferred: 'personal', expected: 'Entrenador', links: 4 },
    { pathname: '/coach/apply', preferred: 'coach', expected: 'Personal', links: 5 },
    { pathname: '/coaching', preferred: 'coach', expected: 'Personal', links: 5 },
    { pathname: '/settings/perfil', preferred: 'coach', expected: 'Entrenador', links: 4 },
    { pathname: '/notifications', preferred: 'personal', expected: 'Personal', links: 5 },
    { pathname: '/coach/clients', preferred: 'coach', access: 'denied', expected: 'Personal', links: 5 },
  ] as const)('presents $expected for $pathname without mutating workspace preference', async testCase => {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } })
    const page = await context.newPage()
    try {
      const access = testCase.access ? `&access=${testCase.access}` : ''
      await openFixture(page, `pathname=${testCase.pathname}&preferred=${testCase.preferred}${access}`)
      await pwExpect(page.getByRole('button', { name: 'Abrir cuenta y espacios' }))
        .toHaveAccessibleDescription(`Espacio activo: ${testCase.expected}`)
      await pwExpect(page.locator('[data-bottom-nav-item]')).toHaveCount(testCase.links)
      expect((await readWorkspaceState(page)).__WORKSPACE_ACTIONS__).toEqual([])
    } finally {
      await context.close()
    }
  })

  it.each(['/session/workout-1', '/plans/generate', '/feed/new'] as const)(
    'unmounts all shared workspace chrome on immersive route %s',
    async pathname => {
      const context = await browser.newContext({ viewport: { width: 390, height: 844 } })
      const page = await context.newPage()
      try {
        await openFixture(page, `pathname=${pathname}`)
        await pwExpect(page.locator('[data-account-workspace-trigger]')).toHaveCount(0)
        await pwExpect(page.locator('[data-bottom-nav-item]')).toHaveCount(0)
        await pwExpect(page.locator('aside')).toHaveCount(0)
      } finally {
        await context.close()
      }
    },
  )

  it('keeps persisted personal session bytes unchanged through both workspace roots', async () => {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } })
    const page = await context.newPage()
    try {
      await openFixture(page, 'pathname=/dashboard')
      const before = await page.evaluate(() => (window as unknown as WorkspaceWindow).__SEED_ACTIVE_SESSION__())
      await pwExpect(page.getByRole('complementary', { name: 'Entrenamiento en curso' }))
        .toBeVisible()

      await page.getByRole('button', { name: 'Abrir cuenta y espacios' }).first().click()
      await page.getByRole('button', { name: 'Entrenador' }).click()
      await pwExpect(page.locator('[data-bottom-nav-item]')).toHaveCount(4)
      await pwExpect(page.getByRole('complementary', { name: 'Entrenamiento en curso' }))
        .toBeHidden()

      await page.getByRole('button', { name: 'Abrir cuenta y espacios' }).first().click()
      await page.getByRole('button', { name: 'Personal' }).click()
      await pwExpect(page.locator('[data-bottom-nav-item]')).toHaveCount(5)
      await pwExpect(page.getByRole('complementary', { name: 'Entrenamiento en curso' }))
        .toBeVisible()
      expect((await readWorkspaceState(page)).__WORKSPACE_REPLACES__)
        .toEqual(['/coach', '/dashboard'])
      const after = await page.evaluate(() => (window as unknown as WorkspaceWindow).__READ_ACTIVE_SESSION_BYTES__())
      expect(after).toEqual(before)
    } finally {
      await context.close()
    }
  })

  it('uses replace so Android Back skips the replaced personal route', async () => {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } })
    const page = await context.newPage()
    try {
      await openFixture(page, 'pathname=/dashboard')
      await page.evaluate(() => {
        const state = window as unknown as WorkspaceWindow
        state.__SET_LOGICAL_PATHNAME__('/plan', 'replace')
        state.__SET_LOGICAL_PATHNAME__('/dashboard', 'push')
      })
      const beforeChangeLength = await page.evaluate(() => window.history.length)
      await page.getByRole('button', { name: 'Abrir cuenta y espacios' }).first().click()
      await page.getByRole('button', { name: 'Entrenador' }).click()
      await pwExpect(page.locator('[data-bottom-nav-item]')).toHaveCount(4)
      expect(await page.evaluate(() => window.history.length)).toBe(beforeChangeLength)
      await page.goBack()
      await pwExpect(page.locator('[data-bottom-nav-item]')).toHaveCount(5)
      await pwExpect(page.getByRole('button', { name: 'Abrir cuenta y espacios' }).first())
        .toHaveAccessibleDescription('Espacio activo: Personal')
      await page.goForward()
      await pwExpect(page.locator('[data-bottom-nav-item]')).toHaveCount(4)
      expect((await readWorkspaceState(page)).__WORKSPACE_REPLACES__).toEqual(['/coach'])
    } finally {
      await context.close()
    }
  })

  it('uses only the sidebar account trigger on desktop dashboard', async () => {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } })
    const page = await context.newPage()
    try {
      await openFixture(page, 'surface=dashboard&pathname=/dashboard')
      await pwExpect(page.locator('header')).toContainText('Buenos días, Ana')
      await pwExpect(page.locator('header')).toContainText('sábado, 5 de septiembre')
      const visibleTrigger = page.locator('[data-account-workspace-trigger]:visible')
      await pwExpect(visibleTrigger).toHaveCount(1)
      await pwExpect(page.locator('aside:visible').locator('[data-account-workspace-trigger]:visible'))
        .toHaveCount(1)
      await pwExpect(page.locator('main [data-account-workspace-trigger]:visible')).toHaveCount(0)
    } finally {
      await context.close()
    }
  })

  it('keeps the desktop account menu separate from navigation and keyboard operable', async () => {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } })
    const page = await context.newPage()
    try {
      await openFixture(page, 'pathname=/coach')
      const desktopSidebar = page.locator('aside:visible')
      const sidebarNav = desktopSidebar.getByRole('navigation', {
        name: 'Navegaci\u00f3n principal',
      })
      const bottomNav = page.locator('nav').filter({
        has: page.locator('[data-bottom-nav-item]'),
      })
      await pwExpect(sidebarNav).toBeVisible()
      await pwExpect(sidebarNav.getByRole('link')).toHaveCount(4)
      await pwExpect(sidebarNav.locator('[href="/coach/profile"], [href="/coach/services"]')).toHaveCount(0)
      await pwExpect(page.locator('[data-bottom-nav-item]')).toHaveCount(4)
      await pwExpect(bottomNav).toBeHidden()
      await pwExpect(page.locator('[data-bottom-nav-item]:visible')).toHaveCount(0)
      const trigger = desktopSidebar.getByRole('button', { name: 'Abrir cuenta y espacios' })
      await pwExpect(trigger).toHaveAccessibleDescription('Espacio activo: Entrenador')
      await pwExpect(sidebarNav.locator('[data-account-workspace-trigger]')).toHaveCount(0)
      await trigger.focus()
      await page.keyboard.press('Enter')
      const menu = page.getByRole('menu')
      await pwExpect(menu).toBeVisible()
      const coachRadio = menu.getByRole('menuitemradio', { name: 'Entrenador' })
      const personalRadio = menu.getByRole('menuitemradio', { name: 'Personal' })
      await pwExpect(coachRadio)
        .toHaveAttribute('aria-checked', 'true')
      await capture(page, 'coach-desktop-1280.png')
      await coachRadio.focus()
      await page.keyboard.press('ArrowUp')
      await pwExpect(personalRadio).toBeFocused()
      await page.keyboard.press('ArrowDown')
      await pwExpect(coachRadio).toBeFocused()
      await page.keyboard.press('ArrowUp')
      await pwExpect(personalRadio).toBeFocused()
      await page.keyboard.press('Space')
      await pwExpect(menu).toBeHidden()
      await pwExpect(page.locator('[data-bottom-nav-item]')).toHaveCount(5)

      await trigger.focus()
      await page.keyboard.press('Enter')
      await pwExpect(menu).toBeVisible()
      await page.keyboard.press('Escape')
      await pwExpect(menu).toBeHidden()
      await pwExpect(trigger).toBeFocused()
      await trigger.focus()
      await page.keyboard.press('Enter')
      expect(await page.evaluate(() => (window as unknown as WorkspaceWindow).__ANDROID_BACK__())).toBe(true)
      await pwExpect(menu).toBeHidden()
      await pwExpect(trigger).toBeFocused()
      await trigger.click()
      await pwExpect(menu).toBeVisible()

      const menuGeometry = await page.evaluate(() => {
        const nav = document.querySelector<HTMLElement>('aside nav[aria-label="Navegaci\u00f3n principal"]')!
        const menuNode = document.querySelector<HTMLElement>('[role="menu"]')
        const triggerNode = document.querySelector<HTMLElement>('aside [data-account-workspace-trigger]')!
        const avatar = triggerNode.querySelector<HTMLElement>('[data-account-workspace-avatar]')!
        const badge = triggerNode.querySelector<HTMLElement>('[data-account-workspace-badge]')!
        const navRect = nav.getBoundingClientRect()
        const menuRect = menuNode?.getBoundingClientRect()
        const avatarRect = avatar.getBoundingClientRect()
        const badgeRect = badge.getBoundingClientRect()
        return {
          menu: menuRect && { left: menuRect.left, top: menuRect.top, bottom: menuRect.bottom },
          navRight: navRect.right,
          avatar: avatarRect.toJSON(),
          badgeCenter: { x: badgeRect.left + badgeRect.width / 2, y: badgeRect.top + badgeRect.height / 2 },
          viewport: { width: window.innerWidth, height: window.innerHeight },
        }
      })
      expect(menuGeometry.menu).not.toBeNull()
      expect(menuGeometry.menu!.left).toBeGreaterThanOrEqual(menuGeometry.navRight - 1)
      expect(menuGeometry.menu!.top).toBeGreaterThanOrEqual(-1)
      expect(menuGeometry.menu!.bottom).toBeLessThanOrEqual(menuGeometry.viewport.height + 1)
      expect(menuGeometry.badgeCenter.x).toBeGreaterThanOrEqual(menuGeometry.avatar.x)
      expect(menuGeometry.badgeCenter.x).toBeLessThanOrEqual(menuGeometry.avatar.x + menuGeometry.avatar.width)
      expect(menuGeometry.badgeCenter.y).toBeGreaterThanOrEqual(menuGeometry.avatar.y)
      expect(menuGeometry.badgeCenter.y).toBeLessThanOrEqual(menuGeometry.avatar.y + menuGeometry.avatar.height)
      await expectWorkspaceChromeContained(page)
      await auditCriticalAndSeriousAccessibility(page)
      const desktopTargetSizes = await page.locator(
        '[role="menuitem"]:visible, [role="menuitemradio"]:visible',
      ).evaluateAll(elements => elements.map(element => {
        const rect = element.getBoundingClientRect()
        return { width: rect.width, height: rect.height }
      }))
      expect(desktopTargetSizes.length).toBeGreaterThan(0)
      expect(desktopTargetSizes.every(({ width, height }) => (
        width >= 43.5 && height >= 43.5
      ))).toBe(true)
    } finally {
      await context.close()
    }
  })

  it('captures the exact mobile visual evidence states', async () => {
    const cases: ReadonlyArray<{
      viewport: { width: number; height: number }
      query: string
      file: string
      open?: boolean
    }> = [
      { viewport: { width: 320, height: 800 }, query: 'pathname=/dashboard', file: 'personal-320.png' },
      { viewport: { width: 390, height: 844 }, query: 'surface=menu&pathname=/dashboard', file: 'personal-menu-390.png', open: true },
      { viewport: { width: 412, height: 915 }, query: 'pathname=/coach', file: 'coach-412.png' },
      { viewport: { width: 390, height: 844 }, query: 'surface=dashboard&pathname=/dashboard', file: 'dashboard-account-390.png' },
    ] as const
    for (const testCase of cases) {
      const context = await browser.newContext({ viewport: testCase.viewport })
      const page = await context.newPage()
      try {
        await openFixture(page, testCase.query)
        if (testCase.open) await page.locator('[data-account-workspace-trigger]:visible').click()
        await expectWorkspaceChromeContained(page)
        await capture(page, testCase.file)
      } finally {
        await context.close()
      }
    }
  })
})
