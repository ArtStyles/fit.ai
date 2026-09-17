import { chromium, expect } from '@playwright/test'
import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { installAccountFixture, newTestAccount, storedAccountSnapshot } from './account-fixture.mjs'

// Run against the harness's compiled fixture build. This suite never starts a
// server, builds assets, or allows a non-fixture backend through to the network.
const origin = process.env.MOBILE_PREVIEW_URL || 'http://127.0.0.1:4178'
const backend = new URL(process.env.VITE_SUPABASE_URL || 'https://mobile-e2e.supabase.invalid').origin
const api = new URL(process.env.VITE_ACCOUNT_API_URL || 'https://mobile-e2e-api.invalid').origin
const web = new URL(process.env.VITE_WEB_APP_URL || 'https://mobile-e2e-web.invalid').origin
assert.ok(['127.0.0.1', 'localhost'].includes(new URL(origin).hostname), 'Only a local compiled preview may be tested')
for (const value of [backend, api, web]) assert.ok(new URL(value).hostname.endsWith('.invalid'), 'Only synthetic service origins may be tested')
const out = '.artifacts/portal-migration-regression'
const now = new Date('2026-09-16T16:00:00Z')
const id = number => `00000000-0000-4000-8000-${String(number).padStart(12, '0')}`
const report = { passed: false, checks: [], failures: [], requests: [], unexpected: [], pageErrors: [], popups: [], externalNavigations: [] }
await mkdir(out, { recursive: true })
const browser = await chromium.launch({ headless: true })

async function testCase(name, page, run) {
  try {
    await run()
    await expect(page.getByRole('link', { name: /^(Abrir en la web|Open on the web)$/ })).toHaveCount(0)
    assert.equal(new URL(page.url()).origin, origin)
    await page.screenshot({ path: `${out}/${name}.png`, fullPage: true })
    report.checks.push(name)
  } catch (error) {
    report.failures.push({ name, error: String(error.stack || error) })
    await page.screenshot({ path: `${out}/${name}-failure.png`, fullPage: true }).catch(() => {})
  }
}

async function fixture(kind, photo) {
  const state = await newTestAccount()
  const profile = state.tables.profiles[0]
  Object.assign(profile, { full_name: kind === 'applicant' ? 'Postulante de prueba' : 'Entrenadora de prueba', onboarding_done: true, readiness_status: 'cleared', language: 'es', timezone: 'UTC', is_admin: kind === 'coach' })
  const photoUrl = `${backend}/storage/v1/object/public/avatars/${state.accountId}/avatar.webp?v=1`
  if (kind === 'coach') profile.avatar_url = photoUrl
  const trainer = { id: id(101), user_id: state.accountId, status: 'active', slug: 'entrenadora-prueba', professional_name: 'Entrenadora de prueba', professional_photo_url: photoUrl, bio: 'Entrenamiento progresivo y personalizado para mejorar la fuerza y mantener hábitos sostenibles.', specialties: ['Fuerza'], modalities: ['online'], experience_summary: 'Ocho años de experiencia profesional en entrenamiento de fuerza.', general_location: null, languages: ['Español'], verified_at: now.toISOString() }
  state.tables.trainer_profiles = kind === 'coach' ? [trainer] : []
  const application = { id: id(102), user_id: state.accountId, application_kind: 'initial', status: 'draft', professional_name: 'Postulante de prueba', professional_photo_url: null, bio: 'Acompañamiento individual basado en técnica y entrenamiento progresivo de fuerza.', specialties: ['Fuerza'], modalities: ['online'], experience_summary: 'Cinco años de experiencia ayudando a personas a mejorar su entrenamiento.', general_location: null, languages: ['Español'], contact_email: state.email, contact_phone: null, preferred_contact: 'email', timezone: 'UTC', interview_availability: 'Lunes de 10 a 12 UTC.' }
  const conversation = { id: id(201), title: 'Entrenamiento de prueba', context: 'general', created_at: now.toISOString(), updated_at: now.toISOString() }
  const messages = [{ id: id(202), conversation_id: conversation.id, role: 'assistant', content: 'Este es el historial guardado de tu conversación.', created_at: now.toISOString() }]
  const users = [
    { id: id(301), email: 'maria@example.invalid', fullName: 'María Prueba', username: 'maria', avatarUrl: null, subscriptionTier: 'free', accountStatus: 'active', suspensionReason: null, suspendedUntil: null, createdAt: now.toISOString(), lastSignInAt: now.toISOString(), isOwner: false },
    { id: id(302), email: 'bruno@example.invalid', fullName: 'Bruno Prueba', username: 'bruno', avatarUrl: null, subscriptionTier: 'pro', accountStatus: 'active', suspensionReason: null, suspendedUntil: null, createdAt: now.toISOString(), lastSignInAt: now.toISOString(), isOwner: false },
  ]
  const user = { id: state.accountId, email: state.email, aud: 'authenticated', role: 'authenticated', created_at: now.toISOString(), app_metadata: { provider: 'email', providers: ['email'] }, user_metadata: {} }
  const expires = Math.floor(now.getTime() / 1000) + 3600
  const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url')
  const token = `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ sub: user.id, aud: 'authenticated', role: 'authenticated', exp: expires })}.synthetic`
  const session = { access_token: token, refresh_token: 'synthetic-portal-refresh', token_type: 'bearer', expires_in: 3600, expires_at: expires, user }
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce', serviceWorkers: 'block' })
  await context.addInitScript(() => Object.defineProperty(navigator, 'onLine', { get: () => true }))
  const mutable = { allowAdmin: false, documents: 0, savedDrafts: 0, savedProfiles: 0, sentMessages: 0, avatarUrl: profile.avatar_url, adminMutations: 0 }
  const parseForm = request => new Request(request.url(), { method: 'POST', headers: request.headers(), body: request.postDataBuffer() }).formData()
  await context.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url()), method = request.method()
    const headers = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'GET,HEAD,POST,PATCH,OPTIONS', 'access-control-expose-headers': 'content-range' }
    const fulfill = (body, status = 200) => route.fulfill({ status, contentType: 'application/json', headers, body: JSON.stringify(body) })
    const success = data => fulfill({ ok: true, data })
    try {
      if (url.origin === origin && ['GET', 'HEAD'].includes(method) && !url.pathname.startsWith('/api/')) {
        if (request.isNavigationRequest()) mutable.documents++
        return route.continue()
      }
      if (url.origin === origin && url.pathname === '/api/analytics') return fulfill({}, 202)
      report.requests.push({ kind, origin: url.origin, method, path: url.pathname })
      if ([backend, api].includes(url.origin) && method === 'OPTIONS') return fulfill(null)
      if (url.origin === backend && method === 'GET' && url.pathname === `/storage/v1/object/public/avatars/${user.id}/avatar.webp`) return route.fulfill({ contentType: 'image/png', headers, body: photo.buffer })
      if ([backend, api].includes(url.origin)) assert.equal(request.headers().authorization, `Bearer ${token}`, 'Only the synthetic verified account authorizes requests')
      if (url.origin === api && method === 'POST') {
        assert.equal(request.headers().cookie, undefined, 'Mobile APIs must not use ambient cookies')
        if (url.pathname === '/api/mobile/chat') {
          const body = request.postDataJSON()
          if (body.operation === 'list') return success([conversation])
          if (body.operation === 'messages') { assert.equal(body.conversationId, conversation.id); return success(messages) }
          if (body.operation === 'send') {
            assert.equal(body.conversationId, conversation.id); assert.equal(body.content, '¿Cómo ajusto mi rutina?')
            messages.push({ id: id(203), conversation_id: conversation.id, role: 'user', content: body.content, created_at: now.toISOString() }, { id: id(204), conversation_id: conversation.id, role: 'assistant', content: 'Respuesta persistida: conserva la técnica y ajusta una variable a la vez.', created_at: now.toISOString() })
            mutable.sentMessages++
            return success({ success: true, userMessageId: id(203), assistantMessageId: id(204), assistantContent: messages.at(-1).content })
          }
        }
        if (url.pathname === '/api/mobile/coaching') {
          const form = await parseForm(request), operation = form.get('operation')
          if (operation === 'saveDraft') {
            assert.equal(kind, 'applicant'); assert.equal(form.get('professionalName'), 'Postulante actualizado')
            application.professional_name = String(form.get('professionalName')); application.professional_photo_url = String(form.get('professionalPhotoUrl') || '') || null
            mutable.savedDrafts++
            return success({ ok: true, applicationId: application.id, status: 'draft' })
          }
          if (operation === 'updateProfile') {
            assert.equal(kind, 'coach'); assert.equal(form.get('professionalPhotoUrl'), '')
            trainer.professional_photo_url = null; mutable.savedProfiles++
            return success({ ok: true, directUpdated: true, reviewApplicationId: null, reviewStatus: null })
          }
        }
        if (url.pathname === '/api/mobile/admin') {
          if (!mutable.allowAdmin) return fulfill({ ok: false, error: { code: 'admin_required', message: 'Solo administradores autorizados (fixture).' } }, 403)
          const multipart = request.headers()['content-type']?.startsWith('multipart/form-data')
          if (multipart) {
            const form = await parseForm(request)
            assert.equal(form.get('operation'), 'setUserSubscription'); assert.equal(form.get('targetUserId'), users[0].id); assert.equal(form.get('tier'), 'pro')
            users[0].subscriptionTier = 'pro'; mutable.adminMutations++
            return fulfill({ ok: true, redirect: '/admin/users?notice=admin_plan_updated' })
          }
          const body = request.postDataJSON()
          if (body.operation === 'users') return success({ users, suspensionEnabled: true })
          if (body.operation === 'shell') return success({ adminLabel: state.email, pendingTrainerCount: 0 })
        }
      }
      if (url.origin === backend) {
        if (method === 'GET' && url.pathname === '/auth/v1/user') return fulfill(user)
        if (method === 'GET' && url.pathname === '/rest/v1/profiles') { assert.equal(url.searchParams.get('id'), `eq.${user.id}`); return fulfill({ id: user.id, onboarding_done: true, weight_kg: 75 }) }
        if (method === 'GET' && url.pathname === '/rest/v1/trainer_profiles') { assert.equal(url.searchParams.get('user_id'), `eq.${user.id}`); return fulfill(kind === 'coach' ? trainer : null) }
        if (method === 'GET' && url.pathname === '/rest/v1/trainer_applications') {
          assert.equal(url.searchParams.get('user_id'), `eq.${user.id}`)
          const applicationKind = url.searchParams.get('application_kind')
          assert.ok(['eq.initial', 'eq.profile_update'].includes(applicationKind))
          return fulfill(kind === 'applicant' && applicationKind === 'eq.initial' ? application : null)
        }
        if (method === 'GET' && ['/rest/v1/trainer_application_credentials', '/rest/v1/trainer_application_events_public', '/rest/v1/trainer_interviews_applicant_public'].includes(url.pathname)) {
          assert.equal(url.searchParams.get('application_id'), `eq.${application.id}`)
          return fulfill(url.pathname.endsWith('trainer_interviews_applicant_public') ? null : [])
        }
        if (method === 'POST' && url.pathname === `/storage/v1/object/avatars/${user.id}/avatar.webp`) return fulfill({ Key: `avatars/${user.id}/avatar.webp`, Id: user.id })
        if (method === 'PATCH' && url.pathname === '/rest/v1/profiles') {
          assert.equal(url.searchParams.get('id'), `eq.${user.id}`)
          mutable.avatarUrl = request.postDataJSON().avatar_url
          return fulfill({ id: user.id, avatar_url: mutable.avatarUrl })
        }
        if (method === 'POST' && url.pathname === '/rest/v1/rpc/get_fitness_card_state') { assert.deepEqual(request.postDataJSON(), {}); return fulfill({ viewerId: user.id, own: null, received: [], access: [] }) }
        if (method === 'POST' && url.pathname === '/rest/v1/rpc/get_companion_state') { assert.deepEqual(request.postDataJSON(), {}); return fulfill({ viewerId: user.id, status: 'none', relationship: null, self: { completedSessions: 0, goal: 1, weekStart: '2026-09-14', weekEnd: '2026-09-20', timeZone: 'UTC', updatedAt: now.toISOString() }, partner: null, greeting: null, nextGreetingAt: null, fetchedAt: now.toISOString() }) }
        if (['GET', 'HEAD'].includes(method) && url.pathname === '/rest/v1/product_notifications') {
          assert.equal(url.searchParams.get('user_id'), `eq.${user.id}`)
          return route.fulfill({ status: 200, contentType: 'application/json', headers: { ...headers, 'content-range': '*/0' }, body: method === 'HEAD' ? '' : '[]' })
        }
      }
      report.unexpected.push({ kind, method, origin: url.origin, path: url.pathname })
      return route.abort()
    } catch (error) {
      report.unexpected.push({ kind, method, origin: url.origin, path: url.pathname, error: String(error) })
      return route.abort()
    }
  })
  const page = await context.newPage()
  page.setDefaultTimeout(15000)
  page.on('pageerror', error => report.pageErrors.push({ kind, message: error.message }))
  page.on('popup', popup => { report.popups.push({ kind, url: popup.url() }); void popup.close() })
  page.on('framenavigated', frame => { if (frame === page.mainFrame() && !frame.url().startsWith(origin) && frame.url() !== 'about:blank') report.externalNavigations.push({ kind, url: frame.url() }) })
  await page.clock.setFixedTime(now)
  await page.goto(`${origin}/login`)
  await expect(page.getByLabel('Correo electrónico', { exact: true })).toBeVisible()
  await installAccountFixture(page, state)
  await page.evaluate(value => localStorage.setItem('vekira-original-auth', JSON.stringify(value)), session)
  return { context, page, state, trainer, application, conversation, messages, users, mutable }
}

try {
  const imagePage = await browser.newPage({ viewport: { width: 32, height: 32 } })
  await imagePage.setContent('<body style="margin:0;background:#8b5cf6"></body>')
  const photo = { name: 'professional-photo.png', mimeType: 'image/png', buffer: await imagePage.screenshot() }
  await imagePage.close()
  const applicant = await fixture('applicant', photo)
  try {
    await testCase('application-native-form-and-save', applicant.page, async () => {
      const { page, mutable } = applicant
      await page.goto(`${origin}/coach/apply`)
      await expect(page.getByRole('heading', { name: 'Solicitud de entrenador', exact: true })).toBeVisible()
      await expect(page.getByRole('group', { name: 'Foto profesional', exact: true })).toBeVisible()
      await expect(page.getByLabel('Subir foto profesional', { exact: true })).toBeAttached()
      await expect(page.locator('input[name="file"][type="file"]')).toBeAttached()
      await page.getByLabel('Nombre profesional', { exact: true }).fill('Postulante actualizado')
      await page.getByRole('button', { name: 'Guardar borrador', exact: true }).click()
      await expect.poll(() => mutable.savedDrafts).toBe(1)
      await page.reload()
      await expect(page.getByLabel('Nombre profesional', { exact: true })).toHaveValue('Postulante actualizado')
      for (const width of [390, 1440]) {
        await page.setViewportSize({ width, height: 900 })
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth <= 1), `Application horizontal overflow at ${width}px`)
        await page.screenshot({ path: `${out}/application-${width}.png`, fullPage: true })
      }
    })
    await testCase('application-photo-upload-retains-selection', applicant.page, async () => {
      const { page, mutable } = applicant
      await page.setViewportSize({ width: 390, height: 844 })
      await page.goto(`${origin}/coach/apply`)
      await page.getByLabel('Subir foto profesional', { exact: true }).setInputFiles(photo)
      await expect.poll(() => mutable.avatarUrl).toMatch(/\/avatar\.webp\?v=\d+$/)
      await expect(page.locator('input[name="professionalPhotoUrl"]')).toHaveValue(mutable.avatarUrl)
      await expect(page.getByRole('button', { name: 'Guardar borrador', exact: true })).toBeEnabled()
      await page.getByRole('button', { name: 'Guardar borrador', exact: true }).click()
      await expect.poll(() => applicant.application.professional_photo_url).toBe(mutable.avatarUrl)
      await page.reload()
      await expect(page.locator('input[name="professionalPhotoUrl"]')).toHaveValue(mutable.avatarUrl)
    })
  } finally { await applicant.context.close() }
  const coach = await fixture('coach', photo)
  try {
    await testCase('chat-send-response-persists-after-reload', coach.page, async () => {
      const { page, mutable, conversation } = coach
      await page.goto(`${origin}/chat`)
      await page.getByRole('button', { name: new RegExp(`^${conversation.title}`) }).click()
      await expect(page.getByText('Este es el historial guardado de tu conversación.', { exact: true })).toBeVisible()
      await page.getByPlaceholder('Escribe un mensaje…', { exact: true }).fill('¿Cómo ajusto mi rutina?')
      await page.getByRole('button', { name: 'Enviar mensaje', exact: true }).click()
      await expect(page.getByText('Respuesta persistida: conserva la técnica y ajusta una variable a la vez.', { exact: true })).toBeVisible()
      assert.equal(mutable.sentMessages, 1)
      await page.reload()
      await page.getByRole('button', { name: new RegExp(`^${conversation.title}`) }).click()
      await expect(page.getByText('¿Cómo ajusto mi rutina?', { exact: true })).toBeVisible()
      await expect(page.getByText('Respuesta persistida: conserva la técnica y ajusta una variable a la vez.', { exact: true })).toBeVisible()
      assert.equal(mutable.sentMessages, 1, 'Reload reads persisted history; it does not resubmit the message')
    })
    await testCase('professional-profile-clear-photo-persists', coach.page, async () => {
      const { page, mutable } = coach
      await page.goto(`${origin}/coach/profile`)
      await expect(page.getByRole('heading', { name: 'Perfil profesional', exact: true })).toBeVisible()
      await expect(page.getByLabel('Subir foto profesional', { exact: true })).toBeAttached()
      await expect(page.getByRole('textbox', { name: /^Biografía/ })).toHaveValue(coach.trainer.bio)
      await page.getByRole('button', { name: 'Quitar foto', exact: true }).click()
      await expect(page.locator('input[name="professionalPhotoUrl"]')).toHaveValue('')
      await page.getByRole('button', { name: 'Guardar perfil', exact: true }).click()
      await expect.poll(() => mutable.savedProfiles).toBe(1)
      await page.reload()
      await expect(page.locator('input[name="professionalPhotoUrl"]')).toHaveValue('')
      assert.ok((await storedAccountSnapshot(page)).accounts[0].tables.profiles[0].avatar_url, 'Clearing the professional selection does not delete the personal avatar')
    })
    await testCase('admin-permission-denial-stays-inside-app', coach.page, async () => {
      const { page } = coach
      await page.goto(`${origin}/admin`)
      await expect(page.getByRole('alert')).toHaveText('Solo administradores autorizados (fixture).')
      await expect(page.getByRole('heading', { name: 'No se pudo abrir esta pantalla', exact: true })).toBeVisible()
      await expect(page.getByLabel('Buscar usuarios', { exact: true })).toHaveCount(0)
    })
    await testCase('admin-users-filter-and-subscription-persist', coach.page, async () => {
      const { page, mutable, users } = coach
      mutable.allowAdmin = true
      await page.goto(`${origin}/admin/users`)
      await expect(page.getByRole('heading', { name: 'María Prueba', exact: true })).toBeVisible()
      await expect(page.getByRole('heading', { name: 'Bruno Prueba', exact: true })).toBeVisible()
      const documents = mutable.documents
      await page.getByLabel('Buscar usuarios', { exact: true }).fill('María')
      await page.getByLabel('Plan', { exact: true }).selectOption('free')
      await page.getByRole('button', { name: 'Filtrar', exact: true }).click()
      await expect(page).toHaveURL(/\/admin\/users\?.*tier=free/)
      await expect(page.getByRole('heading', { name: 'María Prueba', exact: true })).toBeVisible()
      await expect(page.getByRole('heading', { name: 'Bruno Prueba', exact: true })).toHaveCount(0)
      assert.equal(mutable.documents, documents, 'Admin filters navigate through the local router without document reload')
      await page.getByRole('button', { name: 'Activar Pro', exact: true }).click()
      await expect.poll(() => mutable.adminMutations).toBe(1)
      const maria = page.locator('article').filter({ has: page.getByRole('heading', { name: 'María Prueba', exact: true }) })
      await expect(maria.getByRole('button', { name: 'Cancelar Pro', exact: true })).toBeVisible()
      assert.equal(users[0].subscriptionTier, 'pro')
      await page.reload()
      await expect(maria.getByRole('button', { name: 'Cancelar Pro', exact: true })).toBeVisible()
      await page.setViewportSize({ width: 1440, height: 900 })
      await expect(page.getByLabel('Buscar usuarios', { exact: true })).toBeVisible()
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth <= 1), 'Admin horizontal overflow')
    })
  } finally { await coach.context.close() }
  assert.deepEqual(report.unexpected, [])
  assert.deepEqual(report.pageErrors, [])
  assert.deepEqual(report.popups, [])
  assert.deepEqual(report.externalNavigations, [])
  assert.equal(report.failures.length, 0, 'Every migrated-screen scenario must pass')
  report.passed = true
} catch (error) { report.failure = String(error.stack || error); process.exitCode = 1 }
finally { await writeFile(`${out}/results.json`, JSON.stringify(report, null, 2)); await browser.close() }
console.log(JSON.stringify({ passed: report.passed, checks: report.checks, failures: report.failures, unexpected: report.unexpected, pageErrors: report.pageErrors, failure: report.failure }))
