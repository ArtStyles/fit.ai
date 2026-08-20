import type { Page } from '@playwright/test'
import { expect, test } from './fixtures'
import {
  auditCriticalAndSeriousAccessibility,
  expectActionTargetsAtLeast44,
  expectNoHorizontalOverflow,
} from './helpers/acceptance'
import { resetAndSignInAsE2EUser, signInAsE2EUser } from './helpers/auth'
import { seedCoreProductFixture, seedCoreProgressHistory } from './helpers/core-product'

test.describe.configure({ mode: 'serial' })

async function auditCurrentPage(page: Page) {
  await expect(page.locator('main')).toBeVisible()
  await auditCriticalAndSeriousAccessibility(page)
  await expectNoHorizontalOverflow(page)
}

async function expectNamedMain(page: Page) {
  const main = page.locator('main')
  await expect(main).toHaveCount(1)
  await expect(main).toHaveAttribute('aria-label', /\S+/)
}

async function expectOneH1(page: Page) {
  await expect(page.locator('h1')).toHaveCount(1, { timeout: 30_000 })
}

async function expectVisiblePrimaryAction(page: Page, name: RegExp) {
  const action = page.getByRole('link', { name }).or(page.getByRole('button', { name })).first()
  await expect(action).toBeVisible({ timeout: 120_000 })
}

async function gotoAuthenticatedRoute(page: Page, path: string) {
  await page.goto(path, { waitUntil: 'domcontentloaded', timeout: 90_000 })
  if (new URL(page.url()).pathname === '/login') {
    await signInAsE2EUser(page)
    await page.goto(path, { waitUntil: 'domcontentloaded', timeout: 90_000 })
  }
}

for (const path of [
  '/',
  '/es',
  '/en',
  '/pricing',
  '/register?locale=es',
  '/register?locale=en',
  '/register?locale=en&plan=pro-monthly',
  '/es/privacidad',
  '/en/privacy',
  '/es/terminos',
  '/en/terms',
]) {
  test(`${path} has no serious accessibility violations or horizontal overflow`, async ({ page }) => {
    test.setTimeout(90_000)
    await page.goto(path)
    await expect(page.locator('main')).toBeVisible()
    if (path.startsWith('/register?locale=')) {
      const expectedLanguage = path.includes('locale=en') ? 'en' : 'es'
      await expect(page.locator('html')).toHaveAttribute('lang', expectedLanguage)
    }
    await auditCurrentPage(page)
  })
}

test('every rendered onboarding stage has no serious accessibility violations or horizontal overflow', async ({ page }) => {
  test.setTimeout(180_000)
  await resetAndSignInAsE2EUser(page)

  const answers = {
    full_name: 'Activation E2E',
    username: 'codex_ui_seo_e2e',
    goal: 'stay_active',
    fitness_level: 'beginner',
    days_per_week: 2,
    session_duration: 30,
    gym_type: 'home_no_equipment',
    equipment: [],
    injuries: '',
    cardio_preferences: ['walking'],
    activity_level: 'regularly_active',
    warning_symptoms: [],
    known_disease: false,
    medically_cleared: false,
    recent_surgery: false,
    limitation_regions: [],
    limitation_status: null,
    movements_to_avoid: '',
    clinician_cleared: false,
    age: '30',
    weight_kg: '70',
    height_cm: '175',
    gender: 'other',
  }
  const stages = [
    ['profile', 'Empecemos por ti'],
    ['availability', 'Tu ritmo, tu agenda'],
    ['equipment', 'Dónde vas a entrenar'],
    ['safety', 'Seguridad antes que intensidad'],
    ['confirmation', 'Confirma tu punto de partida'],
  ] as const

  for (const [stage, title] of stages) {
    await page.evaluate(
      state => localStorage.setItem('fitai_onboarding_v2', JSON.stringify(state)),
      { answers, stage, safetyReviewed: stage === 'confirmation' },
    )
    await page.reload()
    await expect(page.getByRole('heading', { level: 1, name: title, exact: true })).toBeVisible()
    await auditCurrentPage(page)
  }
})

test('authenticated core routes meet route-level accessibility acceptance', async ({ page }) => {
  test.setTimeout(240_000)
  const fixture = await seedCoreProductFixture('es')
  const { progressLogId } = await seedCoreProgressHistory(fixture)
  await signInAsE2EUser(page)

  const routes = [
    { path: '/dashboard', primary: /empezar entrenamiento|start workout/i, namedMain: true },
    { path: `/session/${fixture.workoutId}`, primary: /completar serie 1|complete set 1/i, namedMain: true },
    { path: '/plan', primary: /editar estructura|edit structure/i, namedMain: true, openWorkout: true },
    { path: '/calendario', primary: /hoy|today/i, namedMain: false },
    { path: '/progress', primary: /12 semanas|12 weeks/i, namedMain: false },
    { path: '/history', primary: /todas|all/i, namedMain: false },
    { path: `/history/${progressLogId}`, primary: /mostrar series|show sets/i, namedMain: false },
    { path: `/exercises/${fixture.exerciseId}`, primary: /12 semanas|12 weeks/i, namedMain: false },
    { path: '/notifications', primary: /preferencias de notificaciones|notification preferences/i, namedMain: true },
  ] as const

  for (const route of routes) {
    await gotoAuthenticatedRoute(page, route.path)
    await expectOneH1(page)
    if ('openWorkout' in route && route.openWorkout) {
      await page.getByRole('button', { name: /e2e full body/i }).first().click()
    }
    await expectVisiblePrimaryAction(page, route.primary)
    if (route.namedMain) await expectNamedMain(page)
    await expectActionTargetsAtLeast44(page)
    await auditCurrentPage(page)
  }
})

test('core training actions are keyboard reachable', async ({ page }) => {
  test.setTimeout(180_000)
  const fixture = await seedCoreProductFixture('es')
  await signInAsE2EUser(page)

  await page.goto('/dashboard')
  const notificationLink = page.getByRole('link', { name: /abrir notificaciones|open notifications/i })
  await notificationLink.focus()
  await expect(notificationLink).toBeFocused()

  await page.goto('/plan')
  const workout = page.getByRole('button', { name: /e2e full body/i }).first()
  await workout.focus()
  await expect(workout).toBeFocused()

  await page.goto(`/session/${fixture.workoutId}`)
  const exerciseMenu = page.getByRole('button', { name: /menú del ejercicio|exercise menu/i })
  await exerciseMenu.focus()
  await expect(exerciseMenu).toBeFocused()
})
