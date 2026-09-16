import { chromium, expect } from '@playwright/test'
import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { installAccountFixture, newTestAccount, storedAccountSnapshot } from './account-fixture.mjs'

const origin = process.env.MOBILE_PREVIEW_URL || 'http://127.0.0.1:4178'
const artifacts = '.artifacts/guided-free-regression'
await mkdir(artifacts, {recursive:true})
const now = new Date('2026-09-15T16:00:00Z')
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const planId = id(720), workoutId = id(721)
const state = await newTestAccount()
Object.assign(state.tables.profiles[0], { full_name: 'Auditoría cruce guiada libre', onboarding_done: true, timezone: 'UTC', language: 'es', readiness_status: 'cleared', preferred_workout_days: [2], days_per_week: 1 })
state.tables.workout_plans = [{ id: planId, family_id: planId, user_id: state.accountId, name: 'Plan de auditoría', week_number: 1, days_per_week: 1, is_active: true, library_slot: 'personal', source_type: 'manual', prescription_locked: false, retired_at: null, superseded_at: null, created_at: now.toISOString(), updated_at: now.toISOString() }]
state.tables.workouts = [{ id: workoutId, plan_id: planId, user_id: state.accountId, name: 'Rutina martes auditoría', focus: 'Fuerza', day_of_week: 2, order_in_plan: 1, estimated_duration_minutes: 30, created_at: now.toISOString() }]
state.tables.workout_exercises = [{ id: id(724), workout_id: workoutId, exercise_id: state.tables.exercises[0].id, order_index: 1, sets: 1, reps: 8, rest_seconds: 0, target_rpe: 7, weight_kg: null, duration_seconds: null, notes: null }]
state.tables.session_authorizations = []
const report = { scenario: 'Guided session started, free attendance saved, guided session resumed and saved', origin, externalRequestsBlocked: [], pageErrors: [], steps: [], reproduced: false }
const browser = await chromium.launch({ headless: true })
const context = await browser.newContext({ viewport: { width: 390, height: 900 }, reducedMotion: 'reduce', isMobile: true, hasTouch: true })
await context.addInitScript(() => Object.defineProperty(navigator, 'onLine', { get: () => false }))
await context.route('**/*', route => {
  if (route.request().url().startsWith(`${origin}/`)) return route.continue()
  report.externalRequestsBlocked.push(route.request().url())
  return route.abort()
})
const page = await context.newPage()
page.setDefaultTimeout(12000)
await page.clock.setFixedTime(now)
page.on('pageerror', error => report.pageErrors.push(error.message))
const savedState = async () => (await storedAccountSnapshot(page)).accounts[0]
const backup = async () => page.evaluate(key => JSON.parse(localStorage.getItem(key) || 'null'), `fitai_session_v2_${state.accountId}_${workoutId}`)
const shot = async name => { const file = `${artifacts}/guided-free-${name}.png`; await page.screenshot({ path: file, fullPage: true }); return file }
const summary = async () => {
  const current = await savedState(), draft = await backup()
  return { url: page.url(), progressLogs: current.tables.progress_logs, exerciseLogs: current.tables.exercise_logs, authorizations: current.tables.session_authorizations, draft }
}
try {
  await page.goto(`${origin}/login`)
  await expect(page.getByLabel('Correo electrónico', { exact: true })).toBeVisible()
  await installAccountFixture(page, state)
  await page.goto(`${origin}/dashboard`)
  const nav = () => page.getByRole('navigation', { name: 'Navegación principal', exact: true })
  await nav().getByRole('link', { name: 'Entrenar', exact: true }).click()
  await expect(page).toHaveURL(`${origin}/session/${workoutId}`)
  const withoutChanges = page.getByRole('button', { name: 'Empezar sin cambios', exact: true })
  if (await withoutChanges.isVisible().catch(() => false)) await withoutChanges.click()
  await expect(page.getByRole('main', { name: 'Sesión activa', exact: true })).toBeVisible()
  await page.getByLabel('Peso en kilogramos', { exact: true }).first().fill('20')
  await page.getByLabel('Repeticiones', { exact: true }).first().fill('8')
  await page.getByRole('button', { name: 'Completar serie 1', exact: true }).click()
  await expect(page.getByText('1 de 1 series', { exact: true })).toBeVisible()
  report.beforeFree = await summary()
  assert.equal(report.beforeFree.authorizations.length, 1)
  assert.equal(report.beforeFree.draft.exercises[0].sets[0].completed, true)
  report.steps.push({ action: 'Started guided session and completed 20 kg x 8 via UI', screenshot: await shot('01-guided-started') })
  await page.getByRole('button', { name: 'Volver', exact: true }).click()
  const exitDialog = page.getByRole('dialog', { name: '¿Salir del entrenamiento?', exact: true })
  await expect(exitDialog).toBeVisible()
  report.exitWarning = await exitDialog.innerText()
  await exitDialog.getByRole('button', { name: 'Salir', exact: true }).click()
  await expect(nav().getByRole('link', { name: 'Inicio', exact: true })).toBeVisible()
  await nav().getByRole('link', { name: 'Inicio', exact: true }).click()
  await expect(page).toHaveURL(`${origin}/dashboard`)
  await page.getByRole('link', { name: /A tu manera Registrar entrenamiento/ }).click()
  await expect(page.getByRole('button', { name: 'Guardar constancia', exact: true })).toBeVisible()
  await page.getByLabel('Nombre (opcional)', { exact: true }).fill('Constancia junto a rutina')
  await page.getByRole('button', { name: 'Guardar constancia', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Entrenamiento guardado', exact: true })).toBeVisible()
  report.afterFree = await summary()
  assert.equal(report.afterFree.progressLogs.length, 1)
  assert.equal(report.afterFree.progressLogs[0].mobile_session_kind, 'free')
  report.steps.push({ action: 'Saved free attendance for same day via UI', screenshot: await shot('02-free-saved') })
  await page.getByRole('link', { name: 'Volver a Inicio', exact: true }).click()
  await expect(page).toHaveURL(`${origin}/dashboard`)
  await page.getByRole('link', { name: 'Continuar Rutina martes auditoría', exact: true }).click()
  await expect(page.getByRole('main', { name: 'Sesión activa', exact: true })).toBeVisible()
  await expect(page.getByText('1 de 1 series', { exact: true })).toBeVisible()
  report.resumed = await summary()
  assert.equal(report.resumed.draft.clientSessionId, report.beforeFree.draft.clientSessionId)
  assert.deepEqual(report.resumed.draft.exercises[0].sets, report.beforeFree.draft.exercises[0].sets)
  await page.getByRole('button', { name: 'Finalizar', exact: true }).click()
  await page.getByRole('button', { name: 'Guardar sesión', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Volver al dashboard', exact: true })).toBeEnabled()
  const saved = await summary()
  assert.equal(saved.progressLogs.length, 2)
  assert.equal(saved.exerciseLogs.length, 1)
  assert.deepEqual(saved.exerciseLogs[0].weights_kg, [20])
  assert.deepEqual(saved.exerciseLogs[0].reps_completed, [8])
  assert.ok(saved.authorizations[0].consumed_at)
  assert.equal(saved.progressLogs.filter(log => log.mobile_session_kind === 'free').length, 1)
  report.steps.push({action: 'Guided session saved alongside free attendance', screenshot: await shot('03-both-saved')})
  await page.getByRole('button', {name: 'Volver al dashboard', exact:true}).click()
  await page.reload()
  assert.equal((await savedState()).tables.progress_logs.length, 2)
  await page.goto(origin + '/history')
  await expect(page.getByRole('link', {name: /Constancia junto a rutina/})).toBeVisible()
  assert.equal((await savedState()).tables.exercise_logs.length, 1)
  assert.deepEqual(report.pageErrors, [])
  report.passed = true
  console.log('PASS guided draft survives free attendance; both records and guided set persist after reload')
} catch (error) {
  report.failure = String(error?.stack || error)
  report.failureText = await page.locator('body').innerText().catch(() => '')
  report.failureScreenshot = await shot('failure').catch(() => null)
  report.lastState = await summary().catch(() => null)
  console.error(report.failure)
  console.error(report.failureText.slice(-4500))
  process.exitCode = 1
} finally {
  await writeFile(`${artifacts}/guided-free-conflict-e2e.json`, JSON.stringify(report, null, 2))
  await context.close()
  await browser.close()
}
