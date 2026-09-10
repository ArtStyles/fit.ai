import { chromium, expect } from '@playwright/test'
import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { installAccountFixture, newTestAccount, storedAccountSnapshot } from './account-fixture.mjs'

const origin = process.env.MOBILE_PREVIEW_URL || 'http://127.0.0.1:4178'
const artifacts = '.artifacts/session-readiness'
const now = new Date('2026-09-09T16:00:00.000Z')
const id = number => `00000000-0000-4000-8000-${String(number).padStart(12, '0')}`
const planId = id(20), workoutId = id(21), assignmentId = id(22), versionId = id(23)
const passed = []
await mkdir(artifacts, { recursive: true })

async function fixture({ status = 'pending', modified = false } = {}) {
  const state = await newTestAccount()
  Object.assign(state.tables.profiles[0], {
    full_name: 'Prueba preparación', onboarding_done: true, timezone: 'UTC', readiness_status: status,
    activity_level: 'insufficiently_active', cardio_preferences: ['walking'], preferred_workout_days: [3],
    readiness_answers: { knownCardiovascularMetabolicOrRenalDisease: status === 'professional_clearance_required', medicallyCleared: false },
    movement_limitations: modified ? [{ region: 'Rodilla', side: 'left', status: 'stable', movementsToAvoid: ['saltos'], clinicianCleared: true }] : [],
  })
  state.tables.workout_plans = [{
    id: planId, family_id: planId, user_id: state.accountId, name: 'Plan asignado de prueba',
    week_number: 1, days_per_week: 1, is_active: true, library_slot: 'trainer', prescription_locked: true,
    trainer_assignment_id: assignmentId, trainer_assignment_version_id: versionId,
    retired_at: null, superseded_at: null, created_at: now.toISOString(), updated_at: now.toISOString(),
  }]
  state.tables.workouts = [{
    id: workoutId, plan_id: planId, user_id: state.accountId, name: 'Rutina del miércoles',
    focus: 'Fuerza', day_of_week: 3, order_in_plan: 1, estimated_duration_minutes: 30, created_at: now.toISOString(),
  }]
  state.tables.workout_exercises = [{
    id: id(24), workout_id: workoutId, exercise_id: state.tables.exercises[0].id, order_index: 1,
    sets: 1, reps: 8, rest_seconds: 60, target_rpe: 7, weight_kg: null, duration_seconds: null, notes: null,
  }]
  state.tables.session_authorizations = []
  return state
}

const browser = await chromium.launch({ headless: true })
async function runCase(name, width, options, run) {
  const state = await fixture(options)
  const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: 'reduce' })
  await context.addInitScript(() => Object.defineProperty(navigator, 'onLine', { get: () => false }))
  await context.route('**/*', route => route.request().url().startsWith(`${origin}/`) ? route.continue() : route.abort())
  const page = await context.newPage()
  await page.clock.setFixedTime(now)
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  try {
    await page.goto(`${origin}/login`)
    await expect(page.getByLabel('Correo electrónico', { exact: true })).toBeVisible()
    await installAccountFixture(page, state)
    await page.goto(`${origin}/session/${workoutId}`)
    await run(page, state)
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true)
    assert.deepEqual(errors, [])
    passed.push({ name, width, passed: true })
    console.log(`PASS ${name} at ${width}px`)
  } catch (error) {
    await page.screenshot({ path: `${artifacts}/failure-${name}-${width}.png`, fullPage: true }).catch(() => {})
    throw error
  } finally { await context.close() }
}

async function savedState(page) { return (await storedAccountSnapshot(page)).accounts[0] }
async function backupId(page, state) {
  return page.evaluate(key => JSON.parse(localStorage.getItem(key) || '{}').clientSessionId,
    `fitai_session_v2_${state.accountId}_${workoutId}`)
}
function unchangedPrescription(before, after) {
  for (const table of ['workout_plans', 'workouts', 'workout_exercises']) assert.deepEqual(after.tables[table], before.tables[table])
}

try {
  for (const width of [390, 1440]) {
    await runCase('pending-review', width, {}, async (page, state) => {
      const dialog = page.getByRole('dialog', { name: 'Preparación antes de entrenar', exact: true })
      await expect(dialog).toBeVisible()
      await expect(dialog.getByRole('combobox', { name: 'Actividad habitual', exact: true })).toBeVisible()
      const originalId = await backupId(page, state)
      assert.ok(originalId)
      assert.equal((await savedState(page)).tables.session_authorizations.length, 0)
      await page.keyboard.press('Escape')
      const reopen = page.getByRole('button', { name: 'Completar preparación', exact: true })
      await expect(reopen).toBeFocused()
      await page.screenshot({ path: `${artifacts}/pending-${width}.png`, fullPage: true })
      await reopen.click()
      await dialog.getByRole('combobox', { name: 'Actividad habitual', exact: true }).selectOption('regularly_active')
      await page.screenshot({ path: `${artifacts}/review-${width}.png`, fullPage: true })
      await dialog.getByRole('button', { name: 'Guardar y continuar', exact: true }).click()
      await expect(page.getByRole('main', { name: 'Sesión activa', exact: true })).toBeVisible()
      let saved = await savedState(page)
      assert.equal(saved.tables.profiles[0].readiness_status, 'cleared')
      assert.equal(saved.tables.profiles[0].readiness_answers.currentlyActive, true)
      assert.equal(saved.tables.session_authorizations.length, 1)
      assert.equal(saved.tables.session_authorizations[0].client_session_id, originalId)
      assert.deepEqual(saved.tables.session_authorizations[0].session_context_snapshot.plan, {
        id: planId, familyId: planId, name: 'Plan asignado de prueba', weekNumber: 1,
        prescriptionLocked: true, trainerAssignmentId: assignmentId, trainerAssignmentVersionId: versionId,
      })
      unchangedPrescription(state, saved)
      await page.reload()
      await expect(page.getByRole('main', { name: 'Sesión activa', exact: true })).toBeVisible()
      saved = await savedState(page)
      assert.equal(saved.tables.session_authorizations.length, 1)
      assert.equal(await backupId(page, state), originalId)
    })
  }
  await runCase('saved-limitations', 390, { modified: true }, async (page, state) => {
    const dialog = page.getByRole('dialog', { name: 'Preparación antes de entrenar', exact: true })
    await expect(dialog).toBeVisible()
    await expect(dialog.getByPlaceholder('Zona: rodilla, hombro...')).toHaveValue('Rodilla')
    await dialog.getByRole('button', { name: 'Guardar y continuar', exact: true }).click()
    await expect(page.getByRole('main', { name: 'Sesión activa', exact: true })).toBeVisible()
    const saved = await savedState(page)
    assert.equal(saved.tables.profiles[0].readiness_status, 'modified')
    assert.deepEqual(saved.tables.profiles[0].movement_limitations, state.tables.profiles[0].movement_limitations)
    unchangedPrescription(state, saved)
  })
  await runCase('professional-block', 390, { status: 'professional_clearance_required' }, async (page, state) => {
    const review = page.getByRole('button', { name: 'Revisar respuestas', exact: true })
    await expect(review).toBeVisible()
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await expect(page.getByRole('heading', { name: 'Necesitas autorización profesional', exact: true })).toBeVisible()
    await expect(page.getByRole('alert')).toContainText('profesional de salud')
    await review.click()
    const dialog = page.getByRole('dialog', { name: 'Preparación antes de entrenar', exact: true })
    await expect(dialog.getByLabel('Tengo una enfermedad cardiovascular, metabólica o renal diagnosticada.', { exact: true })).toBeChecked()
    await dialog.getByRole('button', { name: 'Guardar y continuar', exact: true }).click()
    await expect(review).toBeVisible()
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await expect(page.getByRole('main', { name: 'Sesión activa', exact: true })).toHaveCount(0)
    const saved = await savedState(page)
    assert.equal(saved.tables.profiles[0].readiness_status, 'professional_clearance_required')
    assert.equal(saved.tables.session_authorizations.length, 0)
    unchangedPrescription(state, saved)
    await page.screenshot({ path: `${artifacts}/professional-390.png`, fullPage: true })
    await page.getByRole('link', { name: 'Volver al plan', exact: true }).click()
    await expect(page).toHaveURL(`${origin}/plan`)
  })
  await writeFile(`${artifacts}/report.json`, JSON.stringify({ passed: true, scenarios: passed }, null, 2))
} finally { await browser.close() }
