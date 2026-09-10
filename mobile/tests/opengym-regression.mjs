import { chromium, expect } from '@playwright/test'
import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { installAccountFixture, newTestAccount, storedAccountSnapshot } from './account-fixture.mjs'

const origin = process.env.MOBILE_PREVIEW_URL || 'http://127.0.0.1:4184'
const artifacts = '.artifacts/opengym-regression'
const now = new Date('2026-09-10T16:00:00.000Z')
const id = number => `00000000-0000-4000-8000-${String(number).padStart(12, '0')}`
const planId = id(20), workoutId = id(21), assignmentId = id(22), versionId = id(23)
const passed = []
await mkdir(artifacts, { recursive: true })

async function fixture({ history = true } = {}) {
  const state = await newTestAccount()
  Object.assign(state.tables.profiles[0], {
    full_name: 'Prueba de entrenamiento', onboarding_done: true, timezone: 'America/Havana', language: 'es', readiness_status: 'cleared',
    activity_level: 'regularly_active', cardio_preferences: ['walking'], preferred_workout_days: [4],
    readiness_answers: { knownCardiovascularMetabolicOrRenalDisease: false, medicallyCleared: false }, movement_limitations: [],
  })
  state.tables.exercises = state.tables.exercises.slice(0, 2).map((exercise, index) => ({
    ...exercise,
    name: index ? 'Timed plank' : 'Push-up', name_es: index ? 'Plancha por tiempo' : 'Flexión de brazos',
    muscle_groups: [index ? 'abdominals' : 'chest'], muscle_groups_es: [index ? 'abdominales' : 'pecho'],
    is_compound: !index,
  }))
  state.tables.workout_plans = [{
    id: planId, family_id: planId, user_id: state.accountId, name: 'Plan asignado de prueba',
    week_number: 1, days_per_week: 1, duration_weeks: 4, goal: 'build_muscle', difficulty: 'beginner',
    is_active: true, library_slot: 'trainer', source_type: 'trainer_assigned', prescription_locked: true,
    trainer_assignment_id: assignmentId, trainer_assignment_version_id: versionId,
    retired_at: null, superseded_at: null, created_at: now.toISOString(), updated_at: now.toISOString(),
  }]
  state.tables.workouts = [{
    id: workoutId, plan_id: planId, user_id: state.accountId, name: 'Rutina del jueves',
    focus: 'Fuerza', day_of_week: 4, order_in_plan: 1, estimated_duration_minutes: 30, created_at: now.toISOString(),
  }]
  state.tables.workout_exercises = state.tables.exercises.map((exercise, index) => ({
    id: id(24 + index), workout_id: workoutId, exercise_id: exercise.id, order_index: index + 1,
    sets: index ? 2 : 3, reps: index ? null : 8, rest_seconds: 0, target_rpe: 7,
    weight_kg: null, duration_seconds: index ? 30 : null, notes: null,
  }))
  state.tables.session_authorizations = []
  state.tables.workout_schedule_overrides = []
  const snapshot = muscleGroups => ({
    version: 1,
    workout: { id: workoutId, name: 'Sesión histórica', focus: 'Fuerza', dayOfWeek: 4 },
    plan: null,
    exercises: state.tables.exercises.map((exercise, index) => ({
      exerciseId: exercise.id, name: exercise.name, nameEs: exercise.name_es,
      muscleGroups: muscleGroups[index], muscleGroupsEs: muscleGroups[index], isCompound: exercise.is_compound,
    })),
  })
  state.tables.progress_logs = history ? [
    { id: id(40), user_id: state.accountId, workout_id: workoutId, completed_at: '2026-09-08T16:00:00Z', duration_minutes: 20, session_context_snapshot: snapshot([['pecho'], ['abdominales']]) },
    { id: id(41), user_id: state.accountId, workout_id: workoutId, completed_at: '2026-07-01T16:00:00Z', duration_minutes: 20, session_context_snapshot: snapshot([['espalda'], ['abdominales']]) },
  ] : []
  state.tables.exercise_logs = history ? [
    { id: id(50), progress_log_id: id(40), exercise_id: state.tables.exercises[0].id, sets_completed: 3, weights_kg: [0, 0, 0], reps_completed: [8, 8, 8], duration_seconds: null },
    { id: id(51), progress_log_id: id(40), exercise_id: state.tables.exercises[1].id, sets_completed: 2, weights_kg: [], reps_completed: [], duration_seconds: 60 },
    { id: id(52), progress_log_id: id(41), exercise_id: state.tables.exercises[0].id, sets_completed: 4, weights_kg: [10, 10, 10, 10], reps_completed: [8, 8, 8, 8], duration_seconds: null },
  ] : []
  return state
}

const browser = await chromium.launch({ headless: true })
async function captureElement(page, element, path) {
  // The original app scrolls within its shell. Center the subject away from
  // fixed navigation before capturing its viewport coordinates.
  await element.evaluate(node => node.scrollIntoView({ block: 'center', behavior: 'instant' }))
  const box = await element.boundingBox()
  assert.ok(box && box.y >= 68 && box.y + box.height <= 835, 'Capture must clear fixed navigation')
  await page.screenshot({ path, clip: box })
}
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

try {
  for (const width of [360, 390, 1440]) {
    await runCase('muscle-map', width, {}, async (page, state) => {
      await page.goto(`${origin}/plan`)
      const planned = page.locator('[data-muscle-map="planned"]')
      await expect(planned).toBeVisible()
      await expect(planned.getByRole('button', { name: 'Pecho: 3 series prescritas', exact: true })).toBeVisible()
      const abdomen = planned.getByRole('button', { name: 'Abdomen: 2 series prescritas', exact: true })
      await abdomen.focus()
      await page.keyboard.press('Enter')
      await expect(abdomen).toHaveAttribute('aria-pressed', 'true')
      await expect(planned.locator('[aria-live="polite"]')).toContainText('Abdomen · 2 series prescritas')
      await page.screenshot({ path: `${artifacts}/plan-map-${width}.png`, fullPage: true })
      await captureElement(page, planned.locator(':scope > div').first(), `${artifacts}/plan-anatomy-${width}.png`)
      assert.equal(await page.locator('[data-bottom-nav-item]').count(), 5)
      const license = await page.request.get(`${origin}/third-party/MuscleMap-LICENSE.txt`)
      assert.equal(license.status(), 200)
      assert.match(await license.text(), /MIT License[\s\S]*Melih Colpan/)
      await page.goto(`${origin}/progress`)
      const completed = page.locator('[data-muscle-map="completed"]')
      await expect(completed.getByRole('button', { name: 'Pecho: 3 series completadas', exact: true })).toBeVisible()
      await expect(completed.getByRole('button', { name: 'Abdomen: 2 series completadas', exact: true })).toBeVisible()
      await expect(completed.getByRole('button', { name: 'Espalda: 4 series completadas', exact: true })).toBeVisible()
      await page.getByRole('button', { name: '4 semanas', exact: true }).click()
      await expect(completed.getByRole('button', { name: 'Espalda: 0 series completadas', exact: true })).toBeVisible()
      await expect(completed.getByRole('button', { name: 'Abdomen: 2 series completadas', exact: true })).toBeVisible()
      await completed.getByRole('button', { name: 'Pecho: 3 series completadas', exact: true }).click()
      await page.screenshot({ path: `${artifacts}/progress-map-${width}.png`, fullPage: true })
      await captureElement(page, completed.locator(':scope > div').first(), `${artifacts}/progress-anatomy-${width}.png`)
      if (width === 1440) {
        await page.evaluate(() => document.documentElement.classList.remove('dark'))
        await captureElement(page, completed.locator(':scope > div').first(), `${artifacts}/progress-anatomy-light-${width}.png`)
      }
      const saved = (await storedAccountSnapshot(page)).accounts[0]
      for (const table of ['workout_plans', 'workouts', 'workout_exercises', 'progress_logs', 'exercise_logs']) {
        assert.deepEqual(saved.tables[table], state.tables[table])
      }
    })
  }
  for (const width of [390, 1440]) {
    await runCase('reschedule-session', width, { history: false }, async (page, state) => {
      await page.goto(`${origin}/plan`)
      const panel = page.getByRole('region', { name: 'Reprogramar una sesión', exact: true })
      await expect(panel).toBeVisible()
      await panel.getByLabel('Nueva fecha', { exact: true }).selectOption('2026-09-11')
      await panel.getByRole('button', { name: 'Guardar fecha', exact: true }).click()
      await expect(panel.getByRole('status')).toContainText('Sesión reprogramada: 2026-09-11')
      await page.reload()
      await expect(panel.getByLabel('Sesión y fecha original', { exact: true })).toHaveValue(`${workoutId}:2026-09-10`)
      await expect(panel).toContainText('Fecha programada: 2026-09-11')
      await expect(panel.getByLabel('Nueva fecha', { exact: true })).toHaveValue('2026-09-11')
      await expect(panel.getByRole('button', { name: 'Guardar fecha', exact: true })).toBeDisabled()
      let saved = (await storedAccountSnapshot(page)).accounts[0]
      assert.equal(saved.tables.workout_schedule_overrides.length, 1)
      assert.equal(saved.tables.workout_schedule_overrides[0].source_date, '2026-09-10')
      assert.equal(saved.tables.workout_schedule_overrides[0].target_date, '2026-09-11')
      for (const table of ['workout_plans', 'workouts', 'workout_exercises']) assert.deepEqual(saved.tables[table], state.tables[table])
      await page.screenshot({ path: `${artifacts}/rescheduled-plan-${width}.png`, fullPage: true })
      await captureElement(page, panel, `${artifacts}/reschedule-controls-${width}.png`)
      await panel.getByRole('button', { name: 'Restaurar fecha original', exact: true }).click()
      await expect(panel.getByRole('status')).toContainText('Fecha original restaurada: 2026-09-10')
      assert.equal((await storedAccountSnapshot(page)).accounts[0].tables.workout_schedule_overrides.length, 0)
      await panel.getByLabel('Nueva fecha', { exact: true }).selectOption('2026-09-11')
      await panel.getByRole('button', { name: 'Guardar fecha', exact: true }).click()
      await expect(panel.getByRole('status')).toContainText('Sesión reprogramada: 2026-09-11')
      await page.goto(`${origin}/entrenar`)
      await expect(page).toHaveURL(/\/dashboard(?:\?|$)/)
      await expect(page.getByRole('main', { name: 'Dashboard', exact: true })).toBeVisible()
      assert.equal((await storedAccountSnapshot(page)).accounts[0].tables.session_authorizations.length, 0)
      await page.clock.setFixedTime(new Date('2026-09-11T16:00:00Z'))
      await page.goto(`${origin}/entrenar`)
      await expect(page).toHaveURL(`${origin}/session/${workoutId}`)
      await expect(page.getByRole('main', { name: 'Sesión activa', exact: true })).toBeVisible()
      const withoutChanges = page.getByRole('button', { name: 'Empezar sin cambios', exact: true })
      if (await withoutChanges.isVisible()) await withoutChanges.click()
      await page.getByLabel('Repeticiones', { exact: true }).first().fill('8')
      await page.getByRole('button', { name: 'Completar serie 1', exact: true }).click()
      await page.reload()
      await expect(page.getByRole('button', { name: /Serie anterior/ })).toBeVisible()
      for (const number of [2, 3]) {
        await page.getByLabel('Repeticiones', { exact: true }).first().fill('8')
        await page.getByRole('button', { name: `Completar serie ${number}`, exact: true }).click()
      }
      await expect(page.getByRole('heading', { name: 'Plancha por tiempo', exact: true })).toBeVisible()
      await page.getByRole('button', { name: 'Completar serie 1', exact: true }).click()
      await page.getByRole('button', { name: 'Finalizar', exact: true }).click()
      await page.getByRole('button', { name: 'Guardar sesión', exact: true }).click()
      await expect(page.getByRole('button', { name: 'Volver al dashboard', exact: true })).toBeEnabled()
      saved = (await storedAccountSnapshot(page)).accounts[0]
      assert.equal(saved.tables.progress_logs.length, 1)
      assert.equal(saved.tables.progress_logs[0].occurrence_source_date, '2026-09-10')
      assert.equal(saved.tables.progress_logs[0].occurrence_scheduled_date, '2026-09-11')
      assert.equal(saved.tables.progress_logs[0].session_context_snapshot.workout.dayOfWeek, 4)
      for (const table of ['workout_plans', 'workouts', 'workout_exercises']) assert.deepEqual(saved.tables[table], state.tables[table])
      await page.goto(`${origin}/progress`)
      await expect(page.locator('[data-muscle-map="completed"]').getByRole('button', { name: 'Pecho: 3 series completadas', exact: true })).toBeVisible()
      await expect(page.locator('[data-muscle-map="completed"]').getByRole('button', { name: 'Abdomen: 1 serie completada', exact: true })).toBeVisible()
      await page.goto(`${origin}/session/${workoutId}`)
      await expect(page.getByRole('main', { name: 'Sesión activa', exact: true })).toHaveCount(0)
      await expect(page.getByRole('alert')).toContainText('Esta rutina ya fue completada.')
      assert.equal((await storedAccountSnapshot(page)).accounts[0].tables.progress_logs.length, 1)
    })
  }
  await runCase('empty-map', 320, { history: false }, async page => {
    await page.goto(`${origin}/progress`)
    const completed = page.locator('[data-muscle-map="completed"]')
    await expect(completed.getByText('Aún no hay series completadas en este periodo.', { exact: true })).toBeVisible()
    await expect(completed.getByRole('button', { name: 'Pecho: 0 series completadas', exact: true })).toBeVisible()
    await page.screenshot({ path: `${artifacts}/empty-map-320.png`, fullPage: true })
  })
} finally {
  await writeFile(`${artifacts}/results.json`, JSON.stringify({ passed }, null, 2))
  await browser.close()
}
