import { chromium, expect } from '@playwright/test'
import { loadEnv } from 'vite'
import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { installAccountFixture, newTestAccount, storedAccountSnapshot } from './account-fixture.mjs'

const origin = process.env.MOBILE_PREVIEW_URL || 'http://127.0.0.1:4178'
const configured = loadEnv('production', 'mobile')
const backend = new URL(configured.VITE_SUPABASE_URL).origin
const out = '.artifacts/connected-boundaries-regression'
const now = new Date('2026-09-16T16:00:00Z')
const report = { passed: false, checks: [], requests: [], handoffs: [], unexpected: [], errors: [] }
assert.ok(['127.0.0.1', 'localhost'].includes(new URL(origin).hostname))
assert.ok(new URL(backend).hostname.endsWith('.invalid'), 'Use the synthetic harness backend')
await mkdir(out, { recursive: true })
const browser = await chromium.launch({ headless: true })
try {
  for (const language of ['es', 'en']) {
    const state = await newTestAccount()
    Object.assign(state.tables.profiles[0], { full_name: 'Connected boundary fixture', onboarding_done: true, readiness_status: 'cleared', language, timezone: 'UTC' })
    const trainer = { id: '00000000-0000-4000-8000-000000000101', user_id: state.accountId, status: 'active', slug: 'fixture-coach', professional_name: 'Fixture Coach', professional_photo_url: null, bio: 'Entrenamiento progresivo y personalizado para mejorar la fuerza con hábitos sostenibles.', specialties: ['Fuerza'], modalities: ['online'], experience_summary: 'Ocho años de experiencia profesional en entrenamiento de fuerza.', general_location: null, languages: ['Español'], verified_at: now.toISOString() }
    state.tables.trainer_profiles = [trainer]
    const user = { id: state.accountId, email: state.email, aud: 'authenticated', role: 'authenticated', created_at: now.toISOString(), app_metadata: { provider: 'email', providers: ['email'] }, user_metadata: {} }
    const exp = Math.floor(now.getTime() / 1000) + 3600
    const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url')
    const token = `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ sub: user.id, aud: 'authenticated', role: 'authenticated', exp })}.synthetic`
    const session = { access_token: token, refresh_token: 'synthetic-connected-refresh', token_type: 'bearer', expires_in: 3600, expires_at: exp, user }
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce', serviceWorkers: 'block' })
    await context.addInitScript(() => {
      window.fixtureOnline = sessionStorage.getItem('connected-fixture-online') === '1'
      Object.defineProperty(navigator, 'onLine', { get: () => window.fixtureOnline })
    })
    await context.route('**/*', async route => {
      const request = route.request(), url = new URL(request.url()), method = request.method()
      const fulfill = (body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body), headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'GET,HEAD,POST,OPTIONS' } })
      if (url.origin === origin && url.pathname === '/api/analytics') return fulfill({}, 202)
      if (url.origin === origin && ['GET', 'HEAD'].includes(method) && !url.pathname.startsWith('/api/')) return route.continue()
      report.requests.push({ language, method, path: url.pathname, origin: url.origin })
      if (url.origin === backend && method === 'OPTIONS') return fulfill({})
      if (url.origin === backend) {
        assert.equal(request.headers().authorization, `Bearer ${token}`)
        if (method === 'GET' && url.pathname === '/auth/v1/user') return fulfill(user)
        if (method === 'GET' && url.pathname === '/rest/v1/profiles') {
          assert.equal(url.searchParams.get('id'), `eq.${user.id}`)
          return fulfill({ id: user.id, onboarding_done: true, weight_kg: 75 })
        }
        if (method === 'GET' && url.pathname === '/rest/v1/trainer_profiles') {
          assert.equal(url.searchParams.get('user_id'), `eq.${user.id}`)
          return fulfill(trainer)
        }
        if (method === 'GET' && url.pathname === '/rest/v1/trainer_applications') {
          assert.equal(url.searchParams.get('user_id'), `eq.${user.id}`)
          assert.equal(url.searchParams.get('application_kind'), 'eq.profile_update')
          return fulfill(null)
        }
        if (method === 'POST' && url.pathname === '/rest/v1/rpc/get_fitness_card_state') {
          assert.deepEqual(request.postDataJSON(), {})
          return fulfill({ viewerId: user.id, own: null, received: [], access: [] })
        }
        if (method === 'POST' && url.pathname === '/rest/v1/rpc/get_companion_state') {
          assert.deepEqual(request.postDataJSON(), {})
          return fulfill({ viewerId: user.id, status: 'none', relationship: null, self: { completedSessions: 0, goal: 1, weekStart: '2026-09-14', weekEnd: '2026-09-20', timeZone: 'UTC', updatedAt: now.toISOString() }, partner: null, greeting: null, nextGreetingAt: null, fetchedAt: now.toISOString() })
        }
        if (['GET', 'HEAD'].includes(method) && url.pathname === '/rest/v1/product_notifications') {
          assert.equal(url.searchParams.get('user_id'), `eq.${user.id}`)
          return route.fulfill({ status: 200, contentType: 'application/json', body: method === 'HEAD' ? '' : '[]', headers: { 'access-control-allow-origin': '*', 'access-control-expose-headers': 'content-range', 'content-range': '*/0' } })
        }
      }
      report.unexpected.push({ language, method, path: url.pathname, origin: url.origin })
      return route.abort()
    })
    const page = await context.newPage()
    page.setDefaultTimeout(15000)
    page.on('pageerror', error => report.errors.push(error.message))
    page.on('popup', popup => { report.handoffs.push(popup.url()); void popup.close() })
    await page.clock.setFixedTime(now)
    try {
      await page.goto(`${origin}/login`)
      await expect(page.getByLabel('Correo electrónico', { exact: true })).toBeVisible()
      await installAccountFixture(page, state)
      await page.evaluate(session => localStorage.setItem('vekira-original-auth', JSON.stringify(session)), session)
      const before = await storedAccountSnapshot(page)
      const linkName = language === 'en' ? 'Open on the web' : 'Abrir en la web'
      for (const path of ['/chat', '/coach/apply', '/coach/profile', '/admin', '/admin/users']) {
        const requestsBeforeOffline = report.requests.length
        await page.goto(`${origin}${path}?access_token=never-forward&returnTo=https://untrusted.invalid`)
        await expect(page.getByRole('status').filter({ hasText: 'Conecta a internet' })).toBeVisible()
        await expect(page.getByRole('link', { name: linkName, exact: true })).toHaveCount(0)
        await expect(page.locator('textarea, input[type="file"]')).toHaveCount(0)
        assert.equal(report.requests.length, requestsBeforeOffline, 'Offline connected screens make no backend requests')
        assert.equal(new URL(page.url()).origin, origin)
        assert.equal(new URL(page.url()).pathname, path)
        await page.screenshot({ path: `${out}/${language}-${path.replaceAll('/', '-')}.png`, fullPage: true })
      }
      await page.evaluate(() => sessionStorage.setItem('connected-fixture-online', '1'))
      await page.goto(`${origin}/coach/profile`)
      await expect(page.getByRole('heading', { name: 'Perfil profesional', exact: true })).toBeVisible()
      await expect(page.locator('input[name="professionalPhotoUrl"]')).toHaveAttribute('type', 'hidden')
      await expect(page.locator('input[name="professionalPhotoUrl"]')).toHaveValue('')
      await expect(page.getByLabel(language === 'en' ? 'Upload professional photo' : 'Subir foto profesional', { exact: true })).toBeAttached()
      // This existing label wraps the textarea, whose initial text also appears
      // in Playwright's label text. Verify the semantic control and its value.
      const biography = page.getByRole('textbox', { name: /^Biografía/ })
      await expect(biography).toBeEditable()
      await expect(biography).toHaveValue(trainer.bio)
      await expect(page.getByRole('link', { name: 'Gestionar servicios', exact: true })).toHaveAttribute('href', '/coach/services')
      await expect(page.getByRole('link', { name: linkName, exact: true })).toHaveCount(0)
      assert.equal(new URL(page.url()).origin, origin)
      assert.deepEqual(await storedAccountSnapshot(page), before)
      report.checks.push(`${language}: five connected screens reject offline access locally without requests or handoffs; online profile exposes native photo picker, editable biography and local services link; account unchanged`)
    } catch (error) {
      await page.screenshot({ path: `${out}/${language}-failure.png`, fullPage: true })
      throw error
    } finally { await context.close() }
  }
  assert.equal(report.handoffs.length, 0)
  assert.deepEqual(report.unexpected, [])
  assert.deepEqual(report.errors, [])
  report.passed = true
} catch (error) { report.failure = String(error.stack || error); process.exitCode = 1 }
finally { await writeFile(`${out}/results.json`, JSON.stringify(report, null, 2)); await browser.close() }
console.log(JSON.stringify({ passed: report.passed, checks: report.checks, handoffs: report.handoffs.length, unexpected: report.unexpected, errors: report.errors, failure: report.failure }))
