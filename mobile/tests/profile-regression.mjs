import { chromium, expect } from '@playwright/test'
import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { installAccountFixture, newTestAccount, storedAccountSnapshot } from './account-fixture.mjs'

const origin = process.env.MOBILE_PREVIEW_URL || 'http://127.0.0.1:4178'
const artifacts = '.artifacts/profile-fix'
await mkdir(artifacts, { recursive: true })
const state = await newTestAccount({ linked: false })
state.email = 'ana.perez@example.invalid'
Object.assign(state.tables.profiles[0], { full_name: 'Ana Pérez', avatar_url: 'https://avatar.fixture/portrait.svg', onboarding_done: true, readiness_status: 'cleared' })
const portrait = '<svg xmlns="http://www.w3.org/2000/svg" width="160" height="240" viewBox="0 0 160 240"><rect width="160" height="240" fill="#483470"/><circle cx="80" cy="85" r="38" fill="#cdb9eb"/><path d="M16 240v-50a64 64 0 0 1 128 0v50" fill="#b28ce8"/></svg>'
const browser = await chromium.launch({ headless: true })
const errors = []
let page
try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } })
  await context.addInitScript(() => Object.defineProperty(navigator, 'onLine', { get: () => false }))
  await context.route('**/*', route => {
    const url = route.request().url()
    if (url === state.tables.profiles[0].avatar_url) return route.fulfill({ contentType: 'image/svg+xml', body: portrait })
    return url.startsWith(`${origin}/`) ? route.continue() : route.abort()
  })
  page = await context.newPage()
  page.on('pageerror', error => errors.push(error.message))
  await page.goto(`${origin}/login`)
  await expect(page.getByLabel('Correo electrónico', { exact: true })).toBeVisible()
  await installAccountFixture(page, state)

  for (const width of [320, 390, 1440]) {
    await page.setViewportSize({ width, height: width === 1440 ? 900 : 844 })
    await page.goto(`${origin}/dashboard`)
    const photo = page.getByRole('button', { name: 'Ampliar foto de perfil', exact: true })
    await expect(photo).toBeEnabled()
    await photo.click()
    const viewer = page.getByRole('dialog', { name: 'Foto de perfil', exact: true })
    await expect(viewer).toBeVisible()
    await expect(page.getByRole('dialog', { name: 'Cuenta y espacios', exact: true })).toHaveCount(0)
    const image = viewer.locator('img')
    assert.equal(await image.evaluate(node => getComputedStyle(node).objectFit), 'contain')
    await page.screenshot({ path: `${artifacts}/photo-${width}.png`, fullPage: true })
    await page.keyboard.press('Escape')
    await expect(viewer).toHaveCount(0)
    await expect(photo).toBeFocused()
    const account = page.getByRole('button', { name: /^Abrir cuenta y espacios/ }).filter({ visible: true }).last()
    await expect(account).toContainText('Ana')
    await expect(account).toHaveAccessibleName(/^Abrir cuenta y espacios.*Ana/)
    await account.click()
    if (width < 1024) await expect(page.getByRole('dialog', { name: 'Cuenta y espacios', exact: true })).toBeVisible()
    else await expect(page.getByRole('menu')).toBeVisible()
    await page.keyboard.press('Escape')
    await page.goto(`${origin}/settings/perfil`)
    await expect(page.getByRole('heading', { name: 'Ana Pérez', exact: true })).toBeVisible()
    await expect(page.getByLabel('Nombre', { exact: true })).toHaveValue('Ana Pérez')
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true)
    await page.screenshot({ path: `${artifacts}/profile-${width}.png`, fullPage: true })
  }
  await page.setViewportSize({ width: 390, height: 844 })
  await page.getByRole('button', { name: 'Quitar foto', exact: true }).click()
  await expect(page.getByText('No se pudo eliminar la foto', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Cambiar foto', exact: true })).toBeEnabled()
  await expect(page.getByRole('button', { name: 'Cambiar foto', exact: true }).locator('img')).toHaveAttribute('src', state.tables.profiles[0].avatar_url)
  await page.getByLabel('Nombre', { exact: true }).fill('Ana María Pérez')
  await page.getByRole('button', { name: 'Guardar cambios', exact: true }).click()
  await expect(page.getByText('Nombre actualizado.', { exact: true })).toBeVisible()
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Ana María Pérez', exact: true })).toBeVisible()
  const saved = (await storedAccountSnapshot(page)).accounts[0]
  assert.equal(saved.tables.profiles[0].avatar_url, state.tables.profiles[0].avatar_url)
  assert.deepEqual(saved.tables.exercises, state.tables.exercises)
  assert.deepEqual(errors, [])
  console.log('PASS dashboard photo preview and text account action at 320/390/1440; profile name persists and original photo/data remain intact')
  await writeFile(`${artifacts}/report.json`, JSON.stringify({ passed: true, widths: [320, 390, 1440], cases: ['photo opens viewer instead of account menu', 'whole image fits without crop', 'Escape restores photo focus', 'texts open mobile account dialog and desktop menu', 'account button accessible name includes visible text', 'profile layout has no horizontal overflow', 'unavailable mobile photo deletion recovers with original photo', 'name edit persists after reload', 'photo and training data retained'], pageErrors: errors }, null, 2))
} catch (error) {
  await page?.screenshot({ path: `${artifacts}/failure.png`, fullPage: true }).catch(() => {})
  throw error
} finally { await browser.close() }
