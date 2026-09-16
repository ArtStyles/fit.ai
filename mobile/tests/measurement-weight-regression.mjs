import { chromium, expect } from '@playwright/test'
import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { installAccountFixture, newTestAccount, storedAccountSnapshot } from './account-fixture.mjs'

const origin = process.env.MOBILE_PREVIEW_URL || 'http://127.0.0.1:4178'
const out = '.artifacts/measurement-weight-regression'
await mkdir(out, { recursive: true })
const browser = await chromium.launch({ headless: true })
const report = { checks: [], pageErrors: [], passed: false }
try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } })
  await context.addInitScript(() => Object.defineProperty(navigator, 'onLine', { get: () => false }))
  await context.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort())
  const page = await context.newPage()
  page.setDefaultTimeout(15000)
  page.on('pageerror', error => report.pageErrors.push(error.message))
  await page.clock.setFixedTime(new Date('2026-09-15T16:00:00Z'))
  await page.goto(`${origin}/login`)
  const state = await newTestAccount({ linked: false })
  Object.assign(state.tables.profiles[0], { full_name: 'Peso verificable', onboarding_done: true, readiness_status: 'cleared', weight_kg: 70, timezone: 'UTC', language: 'es' })
  await installAccountFixture(page, state)
  const weight = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Peso actual', exact: true }) })
  async function checkWeight(value, name) {
    await page.goto(`${origin}/settings/datos`)
    await expect(weight).toContainText(value === null ? 'Sin peso registrado' : `${value} kg`)
    await page.reload()
    await expect(weight).toContainText(value === null ? 'Sin peso registrado' : `${value} kg`)
    assert.equal((await storedAccountSnapshot(page)).accounts[0].tables.profiles[0].weight_kg, value)
    report.checks.push(name)
    await page.screenshot({ path: `${out}/${name}.png`, fullPage: true })
  }
  await checkWeight(70, 'initial')
  await weight.getByRole('link', { name: 'Registrar o actualizar peso', exact: true }).click()
  await page.getByRole('button', { name: 'Registrar', exact: true }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('Peso (kg)', { exact: true }).fill('82')
  await dialog.getByRole('button', { name: 'Guardar', exact: true }).click()
  await expect(dialog).toBeHidden()
  await checkWeight(82, 'created')
  await page.goto(`${origin}/medidas`)
  await page.getByRole('button', { name: /Editar medida del/ }).first().click()
  await dialog.getByLabel('Peso (kg)', { exact: true }).fill('81')
  await dialog.getByRole('button', { name: 'Actualizar', exact: true }).click()
  await expect(dialog).toBeHidden()
  await checkWeight(81, 'edited')
  await page.goto(`${origin}/medidas`)
  page.once('dialog', modal => modal.accept())
  await page.getByRole('button', { name: /Eliminar medida del/ }).first().click()
  await expect(page.getByRole('heading', { name: 'Sin medidas registradas', exact: true })).toBeVisible()
  await checkWeight(null, 'deleted-last-weight')
  assert.deepEqual(report.pageErrors, [])
  report.passed = true
  console.log('PASS weight create/edit/delete updates profile and survives reload')
} finally {
  await writeFile(`${out}/results.json`, JSON.stringify(report, null, 2))
  await browser.close()
}
