import { createRequire } from 'node:module'
import path from 'node:path'
import { chromium, type Browser, type Page } from '@playwright/test'
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
  __dismiss?: (noticeKey: string) => Promise<{ ok: true } | { ok: false; error: string }>
  __lastDismissalKey?: string
  __mountNotice?: () => void
  __noticeReady?: boolean
  __refreshCount?: number
  __resolveDismissal?: (result: { ok: true } | { ok: false; error: string }) => void
  __toast?: { title: string; variant: string }
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
    'src/components/notifications/SwipeDismissPlanNotice.tsx',
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
        import { SwipeDismissPlanNotice } from ${JSON.stringify(componentPath)}

        const root = createRoot(document.getElementById('root'))
        window.__mountNotice = () => root.render(
          <SwipeDismissPlanNotice
            aiNotes="Aumenta la carga de forma gradual."
            planName="Hipertrofia - Semana 5"
            dismissalKey="plan-update:77777777-7777-4777-8777-777777777777:2026-08-20T07:00:00.000Z"
          />
        )
        window.__mountNotice()
        requestAnimationFrame(() => { window.__noticeReady = true })
      `,
    },
    plugins: [{
      name: 'notification-browser-fixture-mocks',
      setup(buildApi: FixtureBuildApi) {
        const mocks = new Map<string, string>([
          ['next/navigation', `
            export const useRouter = () => ({
              refresh: () => { window.__refreshCount = (window.__refreshCount || 0) + 1 },
            })
          `],
          ['@/app/actions/notifications', `
            export const dismissNotificationAttention = noticeKey => window.__dismiss(noticeKey)
          `],
          ['@/components/feedback/ToastProvider', `
            export const useToast = () => ({ showToast: toast => { window.__toast = toast } })
          `],
          ['@/components/i18n/I18nProvider', `
            export const useI18n = () => ({ t: source => source })
          `],
          ['@/components/navigation/PendingLink', `
            import React from 'react'
            export function PendingLink({ children, ...props }) {
              return <a {...props}>{children}</a>
            }
          `],
        ])

        buildApi.onResolve({ filter: /.*/ }, args => {
          if (mocks.has(args.path)) return { path: args.path, namespace: 'notification-mock' }
          return null
        })
        buildApi.onLoad({ filter: /.*/, namespace: 'notification-mock' }, args => ({
          contents: mocks.get(args.path),
          loader: args.path.endsWith('PendingLink') ? 'tsx' : 'js',
          resolveDir: process.cwd(),
        }))
      },
    }],
  })

  return result.outputFiles[0]?.text ?? ''
}

async function preparePage() {
  page = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true })
  await page.setContent('<main><div id="root"></div></main>')
  await page.evaluate(() => {
    const harness = window as BrowserHarness
    harness.__refreshCount = 0
    harness.__dismiss = noticeKey => {
      harness.__lastDismissalKey = noticeKey
      return new Promise(resolve => {
        harness.__resolveDismissal = resolve
      })
    }
  })
  await page.addScriptTag({ content: bundle })
  await page.waitForFunction(() => Boolean((window as BrowserHarness).__noticeReady))
  await page.locator('article').waitFor()
}

beforeAll(async () => {
  bundle = await buildBrowserFixture()
  browser = await chromium.launch({ headless: true })
})

beforeEach(async () => {
  await preparePage()
})

afterAll(async () => {
  await browser?.close()
})

afterEach(async () => {
  await page?.close()
})

describe('SwipeDismissPlanNotice mounted interaction', () => {
  it('removes the mounted notice after a real left drag and refreshes on success', async () => {
    const article = page.locator('article')
    const box = await article.boundingBox()
    expect(box).not.toBeNull()

    const startX = (box?.x ?? 0) + 55
    const y = (box?.y ?? 0) + 24
    await page.mouse.move(startX, y)
    await page.mouse.down()
    await page.mouse.move(startX - 110, y, { steps: 8 })
    await page.mouse.up()

    await page.waitForFunction(() => Boolean((window as BrowserHarness).__lastDismissalKey))
    await page.waitForFunction(() => !document.querySelector('article'))
    expect(await article.count()).toBe(0)

    await page.evaluate(() => (window as BrowserHarness).__resolveDismissal?.({ ok: true }))
    await page.waitForFunction(() => (window as BrowserHarness).__refreshCount === 1)
    expect(await article.count()).toBe(0)
  })

  it('restores the DOM and renders the aria-live error after a real click failure', async () => {
    const article = page.locator('article')
    const dismissButton = page.getByRole('button', { name: 'Quitar aviso del plan' })
    await dismissButton.focus()
    await dismissButton.click()

    await page.waitForFunction(() => Boolean((window as BrowserHarness).__lastDismissalKey))
    await page.waitForFunction(() => !document.querySelector('article'))
    expect(await article.count()).toBe(0)

    await page.evaluate(() => (window as BrowserHarness).__resolveDismissal?.({
      ok: false,
      error: 'No se pudo comprobar el aviso.',
    }))

    await article.waitFor()
    expect(await page.locator('[aria-live="polite"]').textContent()).toBe('No se pudo comprobar el aviso.')
    await page.waitForFunction(() => (
      (window as BrowserHarness).__toast?.title === 'No se pudo comprobar el aviso.'
    ))
    await page.waitForFunction(() => document.activeElement?.getAttribute('aria-label') === 'Quitar aviso del plan')
    expect(await dismissButton.evaluate(element => document.activeElement === element)).toBe(true)
  })
})
