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

type AttentionKind = 'check-in' | 'promo'
type BrowserHarness = Window & typeof globalThis & {
  __childActionCount?: number
  __dismiss?: (noticeKey: string) => Promise<{ ok: true } | { ok: false; error: string }>
  __lastDismissalKey?: string
  __noticeReady?: boolean
  __refreshCount?: number
  __renderAttention?: (kind: AttentionKind, noticeKey: string, title?: string) => void
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
    'src/components/notifications/NotificationAttentionCard.tsx',
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
        import { NotificationAttentionCard } from ${JSON.stringify(componentPath)}

        const root = createRoot(document.getElementById('root'))
        window.__renderAttention = (kind, noticeKey, title = 'Promoción nueva') => {
          const promo = kind === 'promo' ? {
            slot: 'dashboard-primary',
            kind: 'promotion',
            title,
            description: null,
            image_url: null,
            cta_label: null,
            cta_href: null,
            status: 'active',
            starts_on: null,
            ends_on: null,
            updated_at: noticeKey.slice('promo:dashboard-primary:'.length),
          } : null
          root.render(<NotificationAttentionCard attention={{
            notice: kind === 'promo' ? { kind, title } : { kind },
            aiNotes: null,
            planName: 'Fuerza base',
            dismissalKey: noticeKey,
            promo,
          }} />)
        }
        window.__renderAttention('check-in', 'check-in:2026-07-01T08:00:00.000Z')
        requestAnimationFrame(() => { window.__noticeReady = true })
      `,
    },
    plugins: [{
      name: 'dismissible-attention-browser-fixture-mocks',
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
          ['@/components/dashboard/CheckInBanner', `
            import React from 'react'
            export const CheckInBanner = () => (
              <article data-notice-kind="check-in">
                Revisa tu perfil
                <button onClick={() => { window.__childActionCount = (window.__childActionCount || 0) + 1 }}>
                  Datos personales
                </button>
              </article>
            )
          `],
          ['@/components/dashboard/DashboardPromoBanner', `
            import React from 'react'
            export const DashboardPromoBanner = ({ banner }) => <article data-notice-kind="promo">{banner.title}</article>
          `],
          ['@/components/notifications/SwipeDismissPlanNotice', `
            import React from 'react'
            export const SwipeDismissPlanNotice = () => <article data-notice-kind="plan">Plan</article>
            export const dismissPlanNoticeInteraction = () => null
            export const shouldDismissPlanNotice = () => false
          `],
          ['@/components/navigation/PendingLink', `
            import React from 'react'
            export function PendingLink({ children, ...props }) {
              return <a {...props}>{children}</a>
            }
          `],
        ])

        buildApi.onResolve({ filter: /.*/ }, args => {
          if (mocks.has(args.path)) return { path: args.path, namespace: 'attention-mock' }
          return null
        })
        buildApi.onLoad({ filter: /.*/, namespace: 'attention-mock' }, args => ({
          contents: mocks.get(args.path),
          loader: 'tsx',
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
    harness.__childActionCount = 0
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
  await page.locator('[data-notice-kind="check-in"]').waitFor()
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

describe('DismissibleAttentionNotice mounted interaction', () => {
  it('does not execute a child action when the left drag begins on it', async () => {
    const childAction = page.getByRole('button', { name: 'Datos personales' })

    await dragLeft(childAction)

    await page.waitForFunction(() => Boolean((window as BrowserHarness).__lastDismissalKey))
    await page.waitForTimeout(100)
    expect(await page.evaluate(() => (window as BrowserHarness).__childActionCount)).toBe(0)
    await page.evaluate(() => (window as BrowserHarness).__resolveDismissal?.({ ok: true }))
    await page.waitForFunction(() => (window as BrowserHarness).__refreshCount === 1)
  })

  it('dismisses a check-in after a real left drag', async () => {
    const checkIn = page.locator('[data-notice-kind="check-in"]')

    await dragLeft(checkIn)

    await page.waitForFunction(() => Boolean((window as BrowserHarness).__lastDismissalKey), null, {
      timeout: 2_000,
    })
    expect(await page.evaluate(() => (window as BrowserHarness).__lastDismissalKey)).toBe(
      'check-in:2026-07-01T08:00:00.000Z',
    )
    await page.waitForFunction(() => !document.querySelector('[data-notice-kind]'))
    await page.evaluate(() => (window as BrowserHarness).__resolveDismissal?.({ ok: true }))
    await page.waitForFunction(() => (window as BrowserHarness).__refreshCount === 1)
  })

  it('shows the next attention kind after the dismissed check-in refreshes', async () => {
    await page.getByRole('button', { name: 'Quitar aviso de revisión del perfil' }).click()
    await page.waitForFunction(() => !document.querySelector('[data-notice-kind]'))
    await page.evaluate(() => (window as BrowserHarness).__resolveDismissal?.({ ok: true }))
    await page.waitForFunction(() => (window as BrowserHarness).__refreshCount === 1)

    await page.evaluate(() => (window as BrowserHarness).__renderAttention?.(
      'promo',
      'promo:dashboard-primary:2026-08-21T06:00:00.000Z',
      'Promoción nueva',
    ))

    await page.locator('[data-notice-kind="promo"]').waitFor()
    expect(await page.locator('[data-notice-kind="promo"]').textContent()).toBe('Promoción nueva')
  })

  it('shows a newer promotion version after the previous version was dismissed', async () => {
    await page.evaluate(() => (window as BrowserHarness).__renderAttention?.(
      'promo',
      'promo:dashboard-primary:2026-08-20T06:00:00.000Z',
      'Promoción anterior',
    ))
    await page.getByRole('button', { name: 'Quitar promoción' }).click()
    await page.waitForFunction(() => !document.querySelector('[data-notice-kind]'))
    await page.evaluate(() => (window as BrowserHarness).__resolveDismissal?.({ ok: true }))

    await page.evaluate(() => (window as BrowserHarness).__renderAttention?.(
      'promo',
      'promo:dashboard-primary:2026-08-21T06:00:00.000Z',
      'Promoción nueva',
    ))

    await page.locator('[data-notice-kind="promo"]').waitFor()
    expect(await page.locator('[data-notice-kind="promo"]').textContent()).toBe('Promoción nueva')
  })

  it('restores keyboard focus when dismissal persistence fails', async () => {
    const button = page.getByRole('button', { name: 'Quitar aviso de revisión del perfil' })
    await button.focus()
    await button.click()
    await page.waitForFunction(() => !document.querySelector('[data-notice-kind]'))
    await page.evaluate(() => (window as BrowserHarness).__resolveDismissal?.({
      ok: false,
      error: 'No se pudo comprobar el aviso.',
    }))

    await button.waitFor()
    await page.waitForFunction(() => document.activeElement?.getAttribute('aria-label') === 'Quitar aviso de revisión del perfil')
    expect(await button.evaluate(element => document.activeElement === element)).toBe(true)
  })
})
