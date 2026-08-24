import { createRequire } from 'node:module'
import path from 'node:path'
import { chromium, type Browser, type Locator, type Page } from '@playwright/test'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'

type FixtureResolveArgs = { path: string }
type FixtureBuildApi = {
  onResolve: (
    options: { filter: RegExp },
    callback: (args: FixtureResolveArgs) => { path: string; namespace: string } | null,
  ) => void
  onLoad: (
    options: { filter: RegExp; namespace: string },
    callback: (args: FixtureResolveArgs) => {
      contents: string | undefined
      loader: 'js' | 'tsx'
      resolveDir: string
    },
  ) => void
}
type Esbuild = {
  build: (options: Record<string, unknown>) => Promise<{
    outputFiles: Array<{ text: string }>
  }>
}

type BrowserHarness = Window & typeof globalThis & {
  __dismiss?: (id: string) => Promise<{ ok: true } | { ok: false; error: string }>
  __lastDismissedId?: string
  __notificationReady?: boolean
  __resolveDismissal?: (result: { ok: true } | { ok: false; error: string }) => void
  __toast?: { title: string; variant: string }
  __unreadChangeCount?: number
}

let browser: Browser
let bundle = ''
let page: Page

async function loadEsbuild(): Promise<Esbuild> {
  const require = createRequire(import.meta.url)
  const vitestEntry = require.resolve('vitest')
  const viteEntry = createRequire(vitestEntry).resolve('vite')
  const esbuildEntry = createRequire(viteEntry).resolve('esbuild')
  return import(esbuildEntry) as unknown as Promise<Esbuild>
}

async function buildBrowserFixture(): Promise<string> {
  const { build } = await loadEsbuild()
  const componentPath = path.join(
    process.cwd(),
    'src/components/notifications/NotificationCenter.tsx',
  )

  const result = await build({
    bundle: true,
    format: 'iife',
    platform: 'browser',
    write: false,
    jsx: 'automatic',
    stdin: {
      loader: 'tsx',
      resolveDir: process.cwd(),
      contents: `
        import React from 'react'
        import { createRoot } from 'react-dom/client'
        import { NotificationCenter } from ${JSON.stringify(componentPath)}

        const root = createRoot(document.getElementById('root'))
        root.render(
          <NotificationCenter
            initialPage={{
              notifications: [{
                id: '00000000-0000-4000-8000-000000000001',
                type: 'trainer.request.accepted',
                title: 'Solicitud aceptada',
                body: 'Tu entrenador acepto la solicitud.',
                url: '/trainers/relationships/active',
                readAt: null,
                createdAt: '2026-08-07T15:00:00.000Z',
              }],
              nextCursor: null,
              unreadCount: 1,
            }}
            onNotificationRead={() => {
              window.__unreadChangeCount = (window.__unreadChangeCount || 0) + 1
            }}
          />
        )
        requestAnimationFrame(() => { window.__notificationReady = true })
      `,
    },
    plugins: [{
      name: 'notification-center-browser-fixture-mocks',
      setup(buildApi: FixtureBuildApi) {
        const mocks = new Map<string, string>([
          ['next/navigation', `
            export const useRouter = () => ({ push: destination => { window.__destination = destination } })
          `],
          ['@/app/actions/notifications', `
            export const dismissProductNotification = id => window.__dismiss(id)
            export const listProductNotifications = async () => ({ notifications: [], nextCursor: null, unreadCount: 0 })
            export const markProductNotificationRead = async () => ({ ok: true })
          `],
          ['@/components/feedback/ToastProvider', `
            export const useToast = () => ({ showToast: toast => { window.__toast = toast } })
          `],
          ['@/components/i18n/I18nProvider', `
            export const useI18n = () => ({
              language: 'es',
              timeZone: 'America/Havana',
              t: source => source,
            })
          `],
        ])

        buildApi.onResolve({ filter: /.*/ }, args => {
          if (mocks.has(args.path)) return { path: args.path, namespace: 'notification-center-mock' }
          return null
        })
        buildApi.onLoad({ filter: /.*/, namespace: 'notification-center-mock' }, args => ({
          contents: mocks.get(args.path),
          loader: 'js',
          resolveDir: process.cwd(),
        }))
      },
    }],
  })

  return result.outputFiles[0]?.text ?? ''
}

async function dragLeft(locator: Locator) {
  const box = await locator.boundingBox()
  expect(box).not.toBeNull()

  const startX = (box?.x ?? 0) + Math.min((box?.width ?? 0) - 20, 120)
  const y = (box?.y ?? 0) + Math.min((box?.height ?? 0) / 2, 60)
  await page.mouse.move(startX, y)
  await page.mouse.down()
  await page.mouse.move(startX - 110, y, { steps: 8 })
  await page.mouse.up()
}

async function preparePage() {
  page = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true })
  await page.setContent('<main><div id="root"></div></main>')
  await page.evaluate(() => {
    const harness = window as BrowserHarness
    harness.__unreadChangeCount = 0
    harness.__dismiss = id => {
      harness.__lastDismissedId = id
      return new Promise(resolve => {
        harness.__resolveDismissal = resolve
      })
    }
  })
  await page.addScriptTag({ content: bundle })
  await page.waitForFunction(() => Boolean((window as BrowserHarness).__notificationReady))
  await page.getByRole('article').waitFor()
}

beforeAll(async () => {
  bundle = await buildBrowserFixture()
  browser = await chromium.launch({ headless: true })
}, 30_000)

beforeEach(async () => {
  await preparePage()
})

afterEach(async () => {
  await page?.close()
})

afterAll(async () => {
  await browser?.close()
})

describe('NotificationCenter mounted swipe interaction', () => {
  it('allows the left drag to begin on the full-width open control', async () => {
    const openButton = page.getByRole('button', { name: 'Abrir: Solicitud aceptada' })

    await dragLeft(openButton)
    await page.waitForTimeout(500)
    const state = await page.evaluate(() => ({
      dismissedId: (window as BrowserHarness).__lastDismissedId ?? null,
      articleCount: document.querySelectorAll('article').length,
    }))
    expect(state.dismissedId).toBe('00000000-0000-4000-8000-000000000001')
    expect(state.articleCount).toBe(0)
    await page.evaluate(() => (window as BrowserHarness).__resolveDismissal?.({ ok: true }))
    await page.waitForTimeout(500)
    expect(await page.evaluate(() => (window as BrowserHarness).__unreadChangeCount)).toBe(1)
  })

  it('optimistically removes an unread notification after a real left drag', async () => {
    const notification = page.getByRole('article')

    await dragLeft(notification)

    await page.waitForFunction(() => Boolean((window as BrowserHarness).__lastDismissedId), null, {
      timeout: 2_000,
    })
    expect(await page.evaluate(() => (window as BrowserHarness).__lastDismissedId)).toBe(
      '00000000-0000-4000-8000-000000000001',
    )
    await page.waitForFunction(() => !document.querySelector('article'))
    await page.evaluate(() => (window as BrowserHarness).__resolveDismissal?.({ ok: true }))
    await page.waitForFunction(() => (window as BrowserHarness).__unreadChangeCount === 1)
  })

  it('restores the notification when swipe dismissal persistence fails', async () => {
    const notification = page.getByRole('article')

    await dragLeft(notification)

    await page.waitForFunction(() => Boolean((window as BrowserHarness).__lastDismissedId))
    await page.waitForFunction(() => !document.querySelector('article'))
    await page.evaluate(() => (window as BrowserHarness).__resolveDismissal?.({
      ok: false,
      error: 'No se pudo comprobar la notificacion.',
    }))

    await notification.waitFor()
    expect(await notification.textContent()).toContain('Solicitud aceptada')
    expect(await page.getByRole('alert').textContent()).toContain('No se pudo comprobar la notificacion.')
    expect(await page.evaluate(() => (window as BrowserHarness).__unreadChangeCount)).toBe(0)
    expect(await page.evaluate(() => (window as BrowserHarness).__toast?.title)).toBe(
      'No se pudo comprobar la notificacion.',
    )
  })

  it('restores focus to the dismissal button when keyboard dismissal fails', async () => {
    const dismissButton = page.getByRole('button', { name: /^Quitar notificaci.n: Solicitud aceptada$/ })
    await dismissButton.focus()
    await dismissButton.click()

    await page.waitForFunction(() => !document.querySelector('article'))
    await page.evaluate(() => (window as BrowserHarness).__resolveDismissal?.({
      ok: false,
      error: 'No se pudo comprobar la notificacion.',
    }))

    await dismissButton.waitFor()
    await page.waitForTimeout(100)
    expect(await dismissButton.evaluate(element => document.activeElement === element)).toBe(true)
  })
})
