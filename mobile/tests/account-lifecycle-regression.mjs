import { chromium, expect } from '@playwright/test'
import { loadEnv } from 'vite'
import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { installAccountFixture, newTestAccount, storedAccountSnapshot } from './account-fixture.mjs'

const origin = process.env.MOBILE_PREVIEW_URL || 'http://127.0.0.1:4178'
const configured = loadEnv('production', 'mobile')
const backend = new URL(configured.VITE_SUPABASE_URL).origin
const api = new URL(configured.VITE_ACCOUNT_API_URL).origin
const out = '.artifacts/account-lifecycle-regression'
await mkdir(out, { recursive: true })
const browser = await chromium.launch({ headless: true })
const reports = []
const now = new Date('2026-09-15T16:00:00Z')
const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url')

async function scenario(name, work) {
  const state = await newTestAccount()
  Object.assign(state.tables.profiles[0], { full_name: 'Cuenta verificable', onboarding_done: true, readiness_status: 'cleared', language: 'es', timezone: 'UTC' })
  const user = { id: state.accountId, email: state.email, aud: 'authenticated', role: 'authenticated', email_confirmed_at: now.toISOString(), created_at: now.toISOString(), app_metadata: { provider: 'email', providers: ['email'] }, user_metadata: {}, identities: [] }
  const expiresAt = Math.floor(now.getTime() / 1000) + 3600
  const token = `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ sub: user.id, aud: 'authenticated', role: 'authenticated', exp: expiresAt })}.synthetic`
  const session = { access_token: token, refresh_token: 'synthetic-lifecycle-refresh', token_type: 'bearer', expires_in: 3600, expires_at: expiresAt, user }
  const report = { name, passed: false, checks: [], requests: [], unexpected: [], errors: [] }
  const model = { verifyAttempts: 0, deletes: 0, updates: 0, recovers: 0, deleteMode: 'failure' }
  reports.push(report)
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' })
  await context.addInitScript(() => Object.defineProperty(navigator, 'onLine', { get: () => true }))
  await context.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url()), method = request.method()
    const fulfill = (body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body), headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'GET,POST,PUT,OPTIONS', 'x-supabase-api-version': '2024-01-01' } })
    if (url.origin === origin) return url.pathname === '/api/analytics' ? fulfill({}, 202) : route.continue()
    report.requests.push({ method, path: url.pathname })
    if ([backend, api].includes(url.origin) && method === 'OPTIONS') return fulfill({})
    if (url.origin === api && url.pathname === '/api/account/delete' && method === 'POST') {
      assert.deepEqual(request.postDataJSON(), { confirmText: 'ELIMINAR' })
      assert.equal(request.headers().authorization, `Bearer ${token}`)
      model.deletes++
      return model.deleteMode === 'failure' ? fulfill({ ok: false, code: 'delete_failed' }, 503)
        : model.deleteMode === 'wrong-owner' ? fulfill({ ok: true, accountId: 'different-account' })
          : fulfill({ ok: true, accountId: state.accountId })
    }
    if (url.origin === backend) {
      if (url.pathname === '/auth/v1/user' && method === 'GET') return fulfill(user)
      if (url.pathname === '/auth/v1/recover' && method === 'POST') {
        assert.equal(request.postDataJSON().email, state.email)
        model.recovers++; return fulfill({})
      }
      if (url.pathname === '/auth/v1/verify' && method === 'POST') {
        const body = request.postDataJSON()
        assert.equal(body.type, 'recovery'); assert.equal(body.email, state.email)
        model.verifyAttempts++
        return model.verifyAttempts === 1 ? fulfill({ code: 'otp_expired', message: 'Token has expired or is invalid' }, 403) : fulfill(session)
      }
      if (url.pathname === '/auth/v1/user' && method === 'PUT') {
        assert.deepEqual(request.postDataJSON(), { password: 'NewSyntheticPassword123!', code_challenge: null, code_challenge_method: null })
        model.updates++; return fulfill(user)
      }
      if (url.pathname === '/auth/v1/logout' && method === 'POST') return fulfill({})
      if (url.pathname === '/rest/v1/rpc/get_fitness_card_state' && method === 'POST') {
        assert.deepEqual(request.postDataJSON(), {}); return fulfill({ viewerId: user.id, own: null, received: [], access: [] })
      }
      if (url.pathname === '/rest/v1/rpc/get_companion_state' && method === 'POST') {
        assert.deepEqual(request.postDataJSON(), {})
        return fulfill({ viewerId: user.id, status: 'none', relationship: null, self: { completedSessions: 0, goal: 1, weekStart: '2026-09-14', weekEnd: '2026-09-20', timeZone: 'UTC', updatedAt: now.toISOString() }, partner: null, greeting: null, nextGreetingAt: null, fetchedAt: now.toISOString() })
      }
      if (url.pathname === '/rest/v1/product_notifications' && ['GET', 'HEAD'].includes(method)) {
        assert.equal(url.searchParams.get('user_id'), `eq.${user.id}`)
        return route.fulfill({ status: 200, contentType: 'application/json', body: method === 'HEAD' ? '' : '[]', headers: { 'access-control-allow-origin': '*', 'access-control-expose-headers': 'content-range', 'content-range': '*/0' } })
      }
    }
    report.unexpected.push({ method, path: url.pathname, origin: url.origin }); return route.abort()
  })
  const page = await context.newPage()
  page.setDefaultTimeout(15000)
  page.on('pageerror', error => report.errors.push(error.message))
  await page.clock.setFixedTime(now)
  try {
    await page.goto(`${origin}/login`)
    await expect(page.getByLabel('Correo electrónico', { exact: true })).toBeVisible()
    await installAccountFixture(page, state)
    await work({ page, state, session, model, report })
    assert.deepEqual(report.unexpected, [])
    assert.deepEqual(report.errors, [])
    report.passed = true
    console.log(`PASS ${name}`)
  } catch (error) {
    report.failure = String(error.stack || error)
    await page.screenshot({ path: `${out}/${name}-failure.png`, fullPage: true })
    throw error
  } finally { await context.close() }
}
try {
  await scenario('password-recovery', async ({ page, state, report, model }) => {
    const before = await storedAccountSnapshot(page)
    await page.getByRole('link', { name: '¿Olvidaste tu contraseña?', exact: true }).click()
    await page.getByLabel('Correo electrónico', { exact: true }).fill(state.email)
    await page.getByRole('button', { name: 'Enviar código de recuperación', exact: true }).click()
    await expect(page.getByLabel('Código de recuperación', { exact: true })).toBeVisible()
    assert.equal(model.recovers, 1)
    await page.getByLabel('Código de recuperación', { exact: true }).fill('12345678')
    await page.getByRole('button', { name: 'Verificar código', exact: true }).click()
    await expect(page.getByRole('alert')).toContainText('caducado')
    assert.equal(model.updates, 0)
    await page.reload()
    await page.getByLabel('Correo electrónico', { exact: true }).fill(state.email)
    await page.getByRole('button', { name: 'Ya tengo un código', exact: true }).click()
    await page.getByLabel('Código de recuperación', { exact: true }).fill('87654321')
    await page.getByRole('button', { name: 'Verificar código', exact: true }).click()
    await page.getByLabel('Nueva contraseña', { exact: true }).fill('NewSyntheticPassword123!')
    await page.getByLabel('Repite la nueva contraseña', { exact: true }).fill('OtherSyntheticPassword123!')
    await page.getByRole('button', { name: 'Guardar nueva contraseña', exact: true }).click()
    await expect(page.getByRole('alert')).toContainText('no coinciden')
    assert.equal(model.updates, 0)
    await page.getByLabel('Repite la nueva contraseña', { exact: true }).fill('NewSyntheticPassword123!')
    await page.getByRole('button', { name: 'Guardar nueva contraseña', exact: true }).click()
    await expect(page.getByRole('status')).toContainText('Contraseña actualizada')
    assert.equal(model.updates, 1)
    assert.deepEqual(await storedAccountSnapshot(page), before)
    assert.equal(await page.evaluate(() => localStorage.getItem('vekira-original-auth')), null)
    assert.equal(await page.evaluate(() => localStorage.getItem('vekira-password-recovery-ephemeral')), null)
    report.checks.push('Request, expired OTP, reload/resume, mismatch, verified update; local account and auth untouched')
    await page.screenshot({ path: `${out}/recovery-success.png`, fullPage: true })
  })
  await scenario('backup-restore', async ({ page, state, session, report }) => {
    await page.evaluate(session => localStorage.setItem('vekira-original-auth', JSON.stringify(session)), session)
    await page.goto(`${origin}/settings/almacenamiento`)
    const original = (await storedAccountSnapshot(page)).accounts[0]
    const download = page.waitForEvent('download')
    await page.getByRole('button', { name: 'Exportar respaldo', exact: true }).click()
    const path = await (await download).path()
    await page.goto(`${origin}/medidas`)
    await page.getByRole('button', { name: 'Registrar', exact: true }).click()
    await page.getByRole('dialog').getByLabel('Peso (kg)', { exact: true }).fill('82')
    await page.getByRole('dialog').getByRole('button', { name: 'Guardar', exact: true }).click()
    await expect(page.getByRole('dialog')).toBeHidden()
    const changed = (await storedAccountSnapshot(page)).accounts[0]
    assert.equal(changed.tables.measurements.length, 1)
    await page.goto(`${origin}/settings/almacenamiento`)
    await page.getByLabel('Importar respaldo', { exact: true }).setInputFiles(path)
    await expect(page.getByRole('heading', { name: 'Revisar antes de restaurar', exact: true })).toBeVisible()
    const restore = page.getByRole('button', { name: 'Reemplazar con este respaldo', exact: true })
    await expect(restore).toBeDisabled()
    assert.deepEqual((await storedAccountSnapshot(page)).accounts[0].tables, changed.tables)
    await page.getByRole('button', { name: 'Cancelar', exact: true }).click()
    await expect(restore).toHaveCount(0)
    assert.deepEqual((await storedAccountSnapshot(page)).accounts[0].tables, changed.tables)
    await page.getByLabel('Importar respaldo', { exact: true }).setInputFiles(path)
    await page.getByRole('checkbox', { name: 'Entiendo que esta copia reemplaza los datos actuales de esta cuenta.', exact: true }).check()
    await restore.click()
    await expect(page.getByRole('status').filter({ hasText: 'Respaldo restaurado en este dispositivo.' })).toBeVisible()
    const restored = (await storedAccountSnapshot(page)).accounts[0]
    assert.deepEqual(restored.tables, original.tables)
    assert.ok(restored.revision > changed.revision)
    await page.reload()
    await page.getByRole('button', { name: 'Revisar datos anteriores', exact: true }).click()
    await page.getByRole('checkbox', { name: 'Entiendo que esta copia reemplaza los datos actuales de esta cuenta.', exact: true }).check()
    await restore.click()
    await expect(page.getByRole('status').filter({ hasText: 'Respaldo restaurado en este dispositivo.' })).toBeVisible()
    assert.deepEqual((await storedAccountSnapshot(page)).accounts[0].tables, changed.tables)
    await page.getByLabel('Importar respaldo', { exact: true }).setInputFiles({ name: 'invalid.json', mimeType: 'application/json', buffer: Buffer.from('{}') })
    await expect(page.getByRole('status').filter({ hasText: 'no es un respaldo válido' })).toBeVisible()
    assert.deepEqual((await storedAccountSnapshot(page)).accounts[0].tables, changed.tables)
    const foreign = await newTestAccount()
    await page.getByLabel('Importar respaldo', { exact: true }).setInputFiles({ name: 'foreign.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ format: 'vekira-original-app-backup', version: 1, state: foreign })) })
    await expect(page.getByRole('status').filter({ hasText: 'pertenece a otra cuenta' })).toBeVisible()
    assert.deepEqual((await storedAccountSnapshot(page)).accounts[0].tables, changed.tables)
    report.checks.push('Export; changed data; preview/cancel; confirmed replacement; recovery after reload; malformed and foreign backup rejection')
    await page.screenshot({ path: `${out}/backup-restore.png`, fullPage: true })
  })
  await scenario('account-deletion', async ({ page, state, session, model, report }) => {
    await page.evaluate(session => localStorage.setItem('vekira-original-auth', JSON.stringify(session)), session)
    await page.goto(`${origin}/settings/cuenta`)
    const before = await storedAccountSnapshot(page)
    async function submit() {
      const start = page.getByRole('button', { name: 'Eliminar mi cuenta', exact: true })
      await start.click()
      const button = page.getByRole('button', { name: 'Eliminar definitivamente', exact: true })
      await page.getByPlaceholder('ELIMINAR', { exact: true }).fill('ELIMINAR')
      await button.click()
    }
    await submit()
    await expect.poll(() => model.deletes).toBe(1)
    await expect(page.getByText(/No se pudo eliminar la cuenta|No se pudo confirmar|No pudimos eliminar/).first()).toBeVisible()
    assert.deepEqual(await storedAccountSnapshot(page), before)
    model.deleteMode = 'wrong-owner'
    await page.goto(`${origin}/settings/cuenta`)
    await submit()
    await expect.poll(() => model.deletes).toBe(2)
    await expect(page.getByText(/No se pudo confirmar la eliminación/).first()).toBeVisible()
    assert.deepEqual(await storedAccountSnapshot(page), before)
    model.deleteMode = 'success'
    await page.goto(`${origin}/settings/cuenta`)
    await submit()
    await expect(page).toHaveURL(/\/login\b/)
    await expect(page.getByLabel('Correo electrónico', { exact: true })).toBeVisible()
    const after = await storedAccountSnapshot(page)
    assert.equal(after.active, null)
    assert.equal(after.accounts.some(account => account.accountId === state.accountId), false)
    assert.equal(await page.evaluate(() => localStorage.getItem('vekira-original-auth')), null)
    await page.reload()
    await expect(page.getByLabel('Correo electrónico', { exact: true })).toBeVisible()
    assert.equal((await storedAccountSnapshot(page)).accounts.length, 0)
    report.checks.push('Server failure and wrong-owner acknowledgement preserve data; confirmed deletion clears account/session and survives reload')
    await page.screenshot({ path: `${out}/deletion-success.png`, fullPage: true })
  })
} finally {
  await writeFile(`${out}/results.json`, JSON.stringify({ realRemoteChanges: false, reports }, null, 2))
  await browser.close()
}
