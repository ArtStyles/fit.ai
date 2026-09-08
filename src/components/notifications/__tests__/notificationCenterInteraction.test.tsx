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

type BrowserHarness = Window & typeof globalThis & {
  __destination?: string
  __dismiss?: (id: string) => Promise<{ ok: true } | { ok: false; error: string }>
  __exitFrames?: Array<{ present: boolean; x: number; opacity: number }>
  __exitSamplingDone?: boolean
  __fixtureOptions?: FixtureOptions
  __lastDismissedId?: string
  __notificationReady?: boolean
  __pointerCancelCount?: number
  __resolveDismissal?: (result: { ok: true } | { ok: false; error: string }) => void
  __toast?: { title: string; variant: string }
  __unreadChangeCount?: number
}

type FixtureOptions = {
  width?: number
  reference?: boolean
  readNotification?: boolean
  suppressEmptyState?: boolean
  reducedMotion?: 'reduce' | 'no-preference'
  scrollable?: boolean
}

const NOTIFICATION_ID = '00000000-0000-4000-8000-000000000001'
const ACTIVITY_ARTICLE = '[data-activity] article'
const DISMISS_LABEL = 'Quitar notificación: Solicitud aceptada'

let browser: Browser
let bundle = ''
let stylesheet = ''
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
  const planPath = path.join(process.cwd(), 'src/components/notifications/SwipeDismissPlanNotice.tsx')

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
        import { SwipeDismissPlanNotice } from ${JSON.stringify(planPath)}

        const root = createRoot(document.getElementById('root'))
        const options = window.__fixtureOptions || {}
        const first = {
          id: '${NOTIFICATION_ID}',
          type: 'trainer.request.accepted',
          title: 'Solicitud aceptada',
          body: 'Tu entrenador acepto la solicitud.',
          url: '/trainers/relationships/active',
          readAt: null,
          createdAt: '2026-08-07T15:00:00.000Z',
        }
        const notifications = options.readNotification ? [first, {
          ...first,
          id: '00000000-0000-4000-8000-000000000002',
          title: 'Rutina disponible',
          body: 'Tu entrenador compartió una rutina para continuar tu entrenamiento.',
          readAt: '2026-08-07T15:10:00.000Z',
          createdAt: '2026-08-07T14:00:00.000Z',
        }] : [first]
        root.render(
          <main style={{ maxWidth: 768, margin: '0 auto', padding: 16 }}>
          {options.reference ? (
            <section data-plan-reference style={{ marginBottom: 24 }}>
              <h2 style={{ marginBottom: 12 }}>Referencia del plan</h2>
              <SwipeDismissPlanNotice
                aiNotes="Aumenta la carga de forma gradual."
                planName="Hipertrofia - Semana 5"
                dismissalKey="plan-update:77777777-7777-4777-8777-777777777777:2026-08-20T07:00:00.000Z"
              />
            </section>
          ) : null}
          <div data-activity>
          <NotificationCenter
            initialPage={{
              notifications,
              nextCursor: null,
              unreadCount: 1,
            }}
            suppressEmptyState={options.suppressEmptyState}
            onNotificationRead={() => {
              window.__unreadChangeCount = (window.__unreadChangeCount || 0) + 1
            }}
          />
          </div>
          {options.scrollable ? <div aria-hidden="true" style={{ height: 1600 }} /> : null}
          </main>
        )
        requestAnimationFrame(() => { window.__notificationReady = true })
      `,
    },
    plugins: [{
      name: 'notification-center-browser-fixture-mocks',
      setup(buildApi: FixtureBuildApi) {
        const mocks = new Map<string, string>([
          ['next/navigation', `
            export const useRouter = () => ({
              push: destination => { window.__destination = destination },
              refresh: () => {},
            })
          `],
          ['@/app/actions/notifications', `
            export const dismissNotificationAttention = async () => ({ ok: true })
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
          ['@/components/navigation/PendingLink', `
            import React from 'react'
            export function PendingLink({ children, ...props }) {
              return <a {...props}>{children}</a>
            }
          `],
        ])

        buildApi.onResolve({ filter: /.*/ }, args => {
          if (mocks.has(args.path)) return { path: args.path, namespace: 'notification-center-mock' }
          return null
        })
        buildApi.onLoad({ filter: /.*/, namespace: 'notification-center-mock' }, args => ({
          contents: mocks.get(args.path),
          loader: args.path.endsWith('PendingLink') ? 'tsx' : 'js',
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
    content: [path.join(process.cwd(), 'src/components/notifications/**/*.{ts,tsx}').split(path.sep).join('/')],
  })]).process(css, { from: cssPath })
  return result.css
}

async function animationFrames(count: number) {
  await page.evaluate(frames => new Promise<void>(resolve => {
    function next(remaining: number) {
      if (remaining === 0) resolve()
      else requestAnimationFrame(() => next(remaining - 1))
    }
    next(frames)
  }), count)
}

async function recordExitFrames() {
  await page.evaluate(selector => {
    const harness = window as BrowserHarness
    harness.__exitFrames = []
    harness.__exitSamplingDone = false
    const start = performance.now()
    function sample() {
      const article = document.querySelector(selector)
      const style = article ? getComputedStyle(article) : null
      const x = style?.transform && style.transform !== 'none'
        ? new DOMMatrixReadOnly(style.transform).m41
        : 0
      harness.__exitFrames?.push({
        present: Boolean(article),
        x,
        opacity: style ? Number(style.opacity) : 0,
      })
      if (!article || performance.now() - start > 1500) {
        harness.__exitSamplingDone = true
        return
      }
      requestAnimationFrame(sample)
    }
    requestAnimationFrame(sample)
  }, ACTIVITY_ARTICLE)
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

async function touchDrag(locator: Locator, direction: 'left' | 'up', cancel = false) {
  const box = await locator.boundingBox()
  expect(box).not.toBeNull()
  const startX = (box?.x ?? 0) + Math.min((box?.width ?? 0) - 20, 220)
  const startY = (box?.y ?? 0) + (direction === 'up'
    ? (box?.height ?? 0) - 24
    : Math.min((box?.height ?? 0) / 2, 60))
  const distance = direction === 'left' ? 110 : Math.min(140, startY - 20)
  const session = await page.context().newCDPSession(page)
  try {
    await session.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ x: startX, y: startY, id: 1 }],
    })
    for (let step = 1; step <= 8; step++) {
      await session.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [{
          x: startX - (direction === 'left' ? distance * step / 8 : 0),
          y: startY - (direction === 'up' ? distance * step / 8 : 0),
          id: 1,
        }],
      })
      await animationFrames(1)
    }
    await session.send('Input.dispatchTouchEvent', {
      type: cancel ? 'touchCancel' : 'touchEnd',
      touchPoints: [],
    })
  } finally {
    await session.detach()
  }
}

async function preparePage(options: FixtureOptions = {}) {
  if (page && !page.isClosed()) await page.close()
  page = await browser.newPage({ viewport: { width: options.width ?? 390, height: 844 }, hasTouch: true })
  await page.emulateMedia({ reducedMotion: options.reducedMotion ?? 'no-preference' })
  // The app layout supplies next/font variables; use local sans-serif fallbacks without a font fetch.
  await page.setContent(`<!doctype html><html class="dark" style="--font-sans: 'Plus Jakarta Sans', Arial, sans-serif; --font-display: 'Barlow Condensed', Arial, sans-serif"><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body class="font-sans antialiased"><div id="root"></div></body></html>`)
  await page.addStyleTag({ content: stylesheet })
  await page.evaluate(fixtureOptions => {
    const harness = window as BrowserHarness
    harness.__fixtureOptions = fixtureOptions
    harness.__unreadChangeCount = 0
    harness.__pointerCancelCount = 0
    document.addEventListener('pointercancel', () => {
      harness.__pointerCancelCount = (harness.__pointerCancelCount ?? 0) + 1
    })
    harness.__dismiss = id => {
      harness.__lastDismissedId = id
      return new Promise(resolve => {
        harness.__resolveDismissal = resolve
      })
    }
  }, options)
  await page.addScriptTag({ content: bundle })
  await page.waitForFunction(() => Boolean((window as BrowserHarness).__notificationReady))
  await page.locator(ACTIVITY_ARTICLE).first().waitFor()
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

describe('NotificationCenter mounted swipe interaction', () => {
  it('allows the left drag to begin on the full-width open control', async () => {
    const openButton = page.getByRole('button', { name: 'Abrir: Solicitud aceptada' })

    await dragLeft(openButton)
    await page.locator(ACTIVITY_ARTICLE).waitFor({ state: 'detached' })
    const state = await page.evaluate(() => ({
      dismissedId: (window as BrowserHarness).__lastDismissedId ?? null,
      articleCount: document.querySelectorAll('article').length,
      destination: (window as BrowserHarness).__destination ?? null,
    }))
    expect(state.dismissedId).toBe('00000000-0000-4000-8000-000000000001')
    expect(state.articleCount).toBe(0)
    expect(state.destination).toBeNull()
    await page.evaluate(() => (window as BrowserHarness).__resolveDismissal?.({ ok: true }))
    await page.waitForFunction(() => (window as BrowserHarness).__unreadChangeCount === 1)
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
    await page.waitForFunction(() => document.activeElement?.getAttribute('aria-label') === 'Quitar notificación: Solicitud aceptada')
    expect(await dismissButton.evaluate(element => document.activeElement === element)).toBe(true)
  })

  it.each([390, 1280])('matches the opaque plan surface and usable dismissal control at %i px', async width => {
    await preparePage({ width, reference: true, readNotification: true })
    if (process.env.NOTIFICATION_ARTIFACT_DIR) {
      await mkdir(process.env.NOTIFICATION_ARTIFACT_DIR, { recursive: true })
      await page.screenshot({
        path: path.join(process.env.NOTIFICATION_ARTIFACT_DIR, `notification-comparison-${width}.png`),
        fullPage: true,
      })
    }
    const metrics = await page.evaluate(() => {
      function measure(article: Element) {
        const button = article.querySelector('button[aria-label^="Quitar"]')!
        const icon = button.querySelector('svg')!
        const rect = button.getBoundingClientRect()
        const iconRect = icon.getBoundingClientRect()
        const background = getComputedStyle(article).backgroundColor
        const canvas = document.createElement('canvas')
        canvas.width = canvas.height = 1
        const context = canvas.getContext('2d')!
        context.fillStyle = background
        context.fillRect(0, 0, 1, 1)
        const hitPoints = [
          [rect.x + rect.width / 2, rect.y + 4],
          [rect.x + rect.width / 2, rect.bottom - 4],
          [rect.x + 4, rect.y + rect.height / 2],
          [rect.right - 4, rect.y + rect.height / 2],
        ]
        return {
          background,
          alpha: context.getImageData(0, 0, 1, 1).data[3],
          width: rect.width,
          height: rect.height,
          iconWidth: iconRect.width,
          iconHeight: iconRect.height,
          usable: hitPoints.every(([x, y]) => button.contains(document.elementFromPoint(x, y))),
        }
      }
      return {
        plan: measure(document.querySelector('[data-plan-reference] article')!),
        activities: Array.from(document.querySelectorAll('[data-activity] article'), measure),
        overflow: document.documentElement.scrollWidth > innerWidth,
      }
    })
    expect(metrics.overflow).toBe(false)
    expect(metrics.plan.alpha).toBe(255)
    for (const activity of metrics.activities) {
      expect(activity.alpha).toBe(255)
      expect(activity.background).toBe(metrics.plan.background)
      expect(activity.width).toBe(44)
      expect(activity.height).toBe(44)
      expect(activity.iconWidth).toBe(16)
      expect(activity.iconHeight).toBe(16)
      expect(activity.usable).toBe(true)
    }
  })

  it.each([false, true])('animates the last activity row before removing it (suppress empty: %s)', async suppressEmptyState => {
    await preparePage({ suppressEmptyState })
    await recordExitFrames()
    await page.getByRole('button', { name: DISMISS_LABEL }).click()
    await page.waitForFunction(() => (window as BrowserHarness).__exitSamplingDone)
    const frames = await page.evaluate(() => (window as BrowserHarness).__exitFrames ?? [])
    expect(frames.some(frame => frame.present && frame.x < -1 && frame.opacity > 0 && frame.opacity < 1)).toBe(true)
    expect(frames.at(-1)?.present).toBe(false)
    expect(await page.evaluate(() => (window as BrowserHarness).__unreadChangeCount)).toBe(0)
    await page.evaluate(() => (window as BrowserHarness).__resolveDismissal?.({ ok: true }))
    await page.waitForFunction(() => (window as BrowserHarness).__unreadChangeCount === 1)
  })

  it('removes the last row without sliding when reduced motion is requested', async () => {
    await preparePage({ reducedMotion: 'reduce', suppressEmptyState: true })
    await recordExitFrames()
    await page.getByRole('button', { name: DISMISS_LABEL }).click()
    await page.waitForFunction(() => (window as BrowserHarness).__exitSamplingDone)
    const frames = await page.evaluate(() => (window as BrowserHarness).__exitFrames ?? [])
    expect(frames.every(frame => Math.abs(frame.x) < 0.5)).toBe(true)
    expect(frames.at(-1)?.present).toBe(false)
  })

  it.each(['immediately', 'during exit'])('restores focus and unread state when dismissal fails %s', async timing => {
    await page.evaluate(failureTiming => {
      const harness = window as BrowserHarness
      harness.__dismiss = async id => {
        harness.__lastDismissedId = id
        if (failureTiming === 'during exit') {
          await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
        }
        return { ok: false, error: 'No se pudo comprobar la notificacion.' }
      }
    }, timing)
    const dismissButton = page.getByRole('button', { name: DISMISS_LABEL })
    await dismissButton.focus()
    await page.keyboard.press('Enter')
    await page.getByRole('alert').waitFor()
    await page.waitForFunction(() => document.activeElement?.getAttribute('aria-label') === 'Quitar notificación: Solicitud aceptada')
    await page.waitForFunction(selector => {
      const article = document.querySelector(selector)
      if (!article) return false
      const style = getComputedStyle(article)
      return Number(style.opacity) === 1 && (style.transform === 'none'
        || Math.abs(new DOMMatrixReadOnly(style.transform).m41) < 0.5)
    }, ACTIVITY_ARTICLE)
    expect(await page.locator(ACTIVITY_ARTICLE).count()).toBe(1)
    expect(await dismissButton.isEnabled()).toBe(true)
    expect(await page.evaluate(() => (window as BrowserHarness).__unreadChangeCount)).toBe(0)
    expect(await page.locator('[data-activity]').textContent()).toContain('1 sin leer')
  })

  it('cancels a short horizontal drag without navigation and permits the next genuine click', async () => {
    const openButton = page.getByRole('button', { name: 'Abrir: Solicitud aceptada' })
    const box = (await openButton.boundingBox())!
    const startX = box.x + box.width / 2
    const y = box.y + box.height / 2
    await page.mouse.move(startX, y)
    await page.mouse.down()
    await page.mouse.move(startX - 30, y, { steps: 6 })
    await animationFrames(10)
    await page.mouse.up()
    await animationFrames(2)
    expect(await page.evaluate(() => (window as BrowserHarness).__lastDismissedId ?? null)).toBeNull()
    expect(await page.evaluate(() => (window as BrowserHarness).__destination ?? null)).toBeNull()
    await openButton.click()
    await page.waitForFunction(() => (window as BrowserHarness).__destination === '/trainers/relationships/active')
    expect(await page.evaluate(() => (window as BrowserHarness).__unreadChangeCount)).toBe(1)
  })

  it('dismisses through a real touch swipe without opening the notification', async () => {
    await touchDrag(page.locator(ACTIVITY_ARTICLE), 'left')
    await page.locator(ACTIVITY_ARTICLE).waitFor({ state: 'detached' })
    expect(await page.evaluate(() => (window as BrowserHarness).__lastDismissedId)).toBe(NOTIFICATION_ID)
    expect(await page.evaluate(() => (window as BrowserHarness).__destination ?? null)).toBeNull()
    await page.evaluate(() => (window as BrowserHarness).__resolveDismissal?.({ ok: true }))
    await page.waitForFunction(() => (window as BrowserHarness).__unreadChangeCount === 1)
  })

  it('allows vertical touch scrolling without dismissing or opening activity', async () => {
    await preparePage({ scrollable: true })
    await touchDrag(page.locator(ACTIVITY_ARTICLE), 'up')
    await page.waitForFunction(() => Math.max(scrollY, document.documentElement.scrollTop, document.body.scrollTop) > 20)
    expect(await page.evaluate(() => (window as BrowserHarness).__lastDismissedId ?? null)).toBeNull()
    expect(await page.evaluate(() => (window as BrowserHarness).__destination ?? null)).toBeNull()
    expect(await page.locator(ACTIVITY_ARTICLE).count()).toBe(1)
  })

  it('keeps the notification when the browser cancels a touch drag beyond the dismissal threshold', async () => {
    await touchDrag(page.locator(ACTIVITY_ARTICLE), 'left', true)
    await animationFrames(2)
    expect(await page.evaluate(() => (window as BrowserHarness).__pointerCancelCount)).toBeGreaterThan(0)
    expect(await page.evaluate(() => (window as BrowserHarness).__lastDismissedId ?? null)).toBeNull()
    expect(await page.evaluate(() => (window as BrowserHarness).__destination ?? null)).toBeNull()
    expect(await page.locator(ACTIVITY_ARTICLE).count()).toBe(1)
    await page.getByRole('button', { name: 'Abrir: Solicitud aceptada' }).click()
    await page.waitForFunction(() => (window as BrowserHarness).__destination === '/trainers/relationships/active')
  })
})
