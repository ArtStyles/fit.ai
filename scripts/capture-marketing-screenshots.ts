import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { chromium, expect, type Page } from '@playwright/test'
import { cleanupE2EAccountFromEnvironment } from './seed-e2e-account'
import { signInAsE2EUser } from '../tests/e2e/helpers/auth'
import {
  seedCoreProductFixture,
  seedCoreProgressHistory,
  type CoreProductFixture,
} from '../tests/e2e/helpers/core-product'

type CaptureName = 'dashboard' | 'session' | 'progress'
type Locale = 'es' | 'en'

const root = resolve(import.meta.dirname, '..')
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:3000'
const viewport = { width: 390, height: 844 }

const OUTPUTS: Record<Locale, Record<CaptureName, string>> = {
  es: {
    dashboard: 'public/marketing/dashboard-es.webp',
    session: 'public/marketing/session-es.webp',
    progress: 'public/marketing/progress-es.webp',
  },
  en: {
    dashboard: 'public/marketing/dashboard-en.webp',
    session: 'public/marketing/session-en.webp',
    progress: 'public/marketing/progress-en.webp',
  },
}

const CAPTURE_STYLE = `
  *, *::before, *::after {
    animation-duration: 0s !important;
    animation-delay: 0s !important;
    transition-duration: 0s !important;
    scroll-behavior: auto !important;
  }

  [data-marketing-private] {
    visibility: hidden !important;
  }

  [data-marketing-capture] {
    min-height: ${viewport.height}px !important;
  }
`

async function installStableCaptureStyle(page: Page): Promise<void> {
  await page.addStyleTag({ content: CAPTURE_STYLE })
}

async function pngToWebp(page: Page, png: Buffer): Promise<Buffer> {
  const base64 = png.toString('base64')
  const webpBase64 = await page.evaluate(async source => {
    const image = new Image()
    image.src = `data:image/png;base64,${source}`
    await image.decode()

    const canvas = document.createElement('canvas')
    canvas.width = image.naturalWidth
    canvas.height = image.naturalHeight
    const context = canvas.getContext('2d')
    if (!context) throw new Error('Canvas 2D context is unavailable')
    context.drawImage(image, 0, 0)

    return canvas.toDataURL('image/webp', 0.9).split(',')[1] ?? ''
  }, base64)

  if (!webpBase64) throw new Error('Browser did not return WebP image data')
  return Buffer.from(webpBase64, 'base64')
}

async function gotoCapturePath(page: Page, path: string): Promise<void> {
  let lastError: unknown

  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      await page.goto(path, { waitUntil: 'commit', timeout: 120_000 })
      return
    } catch (error) {
      lastError = error
      if (attempt < 2) await page.waitForTimeout(2_000)
    }
  }

  throw lastError
}

async function captureRegion(
  page: Page,
  path: string,
  captureName: CaptureName,
  outputPath: string,
): Promise<void> {
  await gotoCapturePath(page, path)

  const region = page.locator(`[data-marketing-capture="${captureName}"]`).first()
  await expect(region).toBeVisible({ timeout: 90_000 })
  await installStableCaptureStyle(page)
  await page.evaluate(() => window.scrollTo(0, 0))
  await region.scrollIntoViewIfNeeded()

  const box = await region.boundingBox()
  if (!box) throw new Error(`Missing data-marketing-capture region: ${captureName}`)

  await mkdir(dirname(outputPath), { recursive: true })
  const png = await page.screenshot({
    type: 'png',
    animations: 'disabled',
    clip: {
      x: Math.max(0, Math.floor(box.x)),
      y: Math.max(0, Math.floor(box.y)),
      width: viewport.width,
      height: viewport.height,
    },
  })
  await writeFile(outputPath, await pngToWebp(page, png))
}

async function captureLocale(locale: Locale, fixture: CoreProductFixture): Promise<void> {
  const browser = await chromium.launch({
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
  })
  const context = await browser.newContext({
    baseURL,
    viewport,
    locale: locale === 'en' ? 'en-US' : 'es-419',
    reducedMotion: 'reduce',
  })
  const page = await context.newPage()
  await page.route('**/api/analytics', async route => {
    await route.fulfill({ status: 202, contentType: 'application/json', body: '{}' })
  })

  try {
    await signInAsE2EUser(page)
    await captureRegion(page, '/dashboard', 'dashboard', resolve(root, OUTPUTS[locale].dashboard))
    await captureRegion(page, `/session/${fixture.workoutId}`, 'session', resolve(root, OUTPUTS[locale].session))
    await captureRegion(page, '/progress', 'progress', resolve(root, OUTPUTS[locale].progress))
  } finally {
    await context.close()
    await browser.close()
  }
}

async function main(): Promise<void> {
  try {
    for (const locale of ['es', 'en'] as const) {
      const fixture = await seedCoreProductFixture(locale)
      await seedCoreProgressHistory(fixture)
      await captureLocale(locale, fixture)
    }
  } finally {
    await cleanupE2EAccountFromEnvironment(process.env)
  }
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : 'Unknown marketing screenshot capture failure')
  process.exitCode = 1
})
