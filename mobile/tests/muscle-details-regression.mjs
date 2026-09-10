import { chromium, expect } from '@playwright/test'
import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { installAccountFixture, newTestAccount, storedAccountSnapshot } from './account-fixture.mjs'

const origin = process.env.MOBILE_PREVIEW_URL || 'http://127.0.0.1:4184'
const artifacts = '.artifacts/muscle-details-regression'
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const now = new Date('2026-09-10T16:00:00Z')
await mkdir(artifacts, { recursive: true })
const passed = []

async function fixture({ previous = true, language = 'es', removed = false } = {}) {
  const state = await newTestAccount()
  Object.assign(state.tables.profiles[0], { full_name: 'Prueba de progreso', onboarding_done: true, timezone: 'America/Havana', language })
  state.tables.workout_plans = []
  state.tables.workouts = []
  state.tables.workout_exercises = []
  state.tables.progress_logs = []
  state.tables.exercise_logs = []
  const names = [['Bench press', 'Press de banca', ['Chest', 'pecho']], ['Push-ups', 'Flexiones', ['chest']], ['Timed plank', 'Plancha', ['abdominals']]]
  state.tables.exercises = state.tables.exercises.slice(0, 3).map((row, index) => ({ ...row, id: id(10 + index), name: names[index][0], name_es: index ? names[index][1] : 'Nombre cambiado en el catálogo', muscle_groups: ['back'], muscle_groups_es: ['espalda'], is_public: true }))
  function session(number, completedAt, sets, workoutName) {
    const sessionId = id(number)
    state.tables.progress_logs.push({ id: sessionId, user_id: state.accountId, workout_id: null, completed_at: completedAt, duration_minutes: 30,
      session_context_snapshot: { version: 1, workout: { id: id(90), name: workoutName, focus: 'Fuerza', dayOfWeek: 3 }, plan: null,
        exercises: names.map(([name, nameEs, muscleGroups], index) => ({ exerciseId: id(10 + index), name, nameEs, muscleGroups, muscleGroupsEs: muscleGroups, isCompound: index !== 2 })) } })
    sets.forEach((count, index) => {
      if (!count) return
      state.tables.exercise_logs.push({ id: id(number * 10 + index), progress_log_id: sessionId, exercise_id: id(10 + index), sets_completed: count,
        weights_kg: index === 2 ? [] : Array(count).fill(index ? 0 : 30), reps_completed: index === 2 ? [] : Array(count).fill(8), duration_seconds: index === 2 ? count * 30 : null, rpe_values: [], notes: null })
    })
  }
  session(41, '2026-09-04T16:00:00Z', [3, 3, 0], 'Torso A')
  session(42, '2026-09-11T02:00:00Z', [3, 3, 2], 'Torso B') // Still September 10 in Havana.
  if (previous) {
    session(43, '2026-08-28T16:00:00Z', [4, 2, 0], 'Torso anterior A')
    session(44, '2026-09-03T16:00:00Z', [3, 0, 0], 'Torso anterior B')
  }
  session(45, '2026-08-27T16:00:00Z', [10, 0, 0], 'Fuera de la semana anterior')
  session(46, '2026-09-11T16:00:00Z', [9, 0, 0], 'Fecha futura')
  if (removed) state.tables.exercises = state.tables.exercises.filter(row => row.id !== id(10))
  return state
}

const browser = await chromium.launch({ headless: true })
async function run(name, width, options, check) {
  const state = await fixture(options)
  const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: 'reduce', isMobile: width < 600, hasTouch: width < 600 })
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
    await page.goto(`${origin}/progress`)
    await check(page, state)
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true)
    assert.deepEqual(errors, [])
    const saved = (await storedAccountSnapshot(page)).accounts[0]
    for (const table of ['exercises', 'progress_logs', 'exercise_logs']) assert.deepEqual(saved.tables[table], state.tables[table])
    passed.push({ name, width, passed: true })
    console.log(`PASS ${name} at ${width}px`)
  } catch (error) {
    await page.screenshot({ path: `${artifacts}/failure-${name}-${width}.png`, fullPage: true }).catch(() => {})
    throw error
  } finally { await context.close() }
}
async function selectChest(page, english = false) {
  await page.getByRole('button', { name: english ? '1 week' : '1 semana', exact: true }).click()
  const map = page.locator('[data-muscle-map="completed"]')
  const muscle = map.getByRole('button', { name: english ? 'Chest: 12 completed sets' : 'Pecho: 12 series completadas', exact: true })
  await muscle.focus()
  await page.keyboard.press('Enter')
  await expect(muscle).toHaveAttribute('aria-pressed', 'true')
  return map.getByRole('region', { name: english ? 'Details for Chest' : 'Detalle de Pecho', exact: true })
}
async function capture(page, element, filename) {
  await element.evaluate(node => node.scrollIntoView({ block: 'start', behavior: 'instant' }))
  // App pages scroll in their shell; bring the panel below the fixed top bar.
  await element.evaluate(node => {
    let parent = node.parentElement
    while (parent && getComputedStyle(parent).overflowY !== 'auto') parent = parent.parentElement
    if (parent) parent.scrollTop -= 84
  })
  await page.screenshot({ path: `${artifacts}/${filename}`, fullPage: true })
}
try {
  await run('tap-anatomy', 390, {}, async page => {
    await page.getByRole('button', { name: '1 semana', exact: true }).click()
    const chest = page.locator('[data-muscle-map="completed"] g[data-muscle-group="chest"] path').first()
    await chest.tap()
    await expect(page.getByRole('region', { name: 'Detalle de Pecho', exact: true })).toBeVisible()
    await expect(page.getByRole('region', { name: 'Detalle de Pecho', exact: true })).toContainText('+3 series')
    await chest.tap()
    await expect(page.getByRole('region', { name: 'Detalle de Pecho', exact: true })).toHaveCount(0)
  })
  for (const width of [320, 390, 1440]) {
    await run('muscle-contributions', width, {}, async page => {
      const details = await selectChest(page)
      await expect(details.locator('[data-period="current"]')).toContainText('12')
      await expect(details.locator('[data-period="previous"]')).toContainText('9')
      await expect(details).toContainText('+3 series')
      await expect(details).not.toContainText('Nombre cambiado en el catálogo')
      await expect(details.getByRole('link', { name: 'Historial de Press de banca', exact: true })).toHaveAttribute('href', `/exercises/${id(10)}#exercise-history-title`)
      await capture(page, details, `detail-${width}.png`)
      const currentPress = details.locator(':scope > ul > li').filter({ has: page.getByRole('link', { name: 'Historial de Press de banca', exact: true }) })
      await expect(currentPress).toContainText('6 series')
      await currentPress.locator('summary').click()
      await expect(currentPress.getByRole('link', { name: /Torso B/ })).toBeVisible()
      await expect(currentPress.getByRole('link', { name: /Torso A/ })).toBeVisible()
      await capture(page, currentPress, `sessions-${width}.png`)
      await currentPress.getByRole('link', { name: /Torso A/ }).click()
      await expect(page).toHaveURL(`${origin}/history/${id(41)}`)
      await expect(page.getByRole('heading', { name: 'Torso A', level: 2, exact: true })).toBeVisible()
      await page.goto(`${origin}/progress`)
      const repeated = await selectChest(page)
      await repeated.getByRole('link', { name: 'Historial de Press de banca', exact: true }).click()
      await expect(page).toHaveURL(`${origin}/exercises/${id(10)}#exercise-history-title`)
      const historyHeading = page.getByRole('heading', { name: 'Historial del ejercicio', exact: true })
      await expect(historyHeading).toBeInViewport()
      await page.reload()
      await expect(historyHeading).toBeInViewport()
      await page.goto(`${origin}/progress`)
      await selectChest(page)
      await page.getByRole('button', { name: '4 semanas', exact: true }).click()
      const rangeChanged = page.getByRole('region', { name: 'Detalle de Pecho', exact: true })
      await expect(rangeChanged.locator('[data-period="current"]')).toContainText('31')
      await expect(rangeChanged).toContainText('Sin registros en el periodo anterior para comparar.')
      await page.getByRole('button', { name: '1 semana', exact: true }).click()
      await expect(rangeChanged.locator('[data-period="current"]')).toContainText('12')
      const map = page.locator('[data-muscle-map="completed"]')
      await map.getByRole('button', { name: 'Abdomen: 2 series completadas', exact: true }).click()
      await expect(page.getByRole('region', { name: 'Detalle de Abdomen', exact: true })).toContainText('Plancha')
      await expect(page.getByRole('region', { name: 'Detalle de Abdomen', exact: true })).toContainText('+2 series')
    })
  }
  await run('no-prior-records', 390, { previous: false }, async page => {
    const details = await selectChest(page)
    await expect(details).toContainText('Sin registros en el periodo anterior para comparar.')
    await expect(details).not.toContainText('+12 series')
  })
  await run('snapshot-only-history', 390, { removed: true }, async page => {
    const details = await selectChest(page)
    await details.getByRole('link', { name: 'Historial de Press de banca', exact: true }).click()
    await expect(page.getByText('Información conservada en tu historial', { exact: true })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Historial del ejercicio', exact: true })).toBeInViewport()
    await page.screenshot({ path: `${artifacts}/snapshot-history-390.png`, fullPage: true })
  })
  await run('english-comparison', 390, { language: 'en' }, async page => {
    const details = await selectChest(page, true)
    await expect(details).toContainText('+3 sets')
    await expect(details).toContainText('Exercises contributing sets')
    await expect(details.getByRole('link', { name: 'History of Bench press', exact: true })).toBeVisible()
  })
} finally {
  await writeFile(`${artifacts}/results.json`, JSON.stringify({ passed }, null, 2))
  await browser.close()
}
