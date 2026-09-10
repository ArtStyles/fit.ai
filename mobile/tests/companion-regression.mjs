import { chromium, expect } from '@playwright/test'
import { loadEnv } from 'vite'
import initSqlJs from 'sql.js'
import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { installAccountFixture, newTestAccount, storedAccountSnapshot } from './account-fixture.mjs'

// Exercises the compiled Android entry, SQLite and authenticated HTTP adapters.
// Every remote response is controlled here; no request reaches a real account.
const origin = process.env.MOBILE_PREVIEW_URL || 'http://127.0.0.1:4178'
const backend = new URL(loadEnv('production', 'mobile').VITE_SUPABASE_URL).origin
const artifacts = '.artifacts/companion-constancy'
const now = new Date('2026-09-10T16:00:00.000Z')
const id = number => `10000000-0000-4000-8000-${String(number).padStart(12, '0')}`
const relationshipId = id(21), partnerId = id(22), planId = id(23), workoutId = id(24)
const partnerName = 'Marina Pérez'
const message = '<b>Ánimo</b> 💪\nVamos a tu ritmo.'
const SQL = await initSqlJs()
const failures = [], unexpectedRequests = [], completed = [], requests = []
const week = { completedSessions: 1, goal: 3, weekStart: '2026-09-07', weekEnd: '2026-09-13', timeZone: 'UTC', updatedAt: now.toISOString() }

function snapshot(viewerId, status = 'active') {
  return {
    viewerId, status,
    relationship: status === 'none' ? null : {
      id: relationshipId, other: { userId: partnerId, fullName: partnerName, avatarUrl: null },
      expiresAt: status === 'active' ? null : '2026-09-17T16:00:00.000Z',
    },
    self: { ...week }, partner: status === 'active' ? { ...week, completedSessions: 2 } : null,
    greeting: null, nextGreetingAt: null, fetchedAt: now.toISOString(),
  }
}

function authSession(state) {
  const user = { id: state.accountId, aud: 'authenticated', role: 'authenticated', email: state.email,
    email_confirmed_at: now.toISOString(), created_at: now.toISOString(),
    app_metadata: { provider: 'email', providers: ['email'] }, user_metadata: {}, identities: [] }
  const expiresAt = Math.floor(now.getTime() / 1000) + 3600
  const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url')
  const accessToken = `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ sub: user.id, aud: 'authenticated', role: 'authenticated', exp: expiresAt, iat: expiresAt - 3600 })}.fixture-signature`
  return { access_token: accessToken, refresh_token: 'fixture-refresh', token_type: 'bearer', expires_in: 3600, expires_at: expiresAt, user }
}

async function account() {
  const state = await newTestAccount()
  Object.assign(state.tables.profiles[0], {
    full_name: 'Prueba constancia', username: 'prueba_constancia', onboarding_done: true,
    readiness_status: 'cleared', timezone: 'UTC', preferred_workout_days: [4], days_per_week: 1,
    last_check_in_at: now.toISOString(), created_at: now.toISOString(), updated_at: now.toISOString(),
  })
  state.tables.workout_plans = [{ id: planId, family_id: planId, user_id: state.accountId,
    name: 'Plan de constancia', description: null, goal: 'Fuerza', week_number: 1, days_per_week: 1,
    is_active: true, prescription_locked: false, library_slot: 'personal', ai_notes: null,
    retired_at: null, superseded_at: null, created_at: now.toISOString(), updated_at: now.toISOString() }]
  state.tables.workouts = [{ id: workoutId, plan_id: planId, user_id: state.accountId,
    name: 'Rutina del jueves', focus: 'Fuerza', day_of_week: 4, order_in_plan: 1,
    estimated_duration_minutes: 30, created_at: now.toISOString() }]
  state.tables.workout_exercises = [{ id: id(25), workout_id: workoutId, exercise_id: state.tables.exercises[0].id,
    order_index: 1, sets: 1, reps: 8, rest_seconds: 60, target_rpe: 7, weight_kg: null,
    duration_seconds: null, notes: null, weight_suggestion_basis: null }]
  state.tables.session_authorizations = []
  state.tables.coaching_relationships = []
  state.tables.notification_attention_dismissals = []
  state.remoteRevision = id(500)
  state.lastSyncedRevision = state.revision
  return state
}

async function readDatabase(page) {
  const bytes = await page.evaluate(() => new Promise((resolve, reject) => {
    const request = indexedDB.open('vekira-mobile-sqlite', 1)
    request.onerror = () => reject(request.error)
    request.onsuccess = () => {
      const db = request.result
      const read = db.transaction('databases').objectStore('databases').get('vekira-offline')
      read.onerror = () => { db.close(); reject(read.error) }
      read.onsuccess = () => { resolve(Array.from(read.result)); db.close() }
    }
  }))
  return new SQL.Database(new Uint8Array(bytes))
}

async function cachedSnapshot(page, owner) {
  const db = await readDatabase(page)
  try {
    const value = db.exec('SELECT value FROM original_app_settings WHERE key = ?', [`cache:${owner}:companion-summary`])[0]?.values[0]?.[0]
    return value ? JSON.parse(value)?.snapshot ?? null : null
  } finally { db.close() }
}

async function switchStoredAccount(page, state) {
  // Preserve A's cache while activating B; replacing the database would hide leaks.
  const db = await readDatabase(page)
  try {
    db.run('INSERT INTO original_app_accounts VALUES (?, ?, ?)', [state.accountId, state.remoteUserId, JSON.stringify(state)])
    db.run("UPDATE original_app_settings SET value = ? WHERE key = 'active_account'", [state.accountId])
    await page.evaluate(bytes => new Promise((resolve, reject) => {
      const request = indexedDB.open('vekira-mobile-sqlite', 1)
      request.onerror = () => reject(request.error)
      request.onsuccess = () => {
        const database = request.result
        const transaction = database.transaction('databases', 'readwrite')
        transaction.objectStore('databases').put(new Uint8Array(bytes), 'vekira-offline')
        transaction.oncomplete = () => { database.close(); resolve() }
        transaction.onerror = () => { database.close(); reject(transaction.error) }
      }
    }), Array.from(db.export()))
  } finally { db.close() }
}

async function setOnline(page, online) {
  await page.evaluate(online => {
    sessionStorage.setItem('companion-fixture-offline', online ? '0' : '1')
    window.testOnline = online
    window.dispatchEvent(new Event(online ? 'online' : 'offline'))
  }, online)
}

await mkdir(artifacts, { recursive: true })
const browser = await chromium.launch({ headless: true })
let page

async function scenario(name, { status = 'active', width = 390, notificationType = null, pendingTraining = false } = {}) {
  const state = await account()
  const webState = structuredClone(state)
  if (pendingTraining) {
    state.revision += 1
    state.tables.progress_logs.push({ id: id(40), user_id: state.accountId, workout_id: workoutId,
      client_session_id: id(41), completed_at: '2026-09-10T15:00:00.000Z', duration_minutes: 25,
      total_volume_kg: 160, notes: null, created_at: now.toISOString() })
  }
  const model = { state, session: authSession(state), summary: snapshot(state.accountId, status), greetingAttempts: 0,
    failFirstGreeting: false, notifications: [], requests: [], backup: { revision: id(500), payload: webState }, backupWrites: 0 }
  if (notificationType === 'companion_greeting') model.summary.receivedGreeting = { message, sentAt: now.toISOString() }
  if (pendingTraining) model.summary.self.completedSessions = 0
  if (notificationType) model.notifications.push({
    id: id(30), user_id: state.accountId, type: notificationType,
    title: notificationType === 'companion_invitation' ? 'Marina quiere compartir su constancia contigo' : 'Un saludo de Marina',
    body: notificationType === 'companion_invitation' ? 'Revisa su invitación.' : message,
    url: '/companion', read_at: null, dismissed_at: null, created_at: now.toISOString(),
  })
  const context = await browser.newContext({ viewport: { width, height: width === 1440 ? 900 : 844 }, reducedMotion: 'reduce' })
  await context.addInitScript(() => {
    window.testOnline = sessionStorage.getItem('companion-fixture-offline') !== '1'
    Object.defineProperty(navigator, 'onLine', { get: () => window.testOnline })
  })
  await context.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url())
    if (url.origin === origin && url.pathname === '/__companion-fixture-seed') return route.fulfill({
      status: 200, contentType: 'text/html', body: '<!doctype html><title>Companion fixture setup</title>',
    })
    if (url.origin === origin) return route.continue()
    if (url.origin !== backend) return route.abort()
    const fulfill = (body, status = 200, headers = {}) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body),
      headers: { 'access-control-allow-origin': origin, 'access-control-allow-headers': '*', 'access-control-expose-headers': 'content-range', ...headers } })
    if (request.method() === 'OPTIONS') return fulfill(null)
    const call = { scenario: name, method: request.method(), path: url.pathname, args: request.postDataJSON() }
    requests.push(call); model.requests.push(call)
    if (url.pathname === '/auth/v1/user' && request.method() === 'GET') return fulfill(model.session.user)
    if (url.pathname === '/rest/v1/coaching_relationships' && request.method() === 'GET') return fulfill([])
    // The constancy coordinator uses the existing guarded backup, including its
    // canonical download. Serve the same account so sync cannot invent changes.
    const table = url.pathname.replace('/rest/v1/', '')
    if (request.method() === 'GET' && ['profiles', 'workout_plans', 'workouts', 'progress_logs', 'measurements',
      'exercises', 'workout_exercises', 'exercise_logs', 'trainer_profiles', 'trainer_plan_assignments', 'trainer_assignment_versions', 'public_profiles'].includes(table)) {
      let rows = webState.tables[table] ?? []
      for (const field of ['id', 'user_id', 'workout_id', 'progress_log_id', 'assignment_id']) {
        const filter = url.searchParams.get(field)
        if (filter?.startsWith('eq.')) rows = rows.filter(row => String(row[field]) === filter.slice(3))
        if (filter?.startsWith('in.(')) {
          const ids = filter.slice(4, -1).split(',')
          rows = rows.filter(row => ids.includes(String(row[field])))
        }
      }
      const offset = Number(url.searchParams.get('offset') ?? 0)
      const limit = Number(url.searchParams.get('limit') ?? rows.length)
      return fulfill(rows.slice(offset, offset + limit))
    }
    if (url.pathname === '/rest/v1/product_notifications') {
      let rows = model.notifications.filter(row => row.user_id === model.session.user.id && row.dismissed_at === null)
      if (url.searchParams.get('read_at') === 'is.null') rows = rows.filter(row => row.read_at === null)
      if (request.method() === 'HEAD') return fulfill(null, 200, { 'content-range': `0-0/${rows.length}` })
      if (request.method() === 'GET') return fulfill(rows)
      if (request.method() === 'PATCH') {
        const row = rows.find(row => `eq.${row.id}` === url.searchParams.get('id'))
        if (!row) return fulfill(null, 404)
        Object.assign(row, call.args)
        return fulfill({ id: row.id })
      }
    }
    if (request.method() === 'POST') {
      if (url.pathname === '/rest/v1/rpc/original_app_snapshot_read_v1') return fulfill(model.backup)
      if (url.pathname === '/rest/v1/rpc/original_app_snapshot_push_v1') {
        assert.equal(call.args.p_payload.accountId, model.session.user.id, 'Backup belongs to the authenticated account')
        assert.equal(call.args.p_expected_revision, model.backup?.revision ?? null)
        model.backupWrites += 1
        model.backup = { revision: id(500 + model.backupWrites), payload: call.args.p_payload }
        if (pendingTraining) model.summary = { ...model.summary,
          self: { ...model.summary.self, completedSessions: call.args.p_payload.tables.progress_logs.length } }
        return fulfill({ revision: model.backup.revision })
      }
      if (url.pathname === '/rest/v1/rpc/get_companion_state') return fulfill(model.summary)
      if (url.pathname === '/rest/v1/rpc/get_companion_invite_code') return fulfill({ code: 'VKR-012345ABCDEF', expiresAt: '2026-09-17T16:00:00.000Z' })
      if (url.pathname === '/rest/v1/rpc/send_companion_greeting') {
        model.greetingAttempts += 1
        if (model.failFirstGreeting && model.greetingAttempts === 1) return fulfill({ code: 'TEST_TEMPORARY_ERROR', message: 'Temporarily unavailable' }, 503)
        assert.equal(call.args.p_relationship_id, relationshipId)
        model.summary = { ...model.summary, greeting: { message: call.args.p_message, sentAt: now.toISOString() }, nextGreetingAt: '2026-09-11T00:00:00.000Z' }
        return fulfill(model.summary)
      }
      if (url.pathname === '/rest/v1/rpc/leave_companion') {
        assert.equal(call.args.p_relationship_id, relationshipId)
        model.summary = snapshot(state.accountId, 'none')
        return fulfill(model.summary)
      }
    }
    unexpectedRequests.push(call)
    return fulfill({ code: 'TEST_UNEXPECTED_REQUEST', message: 'Unconfigured fixture request' }, 418)
  })
  page = await context.newPage()
  page.setDefaultTimeout(15_000)
  page.on('pageerror', error => failures.push({ scenario: name, error: error.message }))
  await page.clock.setFixedTime(now)
  // Seed before booting production JS: background store initialization in the
  // login screen could otherwise overwrite an externally seeded SQLite file.
  await page.goto(`${origin}/__companion-fixture-seed`)
  await installAccountFixture(page, state)
  await page.evaluate(session => localStorage.setItem('vekira-original-auth', JSON.stringify(session)), model.session)
  assert.equal((await storedAccountSnapshot(page)).active, state.accountId)
  return { page, context, model }
}

async function capture(page, name) {
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth <= 1), `${name}: horizontal overflow`)
  await page.screenshot({ path: `${artifacts}/${name}.png`, fullPage: true })
}

try {
  for (const width of [390, 1440]) {
    const { page, context, model } = await scenario(`layout-${width}`, { width })
    try {
      await page.goto(`${origin}/dashboard`)
      const card = page.getByRole('region', { name: 'Compañero de constancia', exact: true })
      await expect(card.getByRole('link', { name: `Ver a tu compañero ${partnerName}`, exact: true })).toBeVisible()
      await expect(page.getByRole('link', { name: 'Empezar entrenamiento', exact: true })).toBeVisible()
      const bounds = await page.evaluate(() => ({ today: document.querySelector('[aria-labelledby="today-title"]').getBoundingClientRect().bottom,
        companion: document.querySelector('[aria-label="Compañero de constancia"]').getBoundingClientRect().top }))
      assert.ok(bounds.companion >= bounds.today, 'Companion card belongs below today’s workout')
      await capture(page, `dashboard-${width}`)
      await card.evaluate(element => element.scrollIntoView({ block: 'center', behavior: 'instant' }))
      await capture(page, `dashboard-companion-${width}`)
      await card.getByRole('link', { name: `Ver a tu compañero ${partnerName}`, exact: true }).click()
      await expect(page).toHaveURL(`${origin}/companion`)
      await expect(page.getByRole('heading', { name: partnerName, level: 2, exact: true })).toBeVisible()
      await expect(page.getByRole('progressbar', { name: new RegExp(partnerName) })).toHaveAttribute('aria-valuenow', '2')
      await capture(page, `companion-${width}`)
      await page.goto(`${origin}/dashboard`)
      await card.getByRole('link', { name: `Escribir un saludo a ${partnerName}`, exact: true }).click()
      await expect(page).toHaveURL(`${origin}/companion?view=message`)
      await expect(page.getByLabel('Tu mensaje')).toBeVisible()
      await capture(page, `message-${width}`)
      assert.ok(model.requests.some(call => call.path.endsWith('/get_companion_state')))
      completed.push(`Dashboard order and real companion/message routes at ${width}px`)
    } finally { await context.close() }
  }

  for (const width of [390, 1440]) {
    const { page, context, model } = await scenario(`shared-week-received-${width}`, { width })
    try {
      const receivedGreeting = { message, sentAt: '2026-09-09T15:00:00.000Z' }
      model.summary = { ...model.summary, receivedGreeting,
        self: { ...week, completedSessions: 2, goal: 2 }, partner: { ...week, completedSessions: 4, goal: 4 } }
      await page.goto(`${origin}/dashboard`)
      const card = page.getByRole('region', { name: 'Compañero de constancia', exact: true })
      await expect(card.getByText('Semana completada juntos', { exact: true })).toBeVisible()
      await expect(card.getByText('4 de 4 sesiones esta semana', { exact: true })).toBeVisible()
      await card.evaluate(element => element.scrollIntoView({ block: 'center', behavior: 'instant' }))
      await capture(page, `shared-week-dashboard-${width}`)
      await card.getByRole('link', { name: `Ver a tu compañero ${partnerName}`, exact: true }).click()
      await expect(page.getByRole('heading', { name: 'Semana completada juntos', exact: true })).toBeVisible()
      await expect(page.getByText(message, { exact: true })).toBeVisible()
      await expect(page.getByRole('button', { name: 'Escribir saludo', exact: true })).toBeEnabled()
      assert.equal(await page.locator('main b').filter({ hasText: 'Ánimo' }).count(), 0, 'A received greeting remains literal text')
      assert.deepEqual((await cachedSnapshot(page, model.state.accountId)).receivedGreeting, receivedGreeting)
      await capture(page, `shared-week-received-${width}`)

      model.summary.partner.goal = null
      await page.getByRole('button', { name: 'Actualizar', exact: true }).click()
      await expect(page.getByRole('heading', { name: 'Semana completada juntos', exact: true })).toHaveCount(0)
      await expect(page.getByText(message, { exact: true })).toBeVisible()
      model.summary.partner.goal = 4
      await page.getByRole('button', { name: 'Actualizar', exact: true }).click()
      await expect(page.getByRole('heading', { name: 'Semana completada juntos', exact: true })).toBeVisible()

      await setOnline(page, false)
      const beforeReload = model.requests.length
      await page.goto(`${origin}/companion`)
      await expect(page.getByText('Sin conexión · Mostrando el último resumen.', { exact: true })).toBeVisible()
      await expect(page.getByText(message, { exact: true })).toBeVisible()
      await expect(page.getByRole('heading', { name: 'Semana completada juntos', exact: true })).toBeVisible()
      assert.equal(model.requests.length, beforeReload, 'Received greeting and shared week reload from this account cache')
      await capture(page, `shared-week-offline-${width}`)

      model.summary = snapshot(model.state.accountId, 'none')
      await setOnline(page, true)
      await expect(page.getByRole('button', { name: 'Mi código', exact: true })).toBeVisible()
      await expect(page.getByText(message, { exact: true })).toHaveCount(0)
      await expect(page.getByRole('heading', { name: 'Semana completada juntos', exact: true })).toHaveCount(0)
      assert.equal((await cachedSnapshot(page, model.state.accountId)).status, 'none')
      assert.equal(model.greetingAttempts, 0, 'Reading and celebrating never send a greeting')
      completed.push(`Received greeting and individual-goal achievement, cached offline and cleared on revocation at ${width}px`)
    } finally { await context.close() }
  }

  {
    const { page, context, model } = await scenario('greeting-retry')
    try {
      model.failFirstGreeting = true
      await page.goto(`${origin}/companion?view=message`)
      await page.getByLabel('Tu mensaje').fill(message)
      await page.getByRole('button', { name: 'Enviar saludo', exact: true }).click()
      await expect(page.getByRole('button', { name: 'Reintentar envío', exact: true })).toBeVisible()
      await expect(page.getByLabel('Tu mensaje')).toHaveValue(message)
      await capture(page, 'greeting-retry-390')
      await page.getByRole('button', { name: 'Reintentar envío', exact: true }).click()
      await expect(page.getByRole('button', { name: 'Saludo enviado hoy', exact: true })).toBeDisabled()
      const attempts = model.requests.filter(call => call.path.endsWith('/send_companion_greeting'))
      assert.equal(attempts.length, 2)
      assert.deepEqual(attempts[0].args, attempts[1].args, 'Retry preserves the request id and original message')
      assert.match(attempts[0].args.p_request_id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i)
      assert.equal(attempts[0].args.p_message, message, 'Greetings stay literal Unicode text')
      assert.equal(await page.locator('main b').filter({ hasText: 'Ánimo' }).count(), 0, 'Greeting markup is never rendered as HTML')
      await page.goto(`${origin}/dashboard`)
      await expect(page.getByRole('img', { name: 'Ya enviaste tu saludo de hoy', exact: true })).toBeVisible()
      await capture(page, 'greeting-sent-390')
      completed.push('Greeting retries with the same UUID/text and keeps the confirmed daily limit')
    } finally { await context.close() }
  }

  for (const type of ['companion_invitation', 'companion_greeting']) {
    const { page, context, model } = await scenario(type, { notificationType: type, status: type === 'companion_invitation' ? 'pending_incoming' : 'active' })
    try {
      await page.goto(`${origin}/dashboard`)
      const bell = page.getByRole('link', { name: 'Abrir notificaciones', exact: true })
      await expect(bell.locator('span[aria-hidden="true"]')).toHaveCount(1)
      await bell.click()
      await expect(page).toHaveURL(`${origin}/notifications`)
      const notification = model.notifications[0]
      await expect(page.getByRole('button', { name: `Abrir: ${notification.title}`, exact: true })).toBeVisible()
      await capture(page, `${type}-390`)
      await page.getByRole('button', { name: `Abrir: ${notification.title}`, exact: true }).click()
      await expect(page).toHaveURL(`${origin}/companion`)
      if (type === 'companion_invitation') {
        await expect(page.getByRole('button', { name: 'Aceptar invitación', exact: true })).toBeVisible()
        await capture(page, 'incoming-invitation-390')
      }
      else {
        await expect(page.getByRole('heading', { name: partnerName, level: 2, exact: true })).toBeVisible()
        await expect(page.getByText(message, { exact: true })).toBeVisible()
      }
      assert.ok(notification.read_at, 'Opening the notification confirms the remote read state')
      assert.equal(model.requests.filter(call => call.method === 'PATCH' && call.path.endsWith('/product_notifications')).length, 1)
      await page.goto(`${origin}/dashboard`)
      await expect(bell.locator('span[aria-hidden="true"]')).toHaveCount(0)
      const saved = (await storedAccountSnapshot(page)).accounts.find(row => row.accountId === model.state.accountId)
      assert.ok(saved.tables.product_notifications[0].read_at, 'The read state is also durable in SQLite')
      completed.push(`${type}: unread bell opens companion and persists read state`)
    } finally { await context.close() }
  }

  {
    const { page, context, model } = await scenario('automatic-training-backup', { pendingTraining: true })
    try {
      await page.goto(`${origin}/companion`)
      await expect(page.getByRole('heading', { name: partnerName, level: 2, exact: true })).toBeVisible()
      await expect.poll(() => model.backupWrites, { message: 'Pending training should be backed up without a manual sync action' }).toBe(1)
      const uploaded = model.backup.payload
      assert.equal(uploaded.accountId, model.state.accountId)
      assert.deepEqual(uploaded.tables.progress_logs, model.state.tables.progress_logs)
      assert.equal(uploaded.tables.progress_logs[0].client_session_id, id(41))
      await expect.poll(async () => (await cachedSnapshot(page, model.state.accountId))?.self?.completedSessions).toBe(1)
      await expect.poll(async () => {
        const saved = (await storedAccountSnapshot(page)).accounts.find(row => row.accountId === model.state.accountId)
        return saved.revision === saved.lastSyncedRevision && saved.remoteRevision === model.backup.revision
      }).toBe(true)
      await capture(page, 'automatic-training-backup-390')
      assert.equal(model.requests.filter(call => call.path.endsWith('/original_app_snapshot_push_v1')).length, 1)
      completed.push('Pending local training is backed up automatically and refreshes the confirmed companion summary')
    } finally { await context.close() }
  }

  {
    const { page, context, model } = await scenario('offline-draft')
    try {
      await page.goto(`${origin}/companion?view=message`)
      await page.getByLabel('Tu mensaje').fill(message)
      const before = model.requests.length
      await setOnline(page, false)
      await expect(page.getByText('Sin conexión · Mostrando el último resumen.', { exact: true })).toBeVisible()
      await expect(page.getByLabel('Tu mensaje')).toHaveValue(message)
      await expect(page.getByRole('button', { name: 'Enviar saludo', exact: true })).toBeDisabled()
      await capture(page, 'offline-draft-390')
      assert.equal(model.requests.length, before, 'Going offline and keeping a draft never dispatches RPC')
      // Both OriginalApp and the hub currently observe connectivity. A stale
      // background read must not discard the private draft during reconnection.
      await setOnline(page, true)
      await expect(page.getByRole('button', { name: 'Enviar saludo', exact: true })).toBeEnabled()
      await expect(page.getByLabel('Tu mensaje')).toHaveValue(message)
      await expect(page.getByText('Sin conexión · Mostrando el último resumen.', { exact: true })).toHaveCount(0)
      assert.equal(model.greetingAttempts, 0, 'Reconnection never sends a draft automatically')
      await capture(page, 'reconnected-draft-390')
      await setOnline(page, false)
      await expect(page.getByRole('button', { name: 'Enviar saludo', exact: true })).toBeDisabled()
      const beforeReload = model.requests.length
      await page.goto(`${origin}/companion`)
      await expect(page.getByRole('heading', { name: partnerName, level: 2, exact: true })).toBeVisible()
      await expect(page.getByText('Sin conexión · Mostrando el último resumen.', { exact: true })).toBeVisible()
      assert.equal(model.requests.length, beforeReload, 'A fresh offline route is served from account cache')
      completed.push('Offline cache and private draft survive disconnect/reconnect; a draft is never sent automatically')
    } finally { await context.close() }
  }

  {
    const { page, context, model } = await scenario('unlink')
    try {
      await page.goto(`${origin}/companion`)
      await page.getByRole('button', { name: 'Opciones de compañero', exact: true }).click()
      await expect(page.getByRole('dialog', { name: '¿Dejar de compartir?' })).toBeVisible()
      assert.equal(model.requests.filter(call => call.path.endsWith('/leave_companion')).length, 0)
      await page.getByRole('button', { name: 'Conservar compañero', exact: true }).click()
      await page.getByRole('button', { name: 'Opciones de compañero', exact: true }).click()
      await page.getByRole('button', { name: 'Sí, dejar de compartir', exact: true }).click()
      await expect(page.getByRole('button', { name: 'Mi código', exact: true })).toBeVisible()
      await expect(page.getByText('VKR-012345ABCDEF', { exact: true })).toBeVisible()
      await capture(page, 'invite-code-390')
      await page.goto(`${origin}/dashboard`)
      await expect(page.getByRole('link', { name: 'Invitar a un compañero', exact: true })).toBeVisible()
      await expect(page.getByText(partnerName, { exact: true })).toHaveCount(0)
      assert.equal(model.requests.filter(call => call.path.endsWith('/leave_companion')).length, 1)
      assert.equal((await cachedSnapshot(page, model.state.accountId)).status, 'none')
      await capture(page, 'unlinked-dashboard-390')
      completed.push('Confirmed unlink clears dashboard and replaces the cached relationship with none')
    } finally { await context.close() }
  }

  {
    const { page, context, model } = await scenario('account-isolation')
    try {
      await page.goto(`${origin}/companion?view=message`)
      await page.getByLabel('Tu mensaje').fill('Borrador privado de la cuenta A')
      assert.equal((await cachedSnapshot(page, model.state.accountId)).relationship.other.fullName, partnerName)
      // Pause application work before replacing the active fixture identity.
      await setOnline(page, false)
      await expect(page.getByRole('button', { name: 'Enviar saludo', exact: true })).toBeDisabled()
      const another = await account()
      await page.goto(`${origin}/__companion-fixture-seed`)
      await switchStoredAccount(page, another)
      model.session = authSession(another)
      await page.evaluate(session => localStorage.setItem('vekira-original-auth', JSON.stringify(session)), model.session)
      const before = model.requests.length
      await page.goto(`${origin}/companion?view=message`)
      await expect(page.getByRole('heading', { name: 'Compañero de constancia', exact: true })).toBeVisible()
      await expect(page.getByText(partnerName, { exact: true })).toHaveCount(0)
      await expect(page.getByLabel('Tu mensaje')).toHaveCount(0)
      assert.ok(!await page.locator('body').innerText().then(text => text.includes('Borrador privado de la cuenta A')))
      assert.equal(model.requests.length, before, 'Different account remains offline')
      assert.equal((await storedAccountSnapshot(page)).active, another.accountId)
      assert.equal((await cachedSnapshot(page, model.state.accountId)).relationship.other.fullName, partnerName, 'The first account cache still exists but is inaccessible to B')
      assert.equal(await cachedSnapshot(page, another.accountId), null)
      await capture(page, 'different-account-offline-390')
      completed.push('Account B cannot read A’s persisted companion cache or private draft')
    } finally { await context.close() }
  }

  assert.deepEqual(unexpectedRequests, [], 'All backend requests must have explicit fixture responses')
  assert.deepEqual(failures, [], 'No uncaught browser errors')
  console.log(`PASS ${completed.length} compiled companion journeys`)
} catch (error) {
  failures.push({ error: error.stack ?? String(error) })
  if (page && !page.isClosed()) await page.screenshot({ path: `${artifacts}/failure.png`, fullPage: true }).catch(() => {})
  throw error
} finally {
  const requestSummary = requests.map(call => call.path.endsWith('/original_app_snapshot_push_v1') ? {
    ...call, args: { p_expected_revision: call.args.p_expected_revision, p_operation_id: call.args.p_operation_id,
      payload: { accountId: call.args.p_payload.accountId, revision: call.args.p_payload.revision,
        completedSessionIds: call.args.p_payload.tables.progress_logs.map(row => row.client_session_id),
        tableCounts: Object.fromEntries(Object.entries(call.args.p_payload.tables).map(([name, rows]) => [name, rows.length])) } },
  } : call)
  await writeFile(`${artifacts}/report.json`, JSON.stringify({ completed, failures, unexpectedRequests, requests: requestSummary }, null, 2))
  await browser.close()
}
