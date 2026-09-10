import { chromium, expect } from '@playwright/test'
import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { installAccountFixture, newTestAccount, storedAccountSnapshot } from './account-fixture.mjs'

const origin = process.env.MOBILE_PREVIEW_URL || 'http://127.0.0.1:4184'
const artifacts = '.artifacts/contour-loading-regression'
const now = new Date('2026-09-10T23:00:00Z')
const id = n => `81000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const passed = []
await mkdir(artifacts, { recursive: true })

async function fixture(language) {
  const state = await newTestAccount()
  Object.assign(state.tables.profiles[0], { full_name: 'Prueba de carga', onboarding_done: true, timezone: 'America/Havana', language })
  const exercise = state.tables.exercises.find(row => row.external_id === 'press-banca-barra')
  assert(exercise)
  state.tables.workout_plans = [{ id: id(1), family_id: id(1), user_id: state.accountId, name: 'Rutina contorno', is_active: true, prescription_locked: false, created_at: now.toISOString() }]
  state.tables.workouts = [{ id: id(2), user_id: state.accountId, plan_id: id(1), name: 'Sesión contorno', day_of_week: 4, order_index: 0 }]
  state.tables.workout_exercises = [{ id: id(10), workout_id: id(2), exercise_id: exercise.id, order_index: 0, sets: 3, reps: 10, rest_seconds: 90, target_rpe: 7, weight_kg: 20 }]
  state.tables.progress_logs = [{ id: id(3), user_id: state.accountId, workout_id: id(2), completed_at: now.toISOString(), duration_minutes: 30,
    session_context_snapshot: { version: 1, workout: { id: id(2), name: 'Sesión contorno', focus: null, dayOfWeek: 4 }, plan: null,
      exercises: [{ exerciseId: exercise.id, name: exercise.name, nameEs: exercise.name_es, muscleGroups: exercise.muscle_groups, muscleGroupsEs: exercise.muscle_groups_es, isCompound: true }] } }]
  state.tables.exercise_logs = [{ id: id(20), progress_log_id: id(3), exercise_id: exercise.id, sets_completed: 3,
    weights_kg: [20, 20, 20], reps_completed: [10, 10, 10], rpe_values: [7, 7, 7], notes: null }]
  return state
}

async function chunkGate(page) {
  let release
  const promise = new Promise(resolve => { release = resolve })
  const held = []
  const completions = []
  const handler = async route => {
    held.push(route.request().url())
    let complete
    completions.push(new Promise(resolve => { complete = resolve }))
    try { await promise; await route.continue() } finally { complete() }
  }
  await page.route('**/assets/*.js', handler)
  return {
    held, release,
    async finish() {
      release()
      await Promise.all(completions)
      await page.unroute('**/assets/*.js', handler)
    },
  }
}

async function capture(page, name) {
  await page.evaluate(() => document.fonts.ready)
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, name)
  await page.screenshot({ path: `${artifacts}/${name}.png`, fullPage: true })
}

const browser = await chromium.launch({ headless: true })
async function run(name, width, { language = 'es', reducedMotion = 'no-preference', light = false, cancel = false } = {}) {
  const state = await fixture(language)
  const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion, colorScheme: light ? 'light' : 'dark', isMobile: width < 600, hasTouch: width < 600 })
  await context.addInitScript(() => Object.defineProperty(navigator, 'onLine', { get: () => false }))
  await context.route('**/*', route => route.request().url().startsWith(`${origin}/`) ? route.continue() : route.abort())
  const page = await context.newPage()
  await page.clock.setFixedTime(now)
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  let activeGate
  const status = page.locator('.vekira-contour-status')
  const nav = page.getByRole('navigation', { name: language === 'es' ? 'Navegación principal' : 'Main navigation', exact: true })
  try {
    await page.goto(`${origin}/login`)
    await installAccountFixture(page, state)
    await page.goto(`${origin}/dashboard`)
    await expect(nav).toBeVisible()
    await expect(status).toHaveCount(0)
    if (light) await page.evaluate(() => document.documentElement.classList.remove('dark'))
    const before = await storedAccountSnapshot(page)
    const dashboardHeadings = await page.locator('main h1, main h2, main h3').allTextContents()
    const initialNavigation = await nav.evaluate(node => { node.dataset.contourNavigationIdentity = 'preserved'; return node.dataset.contourNavigationIdentity })

    for (const [destination, mode] of (cancel ? [['/plan', 'planned']] : [['/plan', 'planned'], ['/progress', 'completed']])) {
      activeGate = await chunkGate(page)
      await nav.locator(`a[href="${destination}"]`).click()
      await expect.poll(() => activeGate.held.length).toBeGreaterThan(0)
      await expect(status).toHaveText(language === 'es' ? 'Un momento…' : 'Just a moment…')
      await expect.poll(() => status.evaluate(node => getComputedStyle(node).opacity)).toBe('1')
      await expect(page.locator('main[aria-busy="true"]')).toHaveCount(1)
      await expect(nav).toBeVisible()
      await expect(nav).toHaveAttribute('data-contour-navigation-identity', initialNavigation)
      await expect(nav.locator('a')).toHaveCount(5)
      const trail = status.locator('[data-contour-trail]')
      await expect(trail).toHaveCount(1)
      if (reducedMotion === 'reduce') {
        assert.deepEqual(await trail.evaluate(node => ({ name: getComputedStyle(node).animationName, dash: getComputedStyle(node).strokeDasharray, offset: getComputedStyle(node).strokeDashoffset })), { name: 'none', dash: 'none', offset: '0px' })
        assert.equal(await status.evaluate(node => getComputedStyle(node).animationName), 'none')
      } else {
        const beforeOffset = await trail.evaluate(node => getComputedStyle(node).strokeDashoffset)
        await expect.poll(() => trail.evaluate(node => getComputedStyle(node).strokeDashoffset)).not.toBe(beforeOffset)
      }
      await capture(page, `${name}-${destination.slice(1)}-${width}`)

      if (cancel) {
        await nav.locator('a[href="/dashboard"]').click()
        await expect(page).toHaveURL(`${origin}/dashboard`)
        await expect(status).toHaveCount(0)
        await expect.poll(() => page.locator('main h1, main h2, main h3').allTextContents()).toEqual(dashboardHeadings)
        const finishedRequests = activeGate.held.map(url => page.waitForResponse(response => response.url() === url))
        activeGate.release()
        await Promise.all(finishedRequests)
        await activeGate.finish(); activeGate = null
        // Import evaluation and its stale route promise must not replace Dashboard.
        await page.waitForTimeout(250)
        await expect(page).toHaveURL(`${origin}/dashboard`)
        await expect(status).toHaveCount(0)
        await expect(page.locator('[data-muscle-map="planned"]')).toHaveCount(0)
        await expect.poll(() => page.locator('main h1, main h2, main h3').allTextContents()).toEqual(dashboardHeadings)
        await capture(page, `${name}-returned-home-${width}`)
      } else {
        activeGate.release()
        const map = page.locator(`[data-muscle-map="${mode}"]`)
        await expect(map).toBeVisible()
        await expect(status).toHaveCount(0)
        await activeGate.finish(); activeGate = null
        const chest = map.getByRole('button', { name: language === 'es' ? /^Pecho: 3 series/ : /^Chest: 3/ })
        await chest.click()
        await expect(chest).toHaveAttribute('aria-pressed', 'true')
        await expect(nav).toHaveAttribute('data-contour-navigation-identity', initialNavigation)
        if (mode === 'completed') await expect(map.getByRole('region', { name: language === 'es' ? 'Detalle de Pecho' : 'Details for Chest', exact: true })).toContainText('Sesión contorno')
      }
    }

    await expect(page.getByRole('heading', { name: /No se pudo abrir esta pantalla|No se pudo mostrar esta pantalla/ })).toHaveCount(0)
    assert.deepEqual(await storedAccountSnapshot(page), before, 'Navigation preserves the whole account, exercise catalogue and training history')
    assert.deepEqual(errors, [])
    passed.push({ name, width, language, reducedMotion, light, passed: true })
    console.log(`PASS ${name} at ${width}px`)
  } catch (error) {
    await capture(page, `failure-${name}-${width}`).catch(() => {})
    throw error
  } finally {
    await activeGate?.finish().catch(() => {})
    await context.close()
  }
}

try {
  for (const width of [320, 390, 1440]) await run('authenticated-navigation', width)
  await run('cancel-pending-navigation', 390, { cancel: true })
  await run('english-reduced-light', 390, { language: 'en', reducedMotion: 'reduce', light: true })
} finally {
  await writeFile(`${artifacts}/results.json`, JSON.stringify({ passed }, null, 2))
  await browser.close()
}
