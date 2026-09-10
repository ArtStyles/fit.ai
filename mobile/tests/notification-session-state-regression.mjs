import { chromium, expect } from '@playwright/test'
import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { installAccountFixture, newTestAccount, storedAccountSnapshot } from './account-fixture.mjs'

const origin = process.env.MOBILE_PREVIEW_URL || 'http://127.0.0.1:4178'
const artifacts = '.artifacts/notification-session-state'
const now = new Date('2026-09-09T16:00:00.000Z')
const id = number => `00000000-0000-4000-8000-${String(number).padStart(12, '0')}`
const planId = id(20), workoutId = id(21), notificationId = id(30)
const results = []
await mkdir(artifacts, { recursive: true })

async function fixture({ checkIn = false, notification = null, completed = false, planNotice = null, extraUnread = false } = {}) {
  const state = await newTestAccount({ linked: false })
  Object.assign(state.tables.profiles[0], {
    full_name: 'Prueba de estados', onboarding_done: true, timezone: 'UTC', readiness_status: 'cleared',
    activity_level: 'regularly_active', cardio_preferences: ['walking'], preferred_workout_days: [3],
    last_check_in_at: checkIn ? null : now.toISOString(),
  })
  state.tables.workout_plans = [{ id: planId, family_id: planId, user_id: state.accountId,
    name: 'Plan de prueba', week_number: 1, days_per_week: 1, is_active: true, library_slot: 'personal',
    prescription_locked: false, retired_at: null, superseded_at: null, ai_notes: null,
    created_at: now.toISOString(), updated_at: now.toISOString() }]
  state.tables.workouts = [{ id: workoutId, plan_id: planId, user_id: state.accountId, name: 'Rutina del miércoles',
    focus: 'Fuerza', day_of_week: 3, order_in_plan: 1, estimated_duration_minutes: 30, created_at: now.toISOString() }]
  state.tables.workout_exercises = [{ id: id(24), workout_id: workoutId, exercise_id: state.tables.exercises[0].id,
    order_index: 1, sets: 1, reps: 8, rest_seconds: 60, target_rpe: 7, weight_kg: null, duration_seconds: null, notes: null }]
  state.tables.session_authorizations = []
  state.tables.notification_attention_dismissals = []
  if (planNotice) {
    state.tables.workout_plans[0].ai_notes = 'Hemos actualizado tu rutina de fuerza.'
    if (planNotice === 'dismissed') state.tables.notification_attention_dismissals = [{
      id: id(31), user_id: state.accountId, notice_key: `plan-update:${planId}:${now.toISOString()}`,
      dismissed_at: now.toISOString(),
    }]
    if (planNotice === 'updated') state.tables.workout_plans[0].created_at = '2026-08-01T16:00:00.000Z'
  }
  state.tables.product_notifications = notification ? [{ id: notificationId, user_id: state.accountId,
    type: 'coaching_request_accepted', title: 'Rutina actualizada de prueba', body: 'Tu entrenador revisó la rutina.',
    url: null, created_at: now.toISOString(), read_at: notification === 'read' ? now.toISOString() : null,
    dismissed_at: notification === 'dismissed' ? now.toISOString() : null }] : []
  if (extraUnread) state.tables.product_notifications.push({ ...state.tables.product_notifications[0],
    id: id(32), title: 'Segunda novedad de prueba', read_at: null })
  if (completed) state.tables.progress_logs = [{ id: id(40), user_id: state.accountId, workout_id: workoutId,
    client_session_id: id(41), completed_at: '2026-09-09T15:00:00.000Z', duration_minutes: 25,
    total_volume_kg: 160, notes: null, created_at: now.toISOString() }]
  return state
}

const browser = await chromium.launch({ headless: true })
async function scenario(name, options, run) {
  if (process.env.SCENARIO && !name.includes(process.env.SCENARIO)) return
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' })
  // Notifications are a connected route. These local-account fixtures exercise
  // its real SQLite actions without contacting any external service.
  await context.addInitScript(() => Object.defineProperty(navigator, 'onLine', { get: () => true }))
  await context.route('**/*', route => route.request().url().startsWith(`${origin}/`) ? route.continue() : route.abort())
  const page = await context.newPage()
  page.setDefaultTimeout(7000)
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  await page.clock.setFixedTime(now)
  try {
    const state = await fixture(options)
    await page.goto(`${origin}/login`)
    await expect(page.getByLabel('Correo electrónico', { exact: true })).toBeVisible()
    await installAccountFixture(page, state)
    await page.goto(`${origin}/dashboard`)
    await expect(page.getByRole('link', { name: 'Abrir notificaciones', exact: true })).toBeVisible()
    await run(page, state)
    assert.deepEqual(errors, [])
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true)
    await page.screenshot({ path: `${artifacts}/${name}.png`, fullPage: true })
    results.push({ name, passed: true })
    console.log(`PASS ${name}`)
  } catch (error) {
    await page.screenshot({ path: `${artifacts}/failure-${name}.png`, fullPage: true }).catch(() => {})
    results.push({ name, passed: false, error: error.message })
    console.error(`FAIL ${name}: ${error.message}`)
  } finally { await context.close() }
}

const bell = page => page.getByRole('link', { name: 'Abrir notificaciones', exact: true })
const dot = page => bell(page).locator('span[aria-hidden="true"]')
const nav = page => page.getByRole('navigation', { name: 'Navegación principal', exact: true })
const dock = page => page.getByRole('complementary', { name: 'Entrenamiento en curso', exact: true })
async function home(page) {
  await nav(page).getByRole('link', { name: 'Inicio', exact: true }).click()
  await expect(bell(page)).toBeVisible()
}
async function snapshot(page) { return (await storedAccountSnapshot(page)).accounts[0] }

try {
  await scenario('empty-inbox', {}, async page => {
    await expect(dot(page)).toHaveCount(0)
    await bell(page).click()
    await expect(page.getByText('No tienes notificaciones todavía', { exact: true })).toBeVisible()
    await home(page)
    await expect(dot(page)).toHaveCount(0)
  })
  await scenario('dismiss-profile-attention', { checkIn: true }, async page => {
    await expect(dot(page)).toHaveCount(1)
    await bell(page).click()
    await page.getByRole('button', { name: 'Quitar aviso de revisión del perfil', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Quitar aviso de revisión del perfil', exact: true })).toHaveCount(0)
    await home(page)
    await expect(dot(page)).toHaveCount(0)
    await page.reload()
    await expect(bell(page)).toBeVisible()
    await expect(dot(page)).toHaveCount(0)
  })
  await scenario('read-activity', { notification: 'unread' }, async page => {
    await expect(dot(page)).toHaveCount(1)
    await bell(page).click()
    await page.getByRole('button', { name: 'Marcar como leída: Rutina actualizada de prueba', exact: true }).click()
    await expect.poll(async () => (await snapshot(page)).tables.product_notifications[0].read_at).not.toBeNull()
    await home(page)
    await expect(dot(page)).toHaveCount(0)
    await bell(page).click()
    await expect(page.getByText('Rutina actualizada de prueba', { exact: true })).toBeVisible()
  })
  await scenario('dismissed-plan-notice', { planNotice: 'dismissed' }, async page => {
    await expect(dot(page)).toHaveCount(0)
    await bell(page).click()
    await expect(page.getByText('No tienes notificaciones todavía', { exact: true })).toBeVisible()
    await home(page)
    await expect(dot(page)).toHaveCount(0)
  })
  await scenario('recently-updated-plan-notice', { planNotice: 'updated' }, async page => {
    await expect(dot(page)).toHaveCount(1)
    await bell(page).click()
    await expect(page.getByText('Hemos actualizado tu rutina de fuerza.', { exact: true })).toBeVisible()
  })
  await scenario('dismiss-activity', { notification: 'unread' }, async page => {
    await expect(dot(page)).toHaveCount(1)
    await bell(page).click()
    await page.getByRole('button', { name: 'Quitar notificación: Rutina actualizada de prueba', exact: true }).click()
    await expect(page.getByText('No tienes notificaciones todavía', { exact: true })).toBeVisible()
    await home(page)
    await expect(dot(page)).toHaveCount(0)
    await page.reload()
    await expect(bell(page)).toBeVisible()
    await expect(dot(page)).toHaveCount(0)
  })
  await scenario('reading-one-keeps-other-unread', { notification: 'unread', extraUnread: true }, async page => {
    await bell(page).click()
    await expect(page.getByText('2 sin leer', { exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'Marcar como leída: Rutina actualizada de prueba', exact: true }).click()
    await expect(page.getByText('1 sin leer', { exact: true })).toBeVisible()
    await home(page)
    await expect(dot(page)).toHaveCount(1)
    await bell(page).click()
    await expect(page.getByText('1 sin leer', { exact: true })).toBeVisible()
  })
  await scenario('completed-session-no-dock', { completed: true }, async (page, state) => {
    await expect(dock(page)).toHaveCount(0)
    await nav(page).getByRole('link', { name: 'Entrenar', exact: true }).click()
    await expect(page.getByText('Esta rutina ya fue completada.', { exact: true })).toBeVisible()
    await page.goBack()
    await expect(bell(page)).toBeVisible()
    await expect(dock(page)).toHaveCount(0)
    await page.reload()
    await expect(bell(page)).toBeVisible()
    await expect(dock(page)).toHaveCount(0)
    const saved = await snapshot(page)
    assert.deepEqual(saved.tables.progress_logs, state.tables.progress_logs)
    assert.equal(saved.tables.session_authorizations.length, 0)
  })
  await scenario('authorized-session-keeps-dock', {}, async page => {
    await nav(page).getByRole('link', { name: 'Entrenar', exact: true }).click()
    await expect(page.getByRole('main', { name: 'Sesión activa', exact: true })).toBeVisible()
    await page.goBack()
    await expect(bell(page)).toBeVisible()
    await expect(dock(page)).toBeVisible()
    await page.reload()
    await expect(dock(page)).toBeVisible()
    await dock(page).getByRole('link', { name: 'Continuar Rutina del miércoles', exact: true }).click()
    await expect(page.getByRole('main', { name: 'Sesión activa', exact: true })).toBeVisible()
    assert.equal((await snapshot(page)).tables.session_authorizations.length, 1)
  })
  await scenario('legacy-rejected-attempt-no-dock', { completed: true }, async (page, state) => {
    await nav(page).getByRole('link', { name: 'Entrenar', exact: true }).click()
    await expect(page.getByText('Esta rutina ya fue completada.', { exact: true })).toBeVisible()
    // Reproduce the 1.1.8 on-disk shape, which published every new draft as active.
    const before = await page.evaluate(({ userId, workoutId }) => {
      const key = `fitai_session_v2_${userId}_${workoutId}`
      const saved = JSON.parse(localStorage.getItem(key))
      delete saved.activationState
      localStorage.setItem(key, JSON.stringify(saved))
      localStorage.setItem(`fitai_active_session_v2_${userId}`, JSON.stringify({ version: 2, userId, workoutId }))
      return saved
    }, { userId: state.accountId, workoutId })
    await page.reload()
    await expect(page.getByText('Esta rutina ya fue completada.', { exact: true })).toBeVisible()
    await page.goBack()
    await expect(bell(page)).toBeVisible()
    await expect(dock(page)).toHaveCount(0)
    const after = await page.evaluate(key => JSON.parse(localStorage.getItem(key)), `fitai_session_v2_${state.accountId}_${workoutId}`)
    assert.equal(after.clientSessionId, before.clientSessionId)
    // Existing backup restoration canonicalizes these empty legacy metadata
    // fields. Every prescription, set, note and exercise identity must survive.
    const restoredExercises = before.exercises.map(exercise => {
      assert.equal(exercise.lastReps, null)
      assert.equal(exercise.lastWeightsKg, null)
      const { lastReps: _lastReps, lastWeightsKg: _lastWeightsKg, ...restored } = exercise
      return { ...restored, weightSuggestionBasis: exercise.weightSuggestionBasis ?? null }
    })
    assert.deepEqual(after.exercises, restoredExercises)
    assert.deepEqual((await snapshot(page)).tables.progress_logs, state.tables.progress_logs)
  })
  await writeFile(`${artifacts}/report.json`, JSON.stringify({ passed: results.every(result => result.passed), scenarios: results }, null, 2))
} finally { await browser.close() }
if (results.some(result => !result.passed)) process.exitCode = 1
