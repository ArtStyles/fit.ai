import { chromium, expect } from '@playwright/test'
import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'

const origin = process.env.MOBILE_PREVIEW_URL || 'http://127.0.0.1:4178'
const artifacts = '.artifacts/auth-scroll-fix'
await mkdir(artifacts, { recursive: true })
const browser = await chromium.launch({ headless: true })
const measurements = []

async function measure(page, name) {
  const result = await page.evaluate(() => {
    const viewport = document.querySelector('[data-auth-scroll-viewport]')
    const rect = viewport?.getBoundingClientRect()
    return {
      documentOverflow: document.documentElement.scrollHeight - document.documentElement.clientHeight,
      bodyOverflow: document.body.scrollHeight - document.body.clientHeight,
      bodyScroll: document.body.scrollTop,
      documentScroll: window.scrollY,
      horizontalOverflow: document.documentElement.scrollWidth - innerWidth,
      viewportTop: rect?.top,
      viewportBottom: rect?.bottom,
      viewportOverflow: viewport ? viewport.scrollHeight - viewport.clientHeight : null,
      overscroll: viewport ? getComputedStyle(viewport).overscrollBehaviorY : null,
      height: innerHeight,
    }
  })
  measurements.push({ name, ...result })
  assert.ok(result.documentOverflow <= 1, `${name}: document should not scroll; excess ${result.documentOverflow}px`)
  assert.ok(result.bodyOverflow <= 1, `${name}: body should not scroll; excess ${result.bodyOverflow}px`)
  assert.equal(result.bodyScroll, 0, `${name}: the body stays fixed below the system bars`)
  assert.equal(result.documentScroll, 0, `${name}: scroll stays inside the auth viewport`)
  assert.ok(result.horizontalOverflow <= 1, `${name}: no horizontal overflow`)
  assert.equal(result.viewportTop, 32, `${name}: content starts below the status bar`)
  assert.equal(result.viewportBottom, result.height - 24, `${name}: content ends before the gesture bar`)
  assert.equal(result.overscroll, 'contain', `${name}: keep the local overscroll affordance without document chaining`)
  return result
}

try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } })
  await context.addInitScript(() => Object.defineProperty(navigator, 'onLine', { get: () => false }))
  await context.route('**/*', route => route.request().url().startsWith(`${origin}/`) ? route.continue() : route.abort())
  const page = await context.newPage()
  await page.goto(`${origin}/login`)
  await expect(page.getByLabel('Correo electrónico', { exact: true })).toBeVisible()
  await page.evaluate(async () => {
    await document.fonts.ready
    document.documentElement.style.setProperty('--safe-area-inset-top', '32px')
    document.documentElement.style.setProperty('--safe-area-inset-bottom', '24px')
  })

  for (const width of [320, 390, 1440]) {
    await page.setViewportSize({ width, height: width === 1440 ? 900 : 844 })
    const result = await measure(page, `login-${width}`)
    assert.ok(result.viewportOverflow <= 1, `login-${width}: the login fits without unnecessary scrolling`)
    await page.screenshot({ path: `${artifacts}/login-${width}.png`, fullPage: true })
  }

  // A compact/keyboard-sized viewport must still scroll to the submit control
  // and legal link. The fixed safe boundary must not block focus or navigation.
  for (const scenario of [{ name: 'compact', width: 320, height: 568 }, { name: 'keyboard', width: 390, height: 390 }]) {
    await page.setViewportSize({ width: scenario.width, height: scenario.height })
    const viewport = page.locator('[data-auth-scroll-viewport]')
    const result = await measure(page, scenario.name)
    assert.ok(result.viewportOverflow > 0, `${scenario.name}: necessary scrolling remains available`)
    await page.getByLabel('Correo electrónico', { exact: true }).fill('layout@example.com')
    await page.getByLabel('Contraseña', { exact: true }).fill('layout-check-password')
    const submit = page.getByRole('button', { name: 'Iniciar sesión', exact: true })
    await submit.scrollIntoViewIfNeeded()
    await expect(submit).toBeInViewport()
    await submit.click()
    await expect(page.locator('form [role="alert"]')).toContainText(/conexión|internet/i)
    const closeToast = page.getByRole('button', { name: 'Cerrar notificacion', exact: true })
    while (await closeToast.count()) await closeToast.first().click()
    const privacy = page.getByRole('link', { name: 'Política de privacidad', exact: true })
    await privacy.scrollIntoViewIfNeeded()
    await expect(privacy).toBeInViewport()
    await viewport.evaluate(element => { element.scrollTop = element.scrollHeight })
    await page.mouse.move(scenario.width / 2, scenario.height / 2)
    await page.mouse.wheel(0, 600)
    await measure(page, `${scenario.name}-scrolled`)
    // The browser must never hit an auth control in the protected status area,
    // including after the document would previously have scrolled upward.
    assert.equal(await page.evaluate(() => Boolean(document.elementFromPoint(30, 16)?.closest('[data-auth-scroll-viewport]'))), false)
    await page.screenshot({ path: `${artifacts}/login-${scenario.name}.png`, fullPage: true })
  }

  await page.setViewportSize({ width: 390, height: 844 })
  await page.evaluate(() => { document.documentElement.style.fontSize = '200%' })
  const zoomed = await measure(page, 'large-text')
  assert.ok(zoomed.viewportOverflow > 0, 'large text retains scroll access')
  const password = page.getByLabel('Contraseña', { exact: true })
  await password.focus()
  await expect(password).toBeFocused()
  await expect(password).toBeInViewport()
  const privacy = page.getByRole('link', { name: 'Política de privacidad', exact: true })
  await privacy.scrollIntoViewIfNeeded()
  await expect(privacy).toBeInViewport()
  await page.screenshot({ path: `${artifacts}/login-large-text.png`, fullPage: true })
  assert.doesNotMatch(await page.locator('meta[name="viewport"]').getAttribute('content'), /user-scalable=no|maximum-scale=1/)
  await writeFile(`${artifacts}/measurements.json`, JSON.stringify(measurements, null, 2))
  await context.close()
  console.log('PASS auth safe-area boundary, no unnecessary scroll, compact/keyboard scroll, large text and focus')
} finally {
  await browser.close()
}
