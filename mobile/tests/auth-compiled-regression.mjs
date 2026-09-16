import { chromium, expect } from '@playwright/test'
import { loadEnv } from 'vite'
import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { newTestAccount, storedAccountSnapshot } from './account-fixture.mjs'

const origin = process.env.MOBILE_PREVIEW_URL || 'http://127.0.0.1:4178'
// Read the configured public origin without printing the API key or session tokens.
const backend = new URL(loadEnv('production', 'mobile').VITE_SUPABASE_URL).origin
const artifacts = '.artifacts/auth-compiled-regression'
await mkdir(artifacts, { recursive: true })
const now = new Date('2026-09-15T16:00:00Z')
const browser = await chromium.launch({ headless: true })
const report = { integration: 'Compiled Android bundle, real Supabase JS auth client, strict intercepted HTTP fixtures, fresh browser storage; no account fixture installation', scenarios: [], realEmailSent: false, realRemoteStateModified: false }
const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url')

async function scenario(name, onboardingDone, work) {
  const state = await newTestAccount()
  state.email = `${name}@example.invalid`
  Object.assign(state.tables.profiles[0], { full_name: 'Perfil HTTP de auditoría', onboarding_done: onboardingDone, readiness_status: 'cleared', timezone: 'UTC', username: `audit_${name.replaceAll('-', '_')}` })
  const user = { id: state.accountId, aud: 'authenticated', role: 'authenticated', email: state.email, email_confirmed_at: now.toISOString(), created_at: now.toISOString(), app_metadata: { provider: 'email', providers: ['email'] }, user_metadata: { preferred_language: 'es' }, identities: [{ identity_id: state.accountId, id: state.accountId, user_id: state.accountId, provider: 'email', identity_data: { email: state.email } }] }
  const expiresAt = Math.floor(now.getTime()/1000)+3600
  const token = `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ sub: user.id, aud: 'authenticated', role: 'authenticated', exp: expiresAt, iat: expiresAt-3600 })}.fixture-signature`
  const session = { access_token: token, refresh_token: 'synthetic-fixture-refresh', token_type: 'bearer', expires_in: 3600, expires_at: expiresAt, user }
  const item = { name, passed: false, checks: [], requests: [], pageErrors: [], unexpected: [], screenshots: [] }
  const model = { loginAttempts: 0, otpAttempts: 0, resendAttempts: 0, signupAttempts: 0 }
  const context = await browser.newContext({ viewport: { width: 390, height: 900 }, isMobile: true, hasTouch: true, reducedMotion: 'reduce' })
  await context.addInitScript(() => Object.defineProperty(navigator, 'onLine', { get: () => true }))
  await context.route('**/*', async route => {
    const req = route.request(), url = new URL(req.url()), method = req.method()
    const fulfill = (body, status=200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body), headers: { 'access-control-allow-origin': origin, 'access-control-allow-headers': '*', 'access-control-allow-methods': 'GET,POST,OPTIONS', 'x-supabase-api-version': '2024-01-01' } })
    if (url.origin === origin) {
      if (url.pathname === '/api/analytics' && method === 'POST') return fulfill({}, 202)
      return route.continue()
    }
    if (url.origin !== backend) { item.unexpected.push({ method, path: url.pathname, reason: 'External origin not configured' }); return route.abort() }
    if (method === 'OPTIONS') return fulfill(null)
    item.requests.push({ method, path: url.pathname, query: url.search })
    const body = req.postDataJSON?.() ?? null
    if (url.pathname === '/auth/v1/token' && method === 'POST' && url.searchParams.get('grant_type') === 'password') {
      model.loginAttempts++
      if (body.email !== state.email || body.password !== 'SyntheticPass2026!') return fulfill({ code: 'invalid_credentials', msg: 'Invalid login credentials' }, 400)
      return fulfill(session)
    }
    if (url.pathname === '/auth/v1/signup' && method === 'POST') {
      model.signupAttempts++
      assert.equal(body.email, state.email)
      assert.equal(body.data.preferred_language, 'es')
      return fulfill({ ...user, email_confirmed_at: undefined, confirmation_sent_at: now.toISOString() })
    }
    if (url.pathname === '/auth/v1/verify' && method === 'POST') {
      model.otpAttempts++
      assert.equal(body.email, state.email); assert.equal(body.type, 'signup')
      if (body.token !== '87654321') return fulfill({ code: 'otp_expired', msg: 'Token has expired or is invalid' }, 403)
      return fulfill(session)
    }
    if (url.pathname === '/auth/v1/resend' && method === 'POST') {
      model.resendAttempts++
      assert.equal(body.email, state.email); assert.equal(body.type, 'signup')
      if (model.resendAttempts === 1) return fulfill({ code: 'over_email_send_rate_limit', msg: 'For security purposes, you can only request this after 60 seconds.' }, 429)
      return fulfill({})
    }
    if (url.pathname === '/auth/v1/user' && method === 'GET') { assert.equal(req.headers().authorization, `Bearer ${token}`); return fulfill(user) }
    if (url.pathname === '/rest/v1/rpc/original_app_snapshot_read_v1' && method === 'POST') return fulfill([])
    if (url.pathname === '/rest/v1/rpc/get_fitness_card_state' && method === 'POST') return fulfill({ viewerId: state.accountId, own: null, received: [], access: [] })
    if (url.pathname === '/rest/v1/rpc/get_companion_state' && method === 'POST') return fulfill({ viewerId: state.accountId, status: 'none', relationship: null, self: null, partner: null, greeting: null, receivedGreeting: null, nextGreetingAt: null, fetchedAt: now.toISOString() })
    if (url.pathname === '/rest/v1/product_notifications' && ['GET', 'HEAD'].includes(method)) {
      assert.equal(url.searchParams.get('user_id'), `eq.${state.accountId}`)
      return route.fulfill({ status: 200, contentType: 'application/json', body: method === 'HEAD' ? '' : '[]', headers: { 'access-control-allow-origin': origin, 'access-control-allow-headers': '*', 'access-control-expose-headers': 'content-range', 'content-range': '*/0' } })
    }
    const table = /^\/rest\/v1\/([a-z_]+)$/.exec(url.pathname)?.[1]
    if (method === 'GET' && ['profiles','workout_plans','workouts','progress_logs','measurements','exercises','trainer_profiles','coaching_relationships','trainer_plan_assignments'].includes(table)) {
      assert.equal(req.headers().authorization, `Bearer ${token}`)
      if (table === 'profiles') assert.equal(url.searchParams.get('id'), `eq.${state.accountId}`)
      else if (['workout_plans','workouts','progress_logs','measurements','trainer_profiles'].includes(table)) assert.equal(url.searchParams.get('user_id'), `eq.${state.accountId}`)
      else if (['coaching_relationships','trainer_plan_assignments'].includes(table)) assert.equal(url.searchParams.get('client_user_id'), `eq.${state.accountId}`)
      else assert.equal(url.searchParams.get('is_public'), 'eq.true')
      return fulfill(state.tables[table] ?? [])
    }
    item.unexpected.push({ method, path: url.pathname, reason: 'Unconfigured backend request' })
    return fulfill({ code: 'TEST_UNEXPECTED_REQUEST', message: 'Unconfigured auth fixture request' }, 418)
  })
  const page = await context.newPage()
  page.setDefaultTimeout(12000)
  await page.clock.install({ time: now })
  page.on('pageerror', error => item.pageErrors.push(error.message))
  const shot = async suffix => { const path = `${artifacts}/auth-${name}-${suffix}.png`; await page.screenshot({ path, fullPage: true }); item.screenshots.push(path) }
  try {
    await work({ page, state, model, item, shot })
    item.finalStorage = await storedAccountSnapshot(page)
    assert.equal(item.finalStorage.active, state.accountId)
    assert.equal(item.finalStorage.accounts.length, 1)
    assert.equal(item.finalStorage.accounts[0].accountId, state.accountId)
    assert.equal(item.finalStorage.accounts[0].remoteUserId, state.accountId)
    assert.deepEqual(item.pageErrors, [])
    assert.deepEqual(item.unexpected, [])
    item.passed = true
    console.log(`PASS ${name}: ${item.checks.join('; ')}`)
  } catch (error) {
    item.error = String(error?.stack || error)
    item.bodyText = await page.locator('body').innerText().catch(() => '')
    await shot('failure').catch(() => {})
    console.error(item.error)
    console.error(item.bodyText.slice(-3500))
    process.exitCode = 1
  } finally {
    item.attempts = model
    report.scenarios.push(item)
    await context.close()
  }
}

try {
  await scenario('login-http', true, async ({ page, state, model, item, shot }) => {
    await page.goto(`${origin}/login`)
    const submit = page.getByRole('button', { name: 'Iniciar sesión', exact: true })
    await page.getByLabel('Correo electrónico', { exact: true }).fill('invalid')
    await submit.click()
    await expect(page.getByText('Escribe un correo válido.', { exact: true })).toBeVisible()
    await expect(page.getByText('Escribe tu contraseña.', { exact: true })).toBeVisible()
    assert.equal(model.loginAttempts, 0)
    item.checks.push('Invalid email and missing password rejected before HTTP')
    await page.getByLabel('Correo electrónico', { exact: true }).fill(state.email)
    await page.getByLabel('Contraseña', { exact: true }).fill('WrongSyntheticPassword')
    await submit.click()
    await expect(page.getByRole('alert')).toHaveText('Correo o contraseña incorrectos.')
    await expect(submit).toBeEnabled()
    assert.equal(model.loginAttempts, 1)
    const unauthenticated = await storedAccountSnapshot(page)
    assert.equal(unauthenticated.active, null); assert.equal(unauthenticated.accounts.length, 0)
    item.checks.push('SDK invalid_credentials shown, retry enabled, no local account activated')
    await shot('invalid-credentials')
    await page.getByLabel('Contraseña', { exact: true }).fill('SyntheticPass2026!')
    await submit.click()
    await expect(page).toHaveURL(`${origin}/dashboard`)
    await expect(page.getByRole('navigation', { name: 'Navegación principal', exact: true })).toBeVisible()
    await expect(page.getByRole('link', { name: /A tu manera Registrar entrenamiento/ })).toBeVisible()
    assert.equal(model.loginAttempts, 2)
    item.checks.push('Valid retry completes SDK session, canonical download and dashboard navigation')
    await page.reload()
    await expect(page.getByRole('navigation', { name: 'Navegación principal', exact: true })).toBeVisible()
    await expect(page.getByRole('link', { name: /A tu manera Registrar entrenamiento/ })).toBeVisible()
    item.checks.push('Session/profile survives compiled-app reload')
    await shot('dashboard')
  })

  await scenario('signup-otp-http', false, async ({ page, state, model, item, shot }) => {
    await page.goto(`${origin}/login`)
    await page.getByRole('link', { name: 'Crear cuenta', exact: true }).click()
    await expect(page).toHaveURL(`${origin}/register`)
    await page.getByLabel('Correo electrónico', { exact: true }).fill(state.email)
    await page.getByLabel('Contraseña', { exact: true }).fill('short')
    await page.getByRole('button', { name: 'Crear cuenta', exact: true }).click()
    await expect(page.getByText(/La contraseña necesita:/)).toBeVisible()
    assert.equal(model.signupAttempts, 0)
    item.checks.push('Weak signup password rejected before HTTP')
    await page.getByLabel('Contraseña', { exact: true }).fill('SyntheticPass2026!')
    await page.getByRole('button', { name: 'Crear cuenta', exact: true }).click()
    const otp = page.getByLabel('Código de verificación', { exact: true })
    const verify = page.getByRole('button', { name: 'Verificar y continuar', exact: true })
    await expect(otp).toBeVisible()
    assert.equal(model.signupAttempts, 1)
    let pending = await storedAccountSnapshot(page)
    assert.equal(pending.active, null); assert.equal(pending.accounts.length, 0)
    item.checks.push('Signup without session opens OTP and does not activate account')
    await shot('verification-screen')
    await otp.fill('123'); await verify.click()
    await expect(page.getByRole('alert')).toHaveText('Ingresa el código de 8 dígitos.')
    assert.equal(model.otpAttempts, 0)
    item.checks.push('Short OTP rejected locally')
    await otp.fill('12345678'); await verify.click()
    await expect(page.getByRole('alert')).toHaveText('El código expiró o no es válido. Reenvía uno nuevo.')
    await expect(verify).toBeEnabled(); await expect(otp).toBeEnabled()
    assert.equal(model.otpAttempts, 1)
    item.checks.push('Invalid OTP HTTP response shown; input and retry remain usable')
    await shot('invalid-otp')
    for (let second=0; second<46; second++) await page.clock.runFor(1000)
    const resend = page.getByRole('button', { name: 'Reenviar código', exact: true })
    await expect(resend).toBeEnabled(); await resend.click()
    await expect(page.getByRole('alert')).toHaveText('Espera un momento antes de pedir otro código.')
    await expect(resend).toBeEnabled()
    assert.equal(model.resendAttempts, 1)
    item.checks.push('Resend cooldown and HTTP rate-limit feedback operate')
    await resend.click()
    await expect(page.getByText('Código reenviado', { exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: /Reenviar código en/ })).toBeDisabled()
    assert.equal(model.resendAttempts, 2)
    item.checks.push('Successful resend shows feedback and resets cooldown')
    await otp.fill('87654321'); await verify.click()
    await expect(page).toHaveURL(`${origin}/onboarding`)
    await expect(page.getByLabel('Nombre completo', { exact: true })).toBeVisible()
    assert.equal(model.otpAttempts, 2)
    pending = await storedAccountSnapshot(page)
    assert.equal(pending.active, state.accountId)
    assert.equal(pending.accounts[0].tables.profiles[0].onboarding_done, false)
    assert.equal(pending.accounts[0].tables.exercises.length, state.tables.exercises.length)
    item.checks.push('Valid OTP creates SDK session, prepares SQLite account, downloads profile/catalog, opens onboarding')
    await page.reload()
    await expect(page.getByLabel('Nombre completo', { exact: true })).toBeVisible()
    item.checks.push('New verified account survives reload at onboarding')
    await shot('verified-onboarding')
  })
} finally {
  report.passed = report.scenarios.length === 2 && report.scenarios.every(item => item.passed)
  report.limits = ['All Supabase HTTP responses were synthetic and intercepted; no email was sent and no remote state changed.', 'No real SMTP delivery, real OTP generation/expiry configuration, Supabase RLS or physical Android WebView authentication was validated.', 'The login scenario reaches the dashboard for a complete downloaded profile; signup reaches the onboarding form for a new verified profile.']
  await writeFile(`${artifacts}/auth-compiled-e2e.json`, JSON.stringify(report, null, 2))
  await browser.close()
}
