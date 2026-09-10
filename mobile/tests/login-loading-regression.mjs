import { chromium, expect } from '@playwright/test'
import { mkdir } from 'node:fs/promises'
import assert from 'node:assert/strict'

const origin = process.env.MOBILE_PREVIEW_URL || 'http://127.0.0.1:4178'
const artifacts = '.artifacts/login-loading-fixes'
await mkdir(artifacts, { recursive: true })
const browser = await chromium.launch({ headless: true })
const errors = []

async function makeContext(options = {}) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, ...options })
  await context.addInitScript(() => Object.defineProperty(navigator, 'onLine', { get: () => false }))
  await context.route('**/*', route => route.request().url().startsWith(`${origin}/`) ? route.continue() : route.abort())
  context.on('page', page => page.on('pageerror', error => errors.push(error.message)))
  return context
}

async function capture(page, name) {
  await page.evaluate(() => document.fonts.ready)
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, name)
  await page.screenshot({ path: `${artifacts}/${name}.png`, fullPage: true })
}

try {
  const context = await makeContext()
  const page = await context.newPage()
  await page.goto(`${origin}/login`)
  await expect(page.getByLabel('Correo electrónico', { exact: true })).toBeVisible()
  await expect(page.getByLabel('Contraseña', { exact: true })).toBeVisible()
  await expect(page.getByRole('alert')).toHaveCount(0)
  await expect(page.getByText('Opciones sin conexión', { exact: true })).toHaveCount(0)
  await expect(page.getByRole('button', { name: /Usar sin conexión|Recuperar perfiles del APK anterior/ })).toHaveCount(0)
  for (const width of [320, 390, 1440]) {
    await page.setViewportSize({ width, height: width === 1440 ? 900 : 844 })
    await capture(page, `login-${width}`)
  }
  await page.setViewportSize({ width: 390, height: 844 })
  await page.getByRole('link', { name: 'Política de privacidad', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Política de privacidad', exact: true })).toBeVisible()
  await page.goto(`${origin}/login`)
  await page.getByLabel('Correo electrónico', { exact: true }).fill('login-check@example.com')
  await page.getByLabel('Contraseña', { exact: true }).fill('sample-password')
  await page.getByLabel('Contraseña', { exact: true }).press('Enter')
  await expect(page.locator('form [role="alert"]')).toContainText(/conexión|internet/i)
  await expect(page.getByRole('button', { name: 'Iniciar sesión', exact: true })).toBeEnabled()
  await expect(page.getByLabel('Correo electrónico', { exact: true })).toHaveValue('login-check@example.com')
  await capture(page, 'login-offline-error-390')
  await context.close()
  console.log('PASS normal login, offline error only after submit, responsive layout and retry')

  const broken = await makeContext()
  await broken.addInitScript(() => {
    IDBFactory.prototype.open = () => { throw new Error('Storage unavailable for test') }
  })
  const brokenPage = await broken.newPage()
  await brokenPage.goto(origin)
  await expect(brokenPage.getByLabel('Correo electrónico', { exact: true })).toBeVisible()
  await expect(brokenPage.getByRole('alert')).toHaveCount(0)
  await brokenPage.reload()
  await expect(brokenPage.getByLabel('Contraseña', { exact: true })).toBeVisible()
  await expect(brokenPage.getByRole('alert')).toHaveCount(0)
  await broken.close()
  console.log('PASS startup/storage failure preserves normal login without passive technical errors')

  for (const reducedMotion of ['no-preference', 'reduce']) {
    const loadingContext = await makeContext({ reducedMotion })
    let releaseDatabase
    const databaseGate = new Promise(resolve => { releaseDatabase = resolve })
    await loadingContext.route('**/sql-wasm.wasm', async route => { await databaseGate; await route.continue() })
    const loadingPage = await loadingContext.newPage()
    await loadingPage.goto(origin, { waitUntil: 'domcontentloaded' })
    const status = loadingPage.getByRole('status').filter({ hasText: 'Preparando tu espacio' })
    await expect(status).toBeVisible()
    await expect(status).toContainText('Vekira')
    if (reducedMotion === 'reduce') {
      assert.equal(await status.locator('svg').last().evaluate(el => getComputedStyle(el).animationName), 'none')
    }
    for (const width of [390, 1440]) {
      await loadingPage.setViewportSize({ width, height: width === 1440 ? 900 : 844 })
      await capture(loadingPage, `loading-${reducedMotion}-${width}`)
    }
    releaseDatabase()
    await expect(loadingPage.getByLabel('Correo electrónico', { exact: true })).toBeVisible()
    await expect(status).toHaveCount(0)
    await loadingContext.close()
  }
  console.log('PASS branded loading, reduced motion and transition to interactive login')
  assert.deepEqual(errors, [])
} finally {
  await browser.close()
}
