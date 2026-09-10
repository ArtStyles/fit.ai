import { chromium, expect } from '@playwright/test'
import assert from 'node:assert/strict'
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { installAccountFixture, newTestAccount, storedAccountSnapshot } from './account-fixture.mjs'

const origin = process.env.MOBILE_PREVIEW_URL || 'http://127.0.0.1:4178'
const artifacts = '.artifacts/logout-fix'
await mkdir(artifacts, { recursive: true })
const profileDirectory = await mkdtemp(resolve(artifacts, 'browser-profile-'))
const errors = []
let context
let page

async function openApp() {
  context = await chromium.launchPersistentContext(profileDirectory, { headless: true, viewport: { width: 390, height: 844 } })
  await context.addInitScript(() => {
    window.testOnline = false
    Object.defineProperty(navigator, 'onLine', { get: () => window.testOnline })
  })
  await context.route('**/*', route => route.request().url().startsWith(`${origin}/`) ? route.continue() : route.abort())
  page = context.pages()[0]
  page.setDefaultTimeout(15000)
  page.on('pageerror', error => errors.push(error.message))
  await page.goto(origin)
}

async function expectCredentialLogin() {
  await expect(page).toHaveURL(/\/login$/)
  await expect(page.getByLabel('Correo electrónico', { exact: true })).toBeVisible()
  await expect(page.getByLabel('Contraseña', { exact: true })).toBeVisible()
  await expect(page.getByText('Opciones sin conexión', { exact: true })).toHaveCount(0)
  await expect(page.getByRole('button', { name: /Usar sin conexión|Recuperar perfiles del APK anterior|Prueba cierre/ })).toHaveCount(0)
  await expect(page.getByRole('navigation', { name: 'Navegación principal', exact: true })).toHaveCount(0)
}

async function signOutAndRestart(name) {
  await page.getByRole('button', { name: /^Abrir cuenta y espacios/ }).filter({ visible: true }).first().click()
  await page.getByRole('button', { name: 'Cerrar sesión', exact: true }).click()
  await expectCredentialLogin()
  // Preserve a real personal-page entry in history, then try returning to it.
  await page.goBack()
  await expectCredentialLogin()
  await context.close()
  await openApp()
  await expectCredentialLogin()
  for (const route of ['/dashboard', '/onboarding', '/settings/almacenamiento', '/notifications']) {
    await page.goto(`${origin}${route}`)
    await expectCredentialLogin()
  }
  await page.getByLabel('Correo electrónico', { exact: true }).fill('logout-check@example.invalid')
  await page.getByLabel('Contraseña', { exact: true }).fill('sample-password')
  await page.getByLabel('Contraseña', { exact: true }).press('Enter')
  await expect(page.locator('form [role="alert"]')).toContainText(/conexión|internet/i)
  await expectCredentialLogin()
  assert.equal((await storedAccountSnapshot(page)).active, null)
  await page.evaluate(() => { window.testOnline = true; window.dispatchEvent(new Event('online')) })
  await expectCredentialLogin()
  await expect(page.getByRole('button', { name: 'Iniciar sesión', exact: true })).toBeEnabled()
  // Reconnection without credentials must not restore the cached selection.
  assert.equal((await storedAccountSnapshot(page)).active, null)
  await page.goto(`${origin}/dashboard`)
  await expectCredentialLogin()
  await page.screenshot({ path: `${artifacts}/${name}-after-restart.png`, fullPage: true })
}

try {
  await openApp()
  await expectCredentialLogin()
  await installAccountFixture(page, await newTestAccount({ linked: false }))
  await page.goto(`${origin}/onboarding`)
  await page.getByLabel('Nombre completo', { exact: true }).fill('Prueba cierre')
  await page.getByLabel('Nombre de usuario', { exact: true }).fill('prueba_cierre')
  await page.getByRole('button', { name: /Ganar músculo/ }).click()
  await page.getByRole('button', { name: /Principiante/ }).click()
  await page.getByRole('button', { name: 'Continuar con mi disponibilidad', exact: true }).click()
  await page.getByRole('button', { name: '3', exact: true }).click()
  await page.getByRole('button', { name: '45 min', exact: true }).click()
  await page.getByRole('button', { name: 'Caminar', exact: true }).click()
  await page.getByRole('button', { name: /Algo de actividad/ }).click()
  await page.getByRole('button', { name: 'Continuar con mi espacio', exact: true }).click()
  await page.getByRole('button', { name: /Gimnasio completo/ }).click()
  await page.getByRole('button', { name: 'Continuar con seguridad', exact: true }).click()
  await page.getByRole('button', { name: 'Revisar mi información', exact: true }).click()
  await page.getByRole('button', { name: 'Mujer', exact: true }).click()
  await page.getByLabel('Edad', { exact: true }).fill('30')
  await page.getByLabel('Peso (kg)', { exact: true }).fill('65')
  await page.getByLabel('Altura (cm)', { exact: true }).fill('168')
  await page.getByRole('button', { name: 'Generar mi plan automáticamente', exact: true }).click()
  await expect(page).toHaveURL(/\/dashboard$/, { timeout: 45000 })
  const saved = await storedAccountSnapshot(page)
  assert.ok(saved.accounts[0].tables.workout_plans.length > 0)
  await page.goto(`${origin}/plan`)
  await page.locator('[data-plan-library]').waitFor()
  await signOutAndRestart('local')
  assert.deepEqual(await storedAccountSnapshot(page), { active: null, accounts: saved.accounts })
  console.log('PASS legacy local logout requires credentials after back/restart/direct routes, offline submit and reconnection; all data retained')

  // Emulate an already downloaded linked account without contacting a real service.
  const linked = structuredClone(saved.accounts[0])
  linked.remoteUserId = linked.accountId
  linked.email = 'logout-check@example.invalid'
  await page.goto(`${origin}/login`)
  await expectCredentialLogin()
  await installAccountFixture(page, linked)
  await context.close()
  await openApp()
  await expect(page).toHaveURL(/\/dashboard$/)
  await page.goto(`${origin}/plan`)
  await page.locator('[data-plan-library]').waitFor()
  await signOutAndRestart('linked')
  assert.deepEqual(await storedAccountSnapshot(page), { active: null, accounts: [linked] })
  console.log('PASS linked logout requires credentials after back/restart/direct routes, offline submit and reconnection; all data retained')
  assert.deepEqual(errors, [])
  await writeFile(`${artifacts}/report.json`, JSON.stringify({ passed: true, cases: ['legacy local logout and full restart', 'linked logout and full restart', 'back navigation remains signed out', 'dashboard/onboarding/storage/notifications redirect', 'exact cached data preservation', 'no offline profile creation/recovery/selection', 'offline credential submit stays signed out', 'reconnection alone stays signed out'], pageErrors: errors }, null, 2))
} catch (error) {
  await page?.screenshot({ path: `${artifacts}/failure.png`, fullPage: true }).catch(() => {})
  throw error
} finally { await context?.close() }
