import { chromium, expect } from '@playwright/test'
import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { installAccountFixture, newTestAccount, storedAccountSnapshot } from './account-fixture.mjs'

const origin = process.env.MOBILE_PREVIEW_URL || 'http://127.0.0.1:4184'
const artifacts = '.artifacts/fitness-import'
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const header = 'title,start_time,end_time,description,exercise_title,superset_id,exercise_notes,set_index,set_type,weight_kg,reps,distance_km,duration_seconds,rpe'
const rows = [
  'Push,2026-09-16 10:00,2026-09-16 11:00,Original notes,Bench Press,,,0,warmup,20,12,,,6',
  'Push,2026-09-16 10:00,2026-09-16 11:00,Original notes,Bench Press,,,1,normal,60,8,,,8',
  'Push,2026-09-16 10:00,2026-09-16 11:00,Original notes,My shoulder press,,,0,normal,15,10,,,7',
  'Push,2026-09-16 10:00,2026-09-16 11:00,Original notes,Outdoor Run,,,0,normal,,,1.5,600,',
]
const hevy = [header, ...rows].join('\n')
const strong = 'Date,Workout Name,Duration,Exercise Name,Set Order,Weight,Reps,Distance,Seconds,Notes,Workout Notes,RPE\n2026-09-15 10:00,Strong test,30m,Bench Press,1,100,8,,,Paused,Workout notes,7'
const fitnotes = 'Date,Exercise,Category,Weight,Weight Unit,Reps,Distance,Distance Unit,Time,Comment\n2026-09-14,Bench Press,Chest,50,kg,8,,,,Slow eccentric'
await mkdir(artifacts, { recursive: true })
const browser = await chromium.launch({ headless: true })
const results = []
async function saved(page) { return (await storedAccountSnapshot(page)).accounts[0] }
async function file(page, text, language = 'es') {
  await page.getByLabel(language === 'es' ? 'Seleccionar archivo CSV' : 'Choose CSV file', { exact: true }).setInputFiles({ name: 'workouts.csv', mimeType: 'text/csv', buffer: Buffer.from(text) })
}
async function preview(page, text, language = 'es') {
  await file(page, text, language)
  await page.getByRole('button', { name: language === 'es' ? 'Revisar archivo' : 'Review file', exact: true }).click()
}
async function shot(page, name) {
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `overflow ${name}`)
  await page.screenshot({ path: `${artifacts}/${name}.png`, fullPage: true })
}
async function run(name, width, language, action) {
  const state = await newTestAccount({ linked: false })
  Object.assign(state.tables.profiles[0], { full_name: 'Marina', onboarding_done: true, language, timezone: 'America/Havana', days_per_week: 3 })
  for (const key of ['workout_plans', 'workouts', 'workout_exercises', 'progress_logs', 'exercise_logs', 'session_authorizations']) state.tables[key] = []
  state.tables.exercises = [
    { id: id(10), name: 'Bench Press', name_es: 'Press de banca', muscle_groups: ['chest', 'triceps'], muscle_groups_es: ['pectoral mayor', 'tríceps'], is_public: true, exercise_type: 'strength', difficulty: 'intermediate', is_compound: true, equipment: ['barbell'] },
    { id: id(11), name: 'Shoulder Press', name_es: 'Press militar', muscle_groups: ['shoulders'], muscle_groups_es: ['deltoides'], is_public: true, exercise_type: 'strength', difficulty: 'intermediate', is_compound: true, equipment: ['dumbbell'] },
  ]
  const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: 'reduce', isMobile: width < 600, hasTouch: width < 600 })
  await context.addInitScript(() => Object.defineProperty(navigator, 'onLine', { get: () => false }))
  await context.route('**/*', route => route.request().url().startsWith(`${origin}/`) ? route.continue() : route.abort())
  const page = await context.newPage(); page.setDefaultTimeout(10000)
  const errors = []; page.on('pageerror', error => errors.push(error.message))
  await page.clock.setFixedTime(new Date('2026-09-17T16:00:00Z'))
  try {
    await page.goto(`${origin}/login`)
    await expect(page.getByLabel('Correo electrónico', { exact: true })).toBeVisible()
    await installAccountFixture(page, state)
    await action(page)
    const after = await saved(page)
    for (const key of ['workout_plans', 'workouts', 'workout_exercises', 'session_authorizations', 'exercises']) assert.deepEqual(after.tables[key], state.tables[key], `${key} must be preserved`)
    assert.deepEqual(errors, [])
    results.push({ name, width, language, passed: true }); console.log(`PASS ${name} ${width}px ${language}`)
  } catch (error) {
    await shot(page, `failure-${name}-${width}`).catch(() => {})
    console.log((await page.locator('body').innerText()).slice(-6000)); throw error
  } finally { await context.close() }
}
try {
  await run('three-sources-history-progress', 390, 'es', async page => {
    await page.goto(`${origin}/settings/almacenamiento`)
    await page.getByRole('link', { name: /Importar entrenamientos Hevy/ }).click()
    await shot(page, '01-file-390')
    await preview(page, hevy)
    await expect(page.getByText('Revisa tu importación', { exact: true })).toBeVisible()
    assert.equal((await saved(page)).tables.progress_logs.length, 0)
    const mapping = page.locator('details').filter({ has: page.locator('summary', { hasText: 'My shoulder press' }) })
    await mapping.locator('summary').click()
    await mapping.getByRole('combobox', { name: 'Equivalencia de My shoulder press' }).click()
    await page.getByRole('option', { name: 'Press militar', exact: true }).click()
    await shot(page, '02-preview-390')
    await page.getByRole('button', { name: 'Importar 1 sesión', exact: true }).click()
    await expect(page.getByRole('heading', { name: '1 sesión guardada', exact: true })).toBeVisible()
    await shot(page, '03-result-390')
    let state = await saved(page)
    assert.equal(state.tables.progress_logs.length, 1)
    assert.equal(state.tables.exercise_logs.reduce((n, row) => n + row.sets_completed, 0), 4)
    const log = state.tables.progress_logs[0]
    await page.goto(`${origin}/history/${log.id}`)
    await expect(page.getByText('Importado · Hevy', { exact: true })).toBeVisible()
    const run = page.locator('article').filter({ has: page.getByRole('heading', { name: 'Outdoor Run', exact: true }) })
    await run.getByText('Mostrar series', { exact: true }).click()
    await expect(run.getByText('600 s', { exact: true }).last()).toBeVisible()
    await expect(run.getByText(/1[.,]?500 m/, { exact: true })).toBeVisible()
    await expect(run.getByText('0 kg', { exact: true })).toHaveCount(0)
    await shot(page, '04-history-390')
    await run.getByRole('link', { name: 'Abrir ficha del movimiento', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Outdoor Run', exact: true }).first()).toBeVisible()
    await expect(page.getByText('No se pudo abrir esta pantalla', { exact: true })).toHaveCount(0)
    await page.goto(`${origin}/progress`)
    await page.locator('[data-muscle-explorer] summary').click()
    await expect(page.locator('[data-muscle-map="completed"]').getByRole('button', { name: 'Pecho: 2 series completadas', exact: true })).toBeVisible()
    await expect(page.locator('[data-muscle-map="completed"]').getByRole('button', { name: 'Hombros: 1 serie completada', exact: true })).toBeVisible()
    await shot(page, '05-muscles-390')
    await page.getByRole('link', { name: /Importar entrenamientos Hevy/ }).click()
    await preview(page, [header, ...[...rows].reverse()].join('\n'))
    await expect(page.getByRole('button', { name: 'No hay sesiones nuevas para importar' })).toBeDisabled()
    await page.getByRole('button', { name: 'Cancelar', exact: true }).click()
    await preview(page, hevy.replaceAll('Original notes', 'Changed original notes'))
    await expect(page.getByRole('button', { name: 'No hay sesiones nuevas para importar' })).toBeDisabled()
    await expect(page.getByText(/Hay sesiones ya importadas que cambiaron/)).toBeVisible()
    await page.getByRole('button', { name: 'Cancelar', exact: true }).click()
    await preview(page, `${header}\ninvalid,row`)
    await expect(page.getByRole('alert')).toBeVisible()
    assert.equal((await saved(page)).tables.progress_logs.length, 1)
    await page.locator('summary', { hasText: 'Unidades y fechas' }).click()
    await page.getByRole('combobox', { name: 'Unidad de peso', exact: true }).click()
    await page.getByRole('option', { name: 'lb', exact: true }).click()
    await preview(page, strong)
    await page.getByRole('button', { name: 'Importar 1 sesión', exact: true }).click()
    await expect(page.getByRole('heading', { name: '1 sesión guardada', exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'Importar otro archivo' }).click()
    await preview(page, fitnotes)
    await page.getByRole('button', { name: 'Importar 1 sesión', exact: true }).click()
    await expect(page.getByRole('heading', { name: '1 sesión guardada', exact: true })).toBeVisible()
    state = await saved(page)
    assert.equal(state.tables.progress_logs.length, 3)
    const strongLog = state.tables.progress_logs.find(row => row.mobile_import.source === 'strong')
    assert.ok(Math.abs(state.tables.exercise_logs.find(row => row.progress_log_id === strongLog.id).weights_kg[0] - 45.359237) < .00001)
    const fitLog = state.tables.progress_logs.find(row => row.mobile_import.source === 'fitnotes')
    assert.equal(fitLog.duration_minutes, null)
    await page.goto(`${origin}/history/${fitLog.id}`)
    await expect(page.getByText('Importado · FitNotes', { exact: true })).toBeVisible()
    await expect(page.getByText('0 min', { exact: true })).toHaveCount(0)
    await expect(page.getByText(/14 de septiembre, 12:00/)).toHaveCount(0)
    await page.reload()
    await expect(page.getByText('Importado · FitNotes', { exact: true })).toBeVisible()
  })
  for (const [width, language] of [[320, 'es'], [1440, 'es'], [390, 'en']]) await run('responsive-preview', width, language, async page => {
    await page.goto(`${origin}/settings/importar`)
    await preview(page, hevy, language)
    await expect(page.getByText(language === 'es' ? 'Revisa tu importación' : 'Review your import', { exact: true })).toBeVisible()
    await shot(page, `06-preview-${width}-${language}`)
    await page.getByRole('button', { name: language === 'es' ? 'Cancelar' : 'Cancel', exact: true }).click()
    assert.equal((await saved(page)).tables.progress_logs.length, 0)
  })
  await writeFile(`${artifacts}/results.json`, JSON.stringify(results, null, 2))
} finally { await browser.close() }
