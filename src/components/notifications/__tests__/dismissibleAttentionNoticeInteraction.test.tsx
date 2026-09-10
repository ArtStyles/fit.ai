import { createRequire } from 'node:module'
import { mkdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { chromium, type Browser, type Locator, type Page } from '@playwright/test'
import postcss from 'postcss'
import tailwindcss from 'tailwindcss'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import tailwindConfig from '../../../../tailwind.config'

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
  __pointerCancelCount?: number
  __refreshCount?: number
  __renderAttention?: (kind: AttentionKind, noticeKey: string, title?: string) => void
  __resolveDismissal?: (result: { ok: true } | { ok: false; error: string }) => void
  __toast?: { title: string; variant: string }
}

let browser: Browser
let bundle = ''
let stylesheet = ''
let page: Page

const ATTENTION_SURFACE = '[data-dismissible-attention] > div:has(> button)'

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
          ['next/image', `
            import React from 'react'
            export default function Image({ fill, unoptimized, ...props }) { return <img {...props} /> }
          `],
          ['next/link', `
            import React from 'react'
            export default function Link({ children, ...props }) { return <a {...props}>{children}</a> }
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
              return <a {...props} onClick={event => {
                event.preventDefault()
                window.__childActionCount = (window.__childActionCount || 0) + 1
              }}>{children}</a>
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

async function buildBrowserStyles(): Promise<string> {
  const cssPath = path.join(process.cwd(), 'src/styles/globals.css')
  const css = await readFile(cssPath, 'utf8')
  const result = await postcss([tailwindcss({
    ...tailwindConfig,
    content: [
      'src/components/notifications/**/*.{ts,tsx}',
      'src/components/dashboard/CheckInBanner.tsx',
      'src/components/dashboard/DashboardPromoBanner.tsx',
    ].map(file => path.join(process.cwd(), file).split(path.sep).join('/')),
  })]).process(css, { from: cssPath })
  return result.css
}

async function preparePage(width = 390) {
  if (page && !page.isClosed()) await page.close()
  page = await browser.newPage({ viewport: { width, height: 844 }, hasTouch: true })
  await page.setContent('<!doctype html><html class="dark" style="--font-sans:Arial,sans-serif;--font-display:Arial,sans-serif"><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body class="font-sans antialiased"><main style="max-width:768px;margin:0 auto;padding:16px"><div id="root"></div></main></body></html>')
  await page.addStyleTag({ content: stylesheet })
  await page.evaluate(() => {
    const harness = window as BrowserHarness
    harness.__childActionCount = 0
    harness.__refreshCount = 0
    harness.__pointerCancelCount = 0
    document.addEventListener('pointercancel', () => {
      harness.__pointerCancelCount = (harness.__pointerCancelCount ?? 0) + 1
    })
    harness.__dismiss = noticeKey => {
      harness.__lastDismissalKey = noticeKey
      return new Promise(resolve => {
        harness.__resolveDismissal = resolve
      })
    }
  })
  await page.addScriptTag({ content: bundle })
  await page.waitForFunction(() => Boolean((window as BrowserHarness).__noticeReady))
  await page.locator(ATTENTION_SURFACE).waitFor()
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
  const fixture = await Promise.all([buildBrowserFixture(), buildBrowserStyles()])
  bundle = fixture[0]
  stylesheet = fixture[1]
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
  it.each([390, 1280])('covers the trailing action at rest and reveals it during a left drag at %i px', async width => {
    await preparePage(width)
    for (const kind of ['check-in', 'promo'] as const) {
      await page.evaluate(nextKind => (window as BrowserHarness).__renderAttention?.(
        nextKind,
        `${nextKind}:surface-regression`,
      ), kind)
      const surface = page.locator(ATTENTION_SURFACE)
      await surface.waitFor()
      const resting = await surface.evaluate(element => {
        const background = getComputedStyle(element).backgroundColor
        const canvas = document.createElement('canvas')
        canvas.width = canvas.height = 1
        const context = canvas.getContext('2d')!
        context.fillStyle = background
        context.fillRect(0, 0, 1, 1)
        const backdrop = element.previousElementSibling!
        const rect = backdrop.getBoundingClientRect()
        const dismiss = element.querySelector('button[aria-label^="Quitar"]')!.getBoundingClientRect()
        return {
          alpha: context.getImageData(0, 0, 1, 1).data[3],
          coversBackdrop: element.contains(document.elementFromPoint(rect.right - 24, rect.y + rect.height / 2)),
          dismissWidth: dismiss.width,
          dismissHeight: dismiss.height,
          overflow: document.documentElement.scrollWidth > innerWidth,
        }
      })
      expect(resting.alpha).toBe(255)
      expect(resting.coversBackdrop).toBe(true)
      expect(resting.dismissWidth).toBe(44)
      expect(resting.dismissHeight).toBe(44)
      expect(resting.overflow).toBe(false)
      if (process.env.NOTIFICATION_ARTIFACT_DIR && kind === 'check-in') {
        await mkdir(process.env.NOTIFICATION_ARTIFACT_DIR, { recursive: true })
        await page.screenshot({
          path: path.join(process.env.NOTIFICATION_ARTIFACT_DIR, `notifications-${width}.png`),
          fullPage: true,
        })
      }

      const box = (await surface.boundingBox())!
      await page.mouse.move(box.x + 160, box.y + 60)
      await page.mouse.down()
      await page.mouse.move(box.x + 96, box.y + 60, { steps: 8 })
      await page.waitForFunction(selector => {
        const element = document.querySelector(selector)!
        const backdrop = element.previousElementSibling!
        const rect = backdrop.getBoundingClientRect()
        return backdrop.contains(document.elementFromPoint(rect.right - 24, rect.y + rect.height / 2))
      }, ATTENTION_SURFACE)
      expect(await page.evaluate(() => (window as BrowserHarness).__lastDismissalKey)).toBeUndefined()
      // Pause so the below-threshold drag returns to rest without a velocity dismissal.
      await page.waitForTimeout(100)
      await page.mouse.up()
      await page.waitForFunction(selector => {
        const element = document.querySelector(selector)!
        const transform = getComputedStyle(element).transform
        return transform === 'none' || Math.abs(new DOMMatrixReadOnly(transform).m41) < 0.5
      }, ATTENTION_SURFACE)
    }
  })

  it('does not persist dismissal after the platform cancels a left touch drag', async () => {
    const surface = page.locator(ATTENTION_SURFACE)
    const box = (await surface.boundingBox())!
    const session = await page.context().newCDPSession(page)
    try {
      await session.send('Input.dispatchTouchEvent', {
        type: 'touchStart',
        touchPoints: [{ x: box.x + 220, y: box.y + 60, id: 1 }],
      })
      for (let step = 1; step <= 8; step++) {
        await session.send('Input.dispatchTouchEvent', {
          type: 'touchMove',
          touchPoints: [{ x: box.x + 220 - 110 * step / 8, y: box.y + 60, id: 1 }],
        })
        await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => resolve())))
      }
      await session.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] })
    } finally {
      await session.detach()
    }
    await page.waitForFunction(() => (window as BrowserHarness).__pointerCancelCount === 1)
    await page.waitForTimeout(300)
    expect(await surface.count()).toBe(1)
    expect(await page.evaluate(() => (window as BrowserHarness).__lastDismissalKey)).toBeUndefined()
    expect(await page.evaluate(() => (window as BrowserHarness).__childActionCount)).toBe(0)
  })

  it('does not execute a child action when the left drag begins on it', async () => {
    const childAction = page.getByRole('link', { name: 'Datos personales' })

    await dragLeft(childAction)

    await page.waitForFunction(() => Boolean((window as BrowserHarness).__lastDismissalKey))
    await page.waitForTimeout(100)
    expect(await page.evaluate(() => (window as BrowserHarness).__childActionCount)).toBe(0)
    await page.evaluate(() => (window as BrowserHarness).__resolveDismissal?.({ ok: true }))
    await page.waitForFunction(() => (window as BrowserHarness).__refreshCount === 1)
  })

  it('dismisses a check-in after a real left drag', async () => {
    const checkIn = page.locator(ATTENTION_SURFACE)

    await dragLeft(checkIn)

    await page.waitForFunction(() => Boolean((window as BrowserHarness).__lastDismissalKey), null, {
      timeout: 2_000,
    })
    expect(await page.evaluate(() => (window as BrowserHarness).__lastDismissalKey)).toBe(
      'check-in:2026-07-01T08:00:00.000Z',
    )
    await page.locator(ATTENTION_SURFACE).waitFor({ state: 'detached' })
    await page.evaluate(() => (window as BrowserHarness).__resolveDismissal?.({ ok: true }))
    await page.waitForFunction(() => (window as BrowserHarness).__refreshCount === 1)
  })

  it('shows the next attention kind after the dismissed check-in refreshes', async () => {
    await page.getByRole('button', { name: 'Quitar aviso de revisión del perfil' }).click()
    await page.locator(ATTENTION_SURFACE).waitFor({ state: 'detached' })
    await page.evaluate(() => (window as BrowserHarness).__resolveDismissal?.({ ok: true }))
    await page.waitForFunction(() => (window as BrowserHarness).__refreshCount === 1)

    await page.evaluate(() => (window as BrowserHarness).__renderAttention?.(
      'promo',
      'promo:dashboard-primary:2026-08-21T06:00:00.000Z',
      'Promoción nueva',
    ))

    await page.getByRole('heading', { name: 'Promoción nueva' }).waitFor()
  })

  it('shows a newer promotion version after the previous version was dismissed', async () => {
    await page.evaluate(() => (window as BrowserHarness).__renderAttention?.(
      'promo',
      'promo:dashboard-primary:2026-08-20T06:00:00.000Z',
      'Promoción anterior',
    ))
    await page.getByRole('button', { name: 'Quitar promoción' }).click()
    await page.locator(ATTENTION_SURFACE).waitFor({ state: 'detached' })
    await page.evaluate(() => (window as BrowserHarness).__resolveDismissal?.({ ok: true }))

    await page.evaluate(() => (window as BrowserHarness).__renderAttention?.(
      'promo',
      'promo:dashboard-primary:2026-08-21T06:00:00.000Z',
      'Promoción nueva',
    ))

    await page.getByRole('heading', { name: 'Promoción nueva' }).waitFor()
  })

  it('restores keyboard focus when dismissal persistence fails', async () => {
    const button = page.getByRole('button', { name: 'Quitar aviso de revisión del perfil' })
    await button.focus()
    await button.click()
    await page.locator(ATTENTION_SURFACE).waitFor({ state: 'detached' })
    await page.evaluate(() => (window as BrowserHarness).__resolveDismissal?.({
      ok: false,
      error: 'No se pudo comprobar el aviso.',
    }))

    await button.waitFor()
    await page.waitForFunction(() => document.activeElement?.getAttribute('aria-label') === 'Quitar aviso de revisión del perfil')
    expect(await button.evaluate(element => document.activeElement === element)).toBe(true)
  })
})
