import { chromium, expect } from '@playwright/test'
import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { installAccountFixture, newTestAccount, storedAccountSnapshot } from './account-fixture.mjs'

const origin = process.env.MOBILE_PREVIEW_URL || 'http://127.0.0.1:4184'
const artifacts = '.artifacts/exercise-detail-regression'
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const exerciseId = id(10)
const exerciseName = 'Press de banca con mancuernas y pausa controlada para fortalecer el torso y mejorar la estabilidad de los hombros'
const instructions = 'Apoya los pies en el suelo y mantén la espalda estable. Baja las mancuernas de forma controlada, haz una pausa cómoda y vuelve a la posición inicial sin perder el apoyo. Ajusta la amplitud a tu movilidad y mantén un movimiento que puedas controlar durante toda la serie.'
const now = new Date('2026-09-10T16:00:00Z')
const routePath = `/exercises/${exerciseId}`
const passed = []

async function fixture() {
  const state = await newTestAccount()
  const bundled = state.tables.exercises.find(row => typeof row.image_url === 'string' && row.image_url.startsWith('/'))
  assert.ok(bundled, 'The fixture needs an existing bundled poster to exercise real image loading and zoom')
  Object.assign(state.tables.profiles[0], {
    full_name: 'Prueba de ficha compacta', onboarding_done: true, timezone: 'America/Havana', language: 'es',
  })
  state.tables.workout_plans = []
  state.tables.workouts = []
  state.tables.workout_exercises = []
  state.tables.exercises = [{
    ...bundled, id: exerciseId, is_public: true, name: 'Controlled dumbbell bench press', name_es: exerciseName,
    description: 'Controlled bench press.',
    description_es: 'Un ejercicio de empuje para el pecho y los brazos, con una preparación cómoda y un descenso controlado. La postura y el apoyo deben mantenerse durante todas las repeticiones.',
    instructions, instructions_es: instructions,
    muscle_groups: ['chest', 'triceps', 'shoulders'], muscle_groups_es: ['pecho', 'tríceps', 'hombros'],
    equipment: ['dumbbell', 'bench'], equipment_es: ['mancuernas', 'banco'],
    difficulty: 'beginner', exercise_type: 'strength', is_compound: true,
    motion_preview_url: null, video_url: null,
  }]
  state.tables.progress_logs = []
  state.tables.exercise_logs = []
  for (const [number, completedAt, name, weight] of [
    [41, '2026-07-20T16:00:00Z', 'Torso anterior', 45],
    [42, '2026-09-09T16:00:00Z', 'Torso reciente', 60],
  ]) {
    state.tables.progress_logs.push({
      id: id(number), user_id: state.accountId, workout_id: null, completed_at: completedAt, duration_minutes: 30,
      session_context_snapshot: {
        version: 1, workout: { id: id(90), name, focus: 'Fuerza', dayOfWeek: 3 }, plan: null,
        exercises: [{ exerciseId, name: 'Controlled dumbbell bench press', nameEs: exerciseName,
          muscleGroups: ['chest', 'triceps', 'shoulders'], muscleGroupsEs: ['pecho', 'tríceps', 'hombros'], isCompound: true }],
      },
    })
    state.tables.exercise_logs.push({
      id: id(number * 10), progress_log_id: id(number), exercise_id: exerciseId,
      sets_completed: 3, weights_kg: [weight, weight, weight], reps_completed: [8, 8, 8], rpe_values: [7, 8, 8],
      duration_seconds: null, notes: 'Control estable durante las tres series y descanso completo antes de continuar.',
    })
  }
  return state
}

async function noPageOverflow(page, stage) {
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `Page overflow during ${stage}`)
  for (const selector of ['[data-exercise-overview]', '#tecnica', '#exercise-history-title']) {
    const region = page.locator(selector)
    if (!await region.isVisible()) continue
    const box = await region.boundingBox()
    assert.ok(box && box.x >= -1 && box.x + box.width <= page.viewportSize().width + 1, `${selector} exceeds the viewport during ${stage}`)
  }
}

async function capture(page, region, name) {
  await region.scrollIntoViewIfNeeded()
  await noPageOverflow(page, name)
  await page.screenshot({ path: `${artifacts}/${name}.png`, fullPage: true })
}

await mkdir(artifacts, { recursive: true })
const browser = await chromium.launch({ headless: true })
async function run(width) {
  const state = await fixture()
  const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: 'reduce', isMobile: width < 600, hasTouch: width < 600 })
  await context.addInitScript(() => Object.defineProperty(navigator, 'onLine', { get: () => false }))
  await context.route('**/*', route => route.request().url().startsWith(`${origin}/`) ? route.continue() : route.abort())
  const page = await context.newPage()
  page.setDefaultTimeout(5000)
  page.setDefaultNavigationTimeout(8000)
  await page.clock.setFixedTime(now)
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  const startedAt = Date.now()
  let timer
  try {
    await Promise.race([
      (async () => {
        await page.goto(`${origin}/login`)
        await expect(page.getByLabel('Correo electrónico', { exact: true })).toBeVisible()
        await installAccountFixture(page, state)
        await page.goto(`${origin}${routePath}`)
        await expect(page.getByRole('heading', { name: 'Ficha de ejercicio', exact: true })).toBeVisible()
        await expect(page.getByRole('heading', { name: exerciseName, level: 2, exact: true })).toHaveCount(1)
        const overview = page.locator('[data-exercise-overview]')
        const zoom = overview.getByRole('button', { name: `Ampliar imagen de ${exerciseName}`, exact: true })
        await expect(zoom).toBeVisible()
        await expect(zoom.locator('img')).toBeVisible()
        await expect.poll(() => zoom.locator('img').evaluate(image => image.complete && image.naturalWidth > 0)).toBe(true)
        const progress = page.getByRole('region', { name: 'Evolución de fuerza', exact: true })
        await expect(progress).not.toBeVisible()
        await capture(page, overview, `overview-${width}`)

        await zoom.focus()
        await page.keyboard.press('Enter')
        const dialog = page.getByRole('dialog', { name: exerciseName, exact: true })
        await expect(dialog).toBeVisible()
        await expect(dialog.getByRole('img', { name: exerciseName, exact: true })).toBeVisible()
        await page.keyboard.press('Escape')
        await expect(dialog).not.toBeVisible()
        await expect(zoom).toBeFocused()

        const technique = page.locator('#tecnica')
        const instructionToggle = technique.locator('summary').filter({ hasText: /^Mostrar instrucciones$/ })
        await expect(technique.getByText(instructions, { exact: true })).not.toBeVisible()
        await instructionToggle.focus()
        await page.keyboard.press('Enter')
        await expect(technique.getByText(instructions, { exact: true })).toBeVisible()
        await capture(page, technique, `technique-${width}`)
        await instructionToggle.focus()
        await page.keyboard.press('Space')
        await expect(technique.getByText(instructions, { exact: true })).not.toBeVisible()

        const progressToggle = page.locator('summary').filter({ hasText: /^Ver progreso$/ })
        await progressToggle.focus()
        await page.keyboard.press('Enter')
        await expect(progress).toBeVisible()
        const points = progress.getByRole('group', { name: 'Peso máximo por aparición', exact: true }).getByRole('button')
        await expect(points).toHaveCount(2)
        await progress.getByRole('button', { name: '4 semanas', exact: true }).click()
        await expect(points).toHaveCount(1)
        await expect(points.first()).toHaveAccessibleName(/60 kg/)
        await progress.getByRole('button', { name: '24 semanas', exact: true }).click()
        await expect(points).toHaveCount(2)
        await points.first().focus()
        await page.keyboard.press('Enter')
        await expect(progress.getByRole('link', { name: 'Abrir sesión', exact: true })).toHaveAttribute('href', `/history/${id(41)}`)
        await capture(page, progress, `progress-${width}`)
        await progressToggle.focus()
        await page.keyboard.press('Enter')
        await expect(progress).not.toBeVisible()

        const history = page.locator('section[aria-labelledby="exercise-history-title"]')
        const recentSession = history.getByRole('link', { name: /Torso reciente/ })
        await expect(recentSession).toHaveAttribute('href', `/history/${id(42)}`)
        await recentSession.click()
        await expect(page).toHaveURL(`${origin}/history/${id(42)}`)
        await expect(page.getByRole('heading', { name: 'Torso reciente', level: 2, exact: true })).toBeVisible()
        await page.goto(`${origin}${routePath}#exercise-history-title`)
        const historyHeading = page.getByRole('heading', { name: 'Historial del ejercicio', exact: true })
        await expect(historyHeading).toBeInViewport()
        await expect(page.getByRole('region', { name: 'Evolución de fuerza', exact: true })).not.toBeVisible()
        await page.reload()
        await expect(historyHeading).toBeInViewport()
        await expect(history.getByRole('link', { name: /Torso reciente/ })).toBeVisible()
        await capture(page, historyHeading, `history-anchor-${width}`)

        assert.deepEqual(errors, [])
        const stored = await storedAccountSnapshot(page)
        const saved = stored.accounts.find(account => account.accountId === stored.active)
        assert.ok(saved)
        for (const table of ['exercises', 'progress_logs', 'exercise_logs']) assert.deepEqual(saved.tables[table], state.tables[table])
      })(),
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`Exercise detail case exceeded 30 seconds at ${width}px`)), 30000) }),
    ])
    passed.push({ name: 'compact-exercise-detail', width, passed: true, elapsedMs: Date.now() - startedAt })
    console.log(`PASS compact exercise detail at ${width}px`)
  } catch (error) {
    await page.screenshot({ path: `${artifacts}/failure-${width}.png`, fullPage: true }).catch(() => {})
    throw error
  } finally {
    clearTimeout(timer)
    await context.close()
  }
}

try {
  for (const width of [320, 390, 1440]) await run(width)
} finally {
  await writeFile(`${artifacts}/results.json`, JSON.stringify({ passed }, null, 2))
  await browser.close()
}
