import { chromium, expect } from '@playwright/test'
import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { installAccountFixture, newTestAccount, storedAccountSnapshot } from './account-fixture.mjs'

const origin = process.env.MOBILE_PREVIEW_URL || 'http://127.0.0.1:4184'
const artifacts = '.artifacts/personal-exercises'
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
await mkdir(artifacts, { recursive: true })
const browser = await chromium.launch({ headless: true })
const results = []
async function stored(page) { return (await storedAccountSnapshot(page)).accounts[0] }
async function shot(page, name) {
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `overflow ${name}`)
  await page.screenshot({ path: `${artifacts}/${name}.png`, fullPage: true })
}
async function setup(language = 'es', plan = false) {
  const state = await newTestAccount({ linked: false })
  Object.assign(state.tables.profiles[0], { full_name: 'Marina', onboarding_done: true, language, timezone: 'America/Havana', days_per_week: 3, readiness_status: 'cleared' })
  for (const key of ['workout_plans', 'workouts', 'workout_exercises', 'progress_logs', 'exercise_logs', 'session_authorizations']) state.tables[key] = []
  state.tables.exercises = [
    { id: id(10), name: 'Bench Press', name_es: 'Press de banca', muscle_groups: ['chest'], muscle_groups_es: ['pectoral mayor'], equipment: ['barbell'], difficulty: 'intermediate', exercise_type: 'strength', is_public: true, is_compound: true, image_url: null },
    { id: id(11), name: 'Foreign private', name_es: 'Ajeno privado', user_id: id(99), is_public: false, source: 'mobile-personal', muscle_groups: ['chest'], equipment: [], exercise_type: 'strength' },
  ]
  if (plan) {
    state.tables.workout_plans = [{ id: id(20), user_id: state.accountId, name: 'Rutina propia', description: null, goal: 'hypertrophy', days_per_week: 1, duration_weeks: 4, difficulty: 'beginner', source_type: 'manual', prescription_locked: false, created_at: '2026-09-01T12:00:00Z', is_active: true, retired_at: null, superseded_at: null, family_id: id(20), library_slot: 'personal' }]
    state.tables.workouts = [{ id: id(21), user_id: state.accountId, plan_id: id(20), name: 'Mi rutina', focus: null, day_of_week: 4, order_in_plan: 0, estimated_duration_minutes: 30 }]
    state.tables.workout_exercises = [{ id: id(22), workout_id: id(21), exercise_id: id(10), order_index: 0, sets: 2, reps: 8, weight_kg: null, duration_seconds: null, rest_seconds: 60, target_rpe: 7, notes: null }]
  }
  return state
}
async function run(name, width, language, plan, action) {
  const state = await setup(language, plan)
  const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: 'reduce', isMobile: width < 600, hasTouch: width < 600 })
  await context.addInitScript(() => Object.defineProperty(navigator, 'onLine', { get: () => false }))
  await context.route('**/*', route => route.request().url().startsWith(`${origin}/`) ? route.continue() : route.abort())
  const page = await context.newPage(); page.setDefaultTimeout(12000)
  const errors = []; page.on('pageerror', error => errors.push(error.message))
  await page.clock.install({ time: new Date('2026-09-17T16:00:00Z') })
  try {
    await page.goto(`${origin}/login`)
    await expect(page.getByLabel('Correo electrónico', { exact: true })).toBeVisible()
    await installAccountFixture(page, state)
    await action(page, state)
    const after = await stored(page)
    assert.deepEqual(after.tables.exercises.filter(row => row.is_public), state.tables.exercises.filter(row => row.is_public), 'public catalog unchanged')
    assert.deepEqual(after.tables.exercises.find(row => row.id === id(11)), state.tables.exercises.find(row => row.id === id(11)), 'foreign private untouched')
    assert.deepEqual(errors, [])
    results.push({ name, width, language, passed: true }); console.log(`PASS ${name} ${width}px ${language}`)
  } catch (error) {
    await shot(page, `failure-${name}-${width}`).catch(() => {})
    console.log((await page.locator('body').innerText()).slice(-7000)); throw error
  } finally { await context.close() }
}
async function create(page, name, { language = 'es', muscle, timed = false, description, illustration = false } = {}) {
  const dialog = page.getByRole('dialog').last()
  await dialog.getByRole('button', { name: language === 'es' ? 'Crear ejercicio' : 'Create exercise', exact: true }).click()
  await dialog.getByLabel(language === 'es' ? 'Nombre' : 'Name', { exact: true }).fill(name)
  if (description) await dialog.getByLabel(language === 'es' ? 'Descripción (opcional)' : 'Description (optional)', { exact: true }).fill(description)
  if (timed) await dialog.getByRole('radio', { name: language === 'es' ? 'Tiempo' : 'Time', exact: true }).check()
  if (muscle) await dialog.getByRole('button', { name: muscle, exact: true }).click()
  if (illustration) {
    await dialog.getByRole('button', { name: language === 'es' ? 'Elegir ilustración' : 'Choose illustration', exact: true }).click()
    await dialog.getByRole('button', { name: muscle, exact: true }).last().click()
  }
  await shot(page, `create-${name.replace(/\W+/g, '-')}`)
  await dialog.getByRole('button', { name: language === 'es' ? 'Crear ejercicio' : 'Create exercise', exact: true }).click()
  await expect(dialog.getByRole('button', { name: new RegExp(name) }).first()).toHaveAttribute('aria-pressed', 'true')
  return dialog
}
try {
  await run('free-private-no-photo', 390, 'es', false, async page => {
    await page.goto(`${origin}/registrar`)
    await page.getByLabel('Nombre (opcional)', { exact: true }).fill('Entrenamiento personal')
    await page.getByRole('button', { name: 'Añadir ejercicios', exact: true }).click()
    await expect(page.getByText('Ajeno privado', { exact: true })).toHaveCount(0)
    let dialog = await create(page, 'Mi ejercicio sin foto')
    let state = await stored(page)
    const first = state.tables.exercises.find(row => row.name === 'Mi ejercicio sin foto')
    assert.equal(first.is_public, false); assert.equal(first.user_id, state.accountId)
    assert.equal(first.image_url, null); assert.ok(!first.description)
    assert.equal(state.tables.progress_logs.length, 0)
    await page.keyboard.press('Escape')
    await expect(page.getByLabel('Mi ejercicio sin foto, serie 1, reps', { exact: true })).toHaveCount(0)
    await page.getByRole('button', { name: 'Añadir ejercicios', exact: true }).click()
    dialog = page.getByRole('dialog')
    const savedChoice = dialog.getByRole('button', { name: /Mi ejercicio sin foto/ }).first()
    await expect(savedChoice).toHaveAttribute('aria-pressed', 'false')
    assert.equal((await stored(page)).tables.progress_logs.length, 0)
    await savedChoice.click()
    await dialog.getByRole('button', { name: 'Añadir 1 ejercicio', exact: true }).click()
    await page.getByLabel('Mi ejercicio sin foto, serie 1, reps', { exact: true }).fill('12')
    await page.getByRole('button', { name: 'Añadir ejercicios', exact: true }).click()
    dialog = await create(page, 'Mi trapecio temporal', { muscle: 'Trapecio', timed: true, illustration: true, description: 'Mi variante de contracción estática.' })
    await dialog.getByRole('button', { name: 'Añadir 1 ejercicio', exact: true }).click()
    await page.getByLabel('Mi trapecio temporal, serie 1, segundos', { exact: true }).fill('45')
    await expect(page.getByRole('status').filter({ hasText: 'Borrador guardado' })).toBeVisible()
    await page.reload()
    await expect(page.getByLabel('Mi ejercicio sin foto, serie 1, reps', { exact: true })).toHaveValue('12')
    await expect(page.getByLabel('Mi trapecio temporal, serie 1, segundos', { exact: true })).toHaveValue('45')
    await shot(page, 'free-private-fields-390')
    await page.getByRole('button', { name: 'Guardar entrenamiento', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Entrenamiento guardado', exact: true })).toBeVisible()
    state = await stored(page)
    assert.equal(state.tables.progress_logs.length, 1)
    const second = state.tables.exercises.find(row => row.name === 'Mi trapecio temporal')
    assert.equal(second.image_url, '/exercises/personal/traps.svg')
    assert.deepEqual(state.tables.exercise_logs.find(row => row.exercise_id === second.id).duration_seconds, 45)
    await page.goto(`${origin}/exercises/${second.id}`)
    await expect(page.getByText('Mi variante de contracción estática.', { exact: true })).toBeVisible()
    await expect(page.locator('img[src="/exercises/personal/traps.svg"]').first()).toBeVisible()
    await shot(page, 'private-profile-390')
    await page.goto(`${origin}/progress`)
    await page.locator('[data-muscle-explorer] summary').click()
    await expect(page.locator('[data-muscle-map="completed"]').getByRole('button', { name: 'Trapecio: 1 serie completada', exact: true })).toBeVisible()
    await expect(page.locator('[data-muscle-map="completed"]').getByRole('button', { name: 'Pecho: 0 series completadas', exact: true })).toBeVisible()
  })
  await run('private-plan-reload', 390, 'es', true, async page => {
    await page.goto(`${origin}/plan`)
    await page.getByRole('button', { name: /^Mi rutina/ }).click()
    await page.getByRole('button', { name: 'Editar estructura', exact: true }).click()
    await page.getByRole('button', { name: 'Agregar ejercicio', exact: true }).click()
    const dialog = await create(page, 'Mi plancha personal', { muscle: 'Abdomen', timed: true, illustration: true })
    await dialog.getByRole('button', { name: 'Agregar 1 ejercicio', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Más opciones: Mi plancha personal', exact: true })).toBeVisible()
    let state = await stored(page)
    const privateRow = state.tables.exercises.find(row => row.name === 'Mi plancha personal')
    const assigned = state.tables.workout_exercises.find(row => row.exercise_id === privateRow.id)
    assert.equal(assigned.duration_seconds, 30); assert.equal(assigned.reps, null)
    await page.reload()
    await page.getByRole('button', { name: /^Mi rutina/ }).click()
    await expect(page.getByRole('dialog', { name: 'Mi rutina', exact: true }).getByText(/Mi plancha personal/)).toBeVisible()
    await expect(page.getByRole('dialog', { name: 'Mi rutina', exact: true }).getByText(/3 × 30 s/)).toBeVisible()
    await shot(page, 'plan-private-390')
    state = await stored(page)
    assert.equal(state.tables.workout_exercises.length, 2)
    assert.equal(state.tables.progress_logs.length, 0)
    await page.getByRole('dialog', { name: 'Mi rutina', exact: true }).getByRole('link', { name: 'Empezar entrenamiento', exact: true }).click()
    await page.waitForURL(/\/session\//)
    const preSession = page.getByRole('button', { name: 'Empezar sin cambios', exact: true })
    if (await preSession.isVisible()) await preSession.click()
    await page.getByLabel('Menú del ejercicio', { exact: true }).click()
    await page.getByRole('button', { name: 'Sin equipo', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Mi plancha personal', exact: true })).toBeVisible()
    await expect(page.getByLabel('Peso en kilogramos', { exact: true })).toHaveCount(0)
    await page.getByRole('button', { name: 'Iniciar', exact: true }).click()
    await page.clock.runFor(31000)
    await page.getByRole('button', { name: 'Completar serie 1', exact: true }).click()
    await page.getByRole('button', { name: 'Finalizar', exact: true }).click()
    await page.getByRole('button', { name: 'Guardar sesión', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Volver al dashboard', exact: true })).toBeEnabled()
    state = await stored(page)
    assert.equal(state.tables.progress_logs.length, 1)
    assert.equal(state.tables.exercise_logs.find(row => row.exercise_id === privateRow.id).duration_seconds, 30)
  })
  for (const [width, language] of [[320, 'es'], [390, 'en'], [1440, 'es']]) await run('responsive-form-cancel', width, language, false, async page => {
    await page.goto(`${origin}/registrar`)
    await expect(page.getByRole('button', { name: language === 'es' ? 'Añadir ejercicios' : 'Add exercises', exact: true })).toBeVisible()
    await shot(page, `register-${width}-${language}`)
    await page.getByRole('button', { name: language === 'es' ? 'Añadir ejercicios' : 'Add exercises', exact: true }).click()
    const dialog = page.getByRole('dialog')
    await dialog.getByRole('button', { name: language === 'es' ? 'Crear ejercicio' : 'Create exercise', exact: true }).click()
    await dialog.getByLabel(language === 'es' ? 'Nombre' : 'Name', { exact: true }).fill('Cancelled')
    await shot(page, `form-${width}-${language}`)
    await dialog.getByRole('button', { name: language === 'es' ? 'Volver' : 'Back', exact: true }).last().click()
    await page.keyboard.press('Escape')
    await expect(page.getByRole('button', { name: language === 'es' ? 'Añadir ejercicios' : 'Add exercises', exact: true })).toBeFocused()
    assert.equal((await stored(page)).tables.exercises.length, 2)
  })
  await writeFile(`${artifacts}/results.json`, JSON.stringify(results, null, 2))
} finally { await browser.close() }
