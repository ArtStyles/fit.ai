import { chromium, expect } from '@playwright/test'
import assert from 'node:assert/strict'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import ts from 'typescript'
import { installAccountFixture, newTestAccount, storedAccountSnapshot } from './account-fixture.mjs'

const origin = process.env.MOBILE_PREVIEW_URL || 'http://127.0.0.1:4192'
const layoutOnly = process.argv.includes('--layout-only')
const artifacts = '.artifacts/progress-goals'
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const results = []
await mkdir(artifacts, { recursive: true })
const browser = await chromium.launch({ headless: true })
const androidBackSource = await readFile(new URL('../../src/lib/native/androidBackOverlay.ts', import.meta.url), 'utf8')
const androidBackScript = ts.transpileModule(androidBackSource.replace(/^export /gm, ''), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText
async function androidBack(page) { return page.evaluate(`(() => { ${androidBackScript}\nreturn dismissOpenRadixOverlay(); })()`) }

async function fixture(language = 'es', empty = false) {
  const state = await newTestAccount({ linked: false })
  Object.assign(state.tables.profiles[0], { full_name: 'Marina', onboarding_done: true, language, timezone: 'America/Havana', days_per_week: 3 })
  for (const key of ['workout_plans', 'workouts', 'workout_exercises', 'progress_logs', 'exercise_logs', 'session_authorizations', 'mobile_exercise_goals', 'measurements']) state.tables[key] = []
  state.tables.exercises = [
    { id: id(10), name: 'Bench press', name_es: 'Press de banca', muscle_groups: ['chest'], muscle_groups_es: ['pectoral mayor'], is_public: true, exercise_type: 'strength', difficulty: 'intermediate', is_compound: true, equipment: ['barbell'] },
    { id: id(11), name: 'Stretch', name_es: 'Estiramiento', muscle_groups: ['chest'], muscle_groups_es: ['pectoral mayor'], is_public: true, exercise_type: 'flexibility', difficulty: 'beginner', is_compound: false, equipment: ['bodyweight'] },
    { id: id(12), name: 'Pull-up', name_es: 'Dominadas', muscle_groups: ['back'], muscle_groups_es: ['espalda'], is_public: true, exercise_type: 'strength', difficulty: 'intermediate', is_compound: true, equipment: ['bodyweight'] },
    { id: id(13), name: 'Squat', name_es: 'Sentadilla', muscle_groups: ['quads'], muscle_groups_es: ['cuádriceps'], is_public: true, exercise_type: 'strength', difficulty: 'intermediate', is_compound: true, equipment: ['barbell'] },
  ]
  if (!empty) {
    for (const [n, date, weight, reps] of [[50, '2025-01-02', 40, 8], [51, '2026-09-01', 60, 8], [52, '2026-09-10', 60, 10]]) {
      state.tables.progress_logs.push({ id: id(n), user_id: state.accountId, workout_id: null, completed_at: `${date}T16:00:00Z`, duration_minutes: 30,
        session_context_snapshot: { version: 1, workout: { id: id(n), name: `Torso ${n}`, focus: null, dayOfWeek: null }, plan: null,
          exercises: [{ exerciseId: id(10), name: 'Bench press', nameEs: 'Press de banca', muscleGroups: ['chest'], muscleGroupsEs: ['pectoral mayor'], isCompound: true }] } })
      state.tables.exercise_logs.push({ id: id(n + 100), progress_log_id: id(n), exercise_id: id(10), sets_completed: 1, weights_kg: [weight], reps_completed: [reps], rpe_values: [null], duration_seconds: null, notes: null })
    }
    state.tables.measurements.push({ id: id(70), user_id: state.accountId, recorded_at: '2026-09-08T16:00:00Z', weight_kg: 72, waist_cm: 78, body_fat_percentage: null })
  }
  return state
}
async function snapshot(page) { return (await storedAccountSnapshot(page)).accounts[0] }
async function select(page, name, option) {
  await page.getByRole('combobox', { name, exact: true }).click()
  await page.getByRole('option', { name: option, exact: true }).click()
}
async function performance(page, language = 'es') {
  await page.getByRole('tab', { name: language === 'en' ? 'Performance' : 'Rendimiento', exact: true }).click()
  await expect(page.getByRole('button', { name: language === 'en' ? 'Follow an exercise' : 'Seguir ejercicio', exact: true })).toBeVisible()
}
function goalCard(page, name, language = 'es') { return page.getByRole('region', { name: language === 'en' ? 'My goals' : 'Mis objetivos', exact: true }).getByRole('button').filter({ has: page.getByRole('heading', { name, exact: true }) }) }
async function saveGoal(page, language = 'es') {
  await page.getByRole('dialog').getByRole('button', { name: language === 'en' ? 'Save goal' : 'Guardar objetivo', exact: true }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.getByRole('tab', { name: language === 'en' ? 'Performance' : 'Rendimiento', exact: true })).toHaveAttribute('aria-selected', 'true')
}
async function shot(page, name) {
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `overflow ${name}`)
  await page.screenshot({ path: `${artifacts}/${name}.png`, fullPage: true })
}
async function run(name, width, options, action) {
  const state = await fixture(options.language, options.empty)
  const context = await browser.newContext({ viewport: { width, height: width === 320 ? 568 : 900 }, reducedMotion: 'reduce', isMobile: width < 600, hasTouch: width < 600 })
  await context.addInitScript(() => Object.defineProperty(navigator, 'onLine', { get: () => false }))
  await context.route('**/*', route => route.request().url().startsWith(`${origin}/`) ? route.continue() : route.abort())
  const page = await context.newPage()
  page.setDefaultTimeout(10000)
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  await page.clock.setFixedTime(new Date('2026-09-11T16:00:00Z'))
  try {
    await page.goto(`${origin}/login`)
    await expect(page.getByLabel('Correo electrónico', { exact: true })).toBeVisible()
    await installAccountFixture(page, state)
    await page.goto(`${origin}/progress`)
    await action(page, state)
    assert.deepEqual(errors, [])
    results.push({ name, width, passed: true })
    console.log(`PASS ${name} ${width}px`)
  } catch (error) {
    await page.screenshot({ path: `${artifacts}/failure-${name}-${width}.png`, fullPage: true }).catch(() => {})
    console.log((await page.locator('body').innerText()).slice(-5000))
    throw error
  } finally { await context.close() }
}

try {
  for (const width of [320, 390, 1440]) {
    await run('layout', width, {}, async page => {
      await expect(page.getByRole('tab', { name: 'Resumen', exact: true })).toHaveAttribute('aria-selected', 'true')
      await expect(page.getByRole('heading', { name: 'Tu actividad muscular', exact: true })).toBeVisible()
      await expect(page.getByRole('heading', { name: 'Ejercicios del periodo', exact: true })).toHaveCount(0)
      await expect(page.getByRole('heading', { name: 'Últimas medidas', exact: true })).toHaveCount(0)
      const explorer = page.locator('[data-muscle-explorer]')
      await expect(explorer).not.toHaveAttribute('open')
      const period = page.getByRole('combobox', { name: 'Seleccionar periodo', exact: true })
      await period.click()
      const menu = page.getByRole('listbox')
      await expect(menu).toBeVisible()
      await shot(page, `period-${width}`)
      await menu.getByRole('option', { name: '1 semana', exact: true }).click()
      await expect(period).toContainText('1 semana')
      await expect(menu).toHaveCount(0)
      await page.evaluate(() => scrollTo(0, 0))
      await shot(page, `overview-${width}`)
      // Focus order and native disclosure interaction remain usable with a keyboard.
      await explorer.locator('summary').focus()
      await page.keyboard.press('Enter')
      await expect(explorer).toHaveAttribute('open')
      await explorer.getByRole('button', { name: 'Pecho: 1 serie completada', exact: true }).click()
      await expect(page.getByRole('region', { name: 'Detalle de Pecho', exact: true })).toBeVisible()
      await expect(page.getByRole('link', { name: 'Historial de Press de banca', exact: true })).toBeVisible()
      await page.getByRole('tab', { name: 'Rendimiento', exact: true }).click()
      await expect(page.getByRole('heading', { name: 'Ejercicios del periodo', exact: true })).toBeVisible()
      await expect(page.locator('[data-muscle-map]')).toHaveCount(0)
      await shot(page, `performance-${width}`)
      await page.getByRole('tab', { name: 'Medidas', exact: true }).click()
      await expect(page.getByRole('heading', { name: 'Últimas medidas', exact: true })).toBeVisible()
      await expect(page.getByText('72 kg', { exact: true })).toBeVisible()
      await expect(page.getByText('sin comparación', { exact: true })).toBeVisible()
      await expect(page.getByRole('img', { name: 'Tendencia de peso corporal', exact: true })).toHaveCount(0)
      await expect(page.getByRole('link', { name: 'Registrar o consultar medidas', exact: true })).toBeVisible()
      await shot(page, `measurements-${width}`)
      await page.getByRole('tab', { name: 'Medidas', exact: true }).focus()
      await page.keyboard.press('ArrowLeft')
      await expect(page.getByRole('tab', { name: 'Rendimiento', exact: true })).toHaveAttribute('aria-selected', 'true')
    })
  }
  await run('empty-english', 320, { language: 'en', empty: true }, async page => {
    await expect(page.getByRole('tab', { name: 'Overview', exact: true })).toHaveAttribute('aria-selected', 'true')
    await expect(page.locator('body')).not.toContainText('NaN')
    await expect(page.locator('body')).not.toContainText('Infinity')
    await page.getByRole('tab', { name: 'Performance', exact: true }).click()
    await shot(page, 'empty-performance-320-en')
    await page.getByRole('tab', { name: 'Measurements', exact: true }).click()
    await shot(page, 'empty-measurements-320-en')
  })
  if (!layoutOnly) {
    await run('goals-map-history-correction', 390, {}, async page => {
      await page.locator('[data-muscle-explorer] summary').click()
      await page.getByRole('button', { name: 'Pecho: 2 series completadas', exact: true }).click()
      await page.getByRole('button', { name: 'Seguir mi progreso en Press de banca', exact: true }).click()
      const dialog = page.getByRole('dialog')
      await expect(dialog).toBeVisible()
      await expect(dialog.getByRole('combobox', { name: 'Ejercicio', exact: true })).toContainText('Press de banca')
      assert.equal(await dialog.evaluate(el => el.contains(document.activeElement)), true, 'map entry focuses dialog')
      assert.equal((await snapshot(page)).tables.mobile_exercise_goals.length, 0, 'map intent never autosaves')
      await select(page, 'Tipo de seguimiento', 'Definir meta numérica')
      await page.getByLabel('Peso (kg)', { exact: true }).fill('60')
      await page.getByLabel('Repeticiones en la misma serie', { exact: true }).fill('10')
      await shot(page, 'goal-create-390')
      await saveGoal(page)
      const card = goalCard(page, 'Press de banca')
      await expect(card).toContainText('Alcanzada en tus registros')
      await expect(card).toContainText('40 kg × 8')
      await shot(page, 'goals-performance-390')
      await card.click()
      await expect(dialog.locator(`a[href="/history/${id(50)}"]`)).toBeVisible()
      await expect(dialog.getByText('Todo tu historial disponible.', { exact: false })).toBeVisible()
      await shot(page, 'goal-detail-390')
      await dialog.getByRole('button', { name: 'Editar meta', exact: true }).click()
      await expect(dialog.getByRole('heading', { name: 'Editar meta', exact: true })).toBeFocused()
      await page.getByLabel('Peso (kg)', { exact: true }).fill('bad')
      await dialog.getByRole('button', { name: 'Guardar objetivo', exact: true }).click()
      await expect(dialog.getByRole('alert')).toContainText('Peso:')
      await expect(page.getByLabel('Repeticiones en la misma serie', { exact: true })).toHaveValue('10')
      await page.getByLabel('Peso (kg)', { exact: true }).fill('65')
      await saveGoal(page)
      await expect(card).not.toContainText('Alcanzada en tus registros')
      await page.reload()
      await performance(page)
      await expect(card).toContainText('65 kg × 10')
      // Real saved sets must meet weight and reps together; never combine separate sets.
      await page.goto(`${origin}/registrar`)
      await page.getByRole('button', { name: 'Añadir ejercicios', exact: true }).click()
      await page.getByRole('button', { name: 'Press de banca', exact: true }).click()
      await page.getByLabel('Press de banca, serie 1, kg', { exact: true }).fill('65')
      await page.getByLabel('Press de banca, serie 1, reps', { exact: true }).fill('5')
      await page.getByRole('region', { name: 'Press de banca', exact: true }).getByRole('button', { name: 'Añadir serie', exact: true }).click()
      await page.getByLabel('Press de banca, serie 2, kg', { exact: true }).fill('50')
      await page.getByLabel('Press de banca, serie 2, reps', { exact: true }).fill('12')
      await page.getByRole('button', { name: 'Guardar entrenamiento', exact: true }).click()
      await expect(page.getByRole('heading', { name: 'Entrenamiento guardado' })).toBeVisible()
      const saved = await snapshot(page), log = saved.tables.progress_logs.find(row => row.mobile_session_kind === 'free')
      assert.ok(log)
      await page.goto(`${origin}/progress`)
      await performance(page)
      await expect(card).not.toContainText('Alcanzada en tus registros')
      await expect(card).toContainText('65 kg × 5')
      await page.goto(`${origin}/registrar?log=${log.id}`)
      await page.getByLabel('Press de banca, serie 1, reps', { exact: true }).fill('10')
      await page.getByRole('button', { name: 'Guardar cambios', exact: true }).click()
      await expect(page.getByRole('heading', { name: 'Entrenamiento guardado' })).toBeVisible()
      await page.goto(`${origin}/progress`)
      await performance(page)
      await expect(card).toContainText('Alcanzada en tus registros')
      await card.click()
      await dialog.getByRole('button', { name: 'Quitar objetivo', exact: true }).click()
      await expect(dialog.getByRole('heading', { name: 'Quitar objetivo', exact: true })).toBeFocused()
      await expect(dialog).toContainText('Tus sesiones y el historial del ejercicio se conservan.')
      await dialog.getByRole('button', { name: 'Cancelar', exact: true }).click()
      await expect(dialog.getByRole('button', { name: 'Editar meta', exact: true })).toBeVisible()
      await dialog.getByRole('button', { name: 'Quitar objetivo', exact: true }).click()
      await dialog.getByRole('button', { name: 'Quitar objetivo', exact: true }).click()
      await expect(dialog).toHaveCount(0)
      const after = await snapshot(page)
      assert.equal(after.tables.mobile_exercise_goals.length, 0)
      assert.equal(after.tables.progress_logs.length, 4)
      assert.equal(after.tables.exercise_logs.length, 4)
    })
    for (const width of [320, 1440]) await run('goals-limits-selectors', width, {}, async page => {
      await performance(page)
      const add = page.getByRole('button', { name: 'Seguir ejercicio', exact: true })
      await add.click()
      await page.getByRole('combobox', { name: 'Ejercicio', exact: true }).click()
      assert.equal(await androidBack(page), true)
      await expect(page.getByRole('listbox')).toHaveCount(0)
      await expect(page.getByRole('dialog')).toBeVisible()
      await expect(page.getByRole('combobox', { name: 'Ejercicio', exact: true })).toBeFocused()
      await page.keyboard.press('Escape')
      await expect(page.getByRole('dialog')).toHaveCount(0)
      await expect(add).toBeFocused()
      for (const name of ['Press de banca', 'Dominadas', 'Sentadilla']) {
        await page.getByRole('button', { name: 'Seguir ejercicio', exact: true }).click()
        await page.getByLabel('Buscar ejercicio', { exact: true }).fill(name)
        await page.getByRole('combobox', { name: 'Ejercicio', exact: true }).click()
        const menu = page.getByRole('listbox')
        await expect(menu).toBeVisible()
        const bounds = await menu.boundingBox()
        assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= width + 1)
        await shot(page, `goal-selector-${name === 'Press de banca' ? 'bench' : name}-${width}`)
        await page.getByRole('option', { name, exact: true }).click()
        if (name === 'Press de banca') {
          // Reject one real browser persistence write while Escape arrives in
          // the pending turn. The form must stay mounted and retain its values.
          await page.getByRole('dialog').evaluate(dialog => {
            const originalPut = IDBObjectStore.prototype.put
            IDBObjectStore.prototype.put = function () {
              IDBObjectStore.prototype.put = originalPut
              throw new DOMException('Fixture storage write failure', 'QuotaExceededError')
            }
            dialog.querySelector('form').requestSubmit()
            document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))
          })
          await expect(page.getByRole('dialog').getByRole('alert')).toBeVisible()
          await expect(page.getByLabel('Buscar ejercicio', { exact: true })).toHaveValue(name)
          assert.equal((await snapshot(page)).tables.mobile_exercise_goals.length, 0)
        }
        await saveGoal(page)
        await expect(goalCard(page, name)).toContainText('Seguimiento sin meta')
      }
      await expect(page.getByRole('button', { name: 'Seguir ejercicio', exact: true })).toBeDisabled()
      const saved = await snapshot(page)
      assert.equal(saved.tables.mobile_exercise_goals.length, 3)
      assert.equal(new Set(saved.tables.mobile_exercise_goals.map(row => row.exercise_id)).size, 3)
      await shot(page, `goals-three-${width}`)
    })
    await run('goal-timed-english', 320, { language: 'en', empty: true }, async page => {
      await performance(page, 'en')
      await page.getByRole('button', { name: 'Follow an exercise', exact: true }).click()
      await select(page, 'Exercise', 'Stretch')
      await select(page, 'Tracking mode', 'Set a numeric target')
      await page.getByLabel('Seconds per set', { exact: true }).fill('60')
      await saveGoal(page, 'en')
      const card = goalCard(page, 'Stretch', 'en')
      await expect(card).toContainText('No recorded sets yet.')
      await page.goto(`${origin}/registrar`)
      await page.getByRole('button', { name: 'Add exercises', exact: true }).click()
      await page.getByRole('button', { name: 'Stretch', exact: true }).click()
      await page.getByLabel('Stretch, set 1, seconds', { exact: true }).fill('45')
      await page.getByRole('region', { name: 'Stretch', exact: true }).getByRole('button', { name: 'Add set', exact: true }).click()
      await page.getByLabel('Stretch, set 2, seconds', { exact: true }).fill('30')
      await page.getByRole('button', { name: 'Save workout', exact: true }).click()
      await expect(page.getByRole('heading', { name: 'Workout saved' })).toBeVisible()
      await page.goto(`${origin}/progress`)
      await performance(page, 'en')
      await expect(card).toContainText('45 s')
      await expect(card).not.toContainText('Reached in your records')
      await expect(card).not.toContainText('75 s')
      await expect(page.getByRole('region', { name: 'Exercises in this period', exact: true })).not.toContainText('0 reps')
      await card.click()
      await page.getByRole('dialog').getByRole('button', { name: 'Edit target', exact: true }).click()
      await page.getByLabel('Seconds per set', { exact: true }).fill('45')
      await saveGoal(page, 'en')
      await expect(card).toContainText('Reached in your records')
      await shot(page, 'goal-timed-320-en')
    })
  }
  await writeFile(`${artifacts}/report${layoutOnly ? '-layout' : ''}.json`, JSON.stringify({ status: 'passed', results }, null, 2))
} finally { await browser.close() }
