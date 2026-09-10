import { chromium, expect } from '@playwright/test'
import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { installAccountFixture, newTestAccount, storedAccountSnapshot } from './account-fixture.mjs'

const origin = process.env.MOBILE_PREVIEW_URL || 'http://127.0.0.1:4184'
const artifacts = '.artifacts/muscle-catalog-regression'
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const reportedSlugs = ['arnold-press-mancuernas', 'press-banca-barra', 'press-frances-tumbado-barra-ez', 'press-inclinado-mancuernas', 'press-militar-pie-barra']
const otherSlugs = ['sentadilla-trasera-barra', 'peso-muerto-rumano-barra', 'remo-sentado-polea', 'face-pull-polea']
const now = new Date('2026-09-10T23:00:00Z')
const passed = []
await mkdir(artifacts, { recursive: true })

async function fixture({ language = 'es', other = false } = {}) {
  const state = await newTestAccount()
  Object.assign(state.tables.profiles[0], { full_name: 'Prueba muscular', onboarding_done: true, timezone: 'America/Havana', language })
  const exercises = (other ? otherSlugs : reportedSlugs).map(slug => state.tables.exercises.find(exercise => exercise.external_id === slug))
  assert(exercises.every(Boolean))
  state.tables.workout_plans = [{ id: id(1), family_id: id(1), user_id: state.accountId, name: 'Plan de prueba', is_active: true, prescription_locked: false, created_at: now.toISOString() }]
  state.tables.workouts = [{ id: id(2), user_id: state.accountId, plan_id: id(1), name: 'Sesión de prueba', day_of_week: 4, order_index: 0 }]
  state.tables.workout_exercises = exercises.map((exercise, index) => ({ id: id(10 + index), workout_id: id(2), exercise_id: exercise.id, order_index: index, sets: 3, reps: 10, rest_seconds: 90, target_rpe: 7, weight_kg: 20 }))
  state.tables.progress_logs = [{ id: id(3), user_id: state.accountId, workout_id: id(2), completed_at: now.toISOString(), duration_minutes: 40,
    session_context_snapshot: { version: 1, workout: { id: id(2), name: 'Sesión de prueba', focus: null, dayOfWeek: 4 }, plan: null,
      exercises: exercises.map(exercise => ({ exerciseId: exercise.id, name: exercise.name, nameEs: exercise.name_es, muscleGroups: exercise.muscle_groups, muscleGroupsEs: exercise.muscle_groups_es, isCompound: exercise.is_compound })) } }]
  state.tables.exercise_logs = exercises.map((exercise, index) => ({ id: id(20 + index), progress_log_id: id(3), exercise_id: exercise.id,
    sets_completed: 3, weights_kg: [20, 20, 20], reps_completed: [10, 10, 10], rpe_values: [7, 7, 7], notes: null }))
  return { state, exercises }
}
async function capture(page, map, name) {
  await map.evaluate(node => {
    node.scrollIntoView({ block: 'start', behavior: 'instant' })
    let parent = node.parentElement
    while (parent && getComputedStyle(parent).overflowY !== 'auto') parent = parent.parentElement
    if (parent) parent.scrollTop -= 84
  })
  await page.screenshot({ path: `${artifacts}/${name}.png`, fullPage: true })
}
const browser = await chromium.launch({ headless: true })
async function run(name, width, options, check) {
  const { state, exercises } = await fixture(options)
  const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: 'reduce', isMobile: width < 600, hasTouch: width < 600 })
  await context.addInitScript(() => Object.defineProperty(navigator, 'onLine', { get: () => false }))
  await context.route('**/*', route => route.request().url().startsWith(origin + '/') ? route.continue() : route.abort())
  const page = await context.newPage()
  await page.clock.setFixedTime(now)
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  try {
    await page.goto(origin + '/login')
    await installAccountFixture(page, state)
    await page.goto(origin + '/progress')
    await check(page, exercises)
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true)
    assert.deepEqual(errors, [])
    const saved = (await storedAccountSnapshot(page)).accounts[0]
    for (const table of ['exercises', 'progress_logs', 'exercise_logs', 'workouts', 'workout_exercises']) assert.deepEqual(saved.tables[table], state.tables[table])
    passed.push({ name, width, passed: true })
    console.log(`PASS ${name} at ${width}px`)
  } catch (error) {
    await page.screenshot({ path: `${artifacts}/failure-${name}-${width}.png`, fullPage: true }).catch(() => {})
    throw error
  } finally { await context.close() }
}

try {
  for (const width of [320, 390, 1440]) {
    await run('reported-session', width, {}, async (page, exercises) => {
      const map = page.locator('[data-muscle-map="completed"]')
      for (const [name, sets] of [['Pecho', 6], ['Hombros', 12], ['Tríceps', 15], ['Trapecio', 3], ['Ancóneo', 3], ['Espalda', 0], ['Zona lumbar', 0]]) {
        await expect(map.getByRole('button', { name: `${name}: ${sets} series completadas`, exact: true })).toHaveCount(1)
      }
      await expect(map).not.toContainText('Sin zona específica en el mapa:')
      for (const region of ['chest', 'deltoids', 'triceps', 'trapezius']) {
        await expect(map.locator(`g[data-muscle-region="${region}"]`).first()).toHaveAttribute('class', /fill-violet/)
      }
      const neutral = await map.locator('[data-muscle-region="upperBack"] path').first().evaluate(node => getComputedStyle(node).fill)
      const trap = await map.locator('[data-muscle-region="trapezius"] path').first().evaluate(node => getComputedStyle(node).fill)
      assert.notEqual(neutral, trap)
      await capture(page, map, `reported-${width}`)
      // The full posterior region is large enough for a real touch/click target.
      const trapPath = map.locator('[data-muscle-region="trapezius"] path').nth(2)
      await trapPath.click()
      const details = map.getByRole('region', { name: 'Detalle de Trapecio', exact: true })
      await expect(details.locator(':scope > ul > li')).toHaveCount(1)
      await expect(details).toContainText('Press militar de pie con barra')
      await expect(details).toContainText('Sin registros en el periodo anterior para comparar.')
      await map.getByRole('button', { name: 'Pecho: 6 series completadas', exact: true }).focus()
      await page.keyboard.press('Enter')
      const chest = map.getByRole('region', { name: 'Detalle de Pecho', exact: true })
      await expect(chest.locator(':scope > ul > li')).toHaveCount(2)
      const bench = exercises.find(exercise => exercise.external_id === 'press-banca-barra')
      await chest.getByRole('link', { name: 'Historial de Press de banca con barra', exact: true }).click()
      await expect(page).toHaveURL(`${origin}/exercises/${bench.id}#exercise-history-title`)
      await expect(page.getByRole('heading', { name: 'Historial del ejercicio', exact: true })).toBeInViewport()
      await page.goto(origin + '/progress')
      await page.reload()
      await expect(map.getByRole('button', { name: 'Hombros: 12 series completadas', exact: true })).toHaveCount(1)
      await map.getByRole('button', { name: 'Ancóneo: 3 series completadas', exact: true }).click()
      await expect(map.getByRole('region', { name: 'Detalle de Ancóneo', exact: true })).toContainText('Press francés tumbado con barra EZ')
      await page.goto(origin + '/plan')
      const planMap = page.locator('[data-muscle-map="planned"]')
      await expect(planMap.getByRole('button', { name: 'Pecho: 6 series prescritas', exact: true })).toHaveCount(1)
      await expect(planMap.getByRole('button', { name: 'Trapecio: 3 series prescritas', exact: true })).toHaveCount(1)
    })
  }
  await run('other-session', 390, { other: true }, async page => {
    const map = page.locator('[data-muscle-map="completed"]')
    for (const name of ['Glúteos', 'Cuádriceps', 'Isquiotibiales', 'Espalda', 'Zona lumbar', 'Trapecio', 'Bíceps', 'Hombros', 'Manguito rotador']) {
      await expect(map.getByRole('button', { name: new RegExp(`^${name}: [1-9]\\d* series completadas$`) })).toHaveCount(1)
    }
    await expect(map).not.toContainText('Sin zona específica en el mapa:')
    await capture(page, map, 'other-session-390')
    await map.getByRole('button', { name: /^Manguito rotador:/ }).click()
    await expect(map.getByRole('region', { name: 'Detalle de Manguito rotador', exact: true })).toContainText('Face pull')
  })
  await run('english-session', 390, { language: 'en' }, async page => {
    const map = page.locator('[data-muscle-map="completed"]')
    await expect(map.getByRole('button', { name: 'Chest: 6 completed sets', exact: true })).toHaveCount(1)
    await map.getByRole('button', { name: 'Trapezius: 3 completed sets', exact: true }).click()
    await expect(map.getByRole('region', { name: 'Details for Trapezius', exact: true })).toContainText('3 sets')
  })
} finally {
  await writeFile(`${artifacts}/results.json`, JSON.stringify({ passed }, null, 2))
  await browser.close()
}
