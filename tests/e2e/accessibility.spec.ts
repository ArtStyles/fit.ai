import AxeBuilder from '@axe-core/playwright'
import type { Page } from '@playwright/test'
import { expect, test } from './fixtures'
import { expectNoHorizontalOverflow } from './helpers/acceptance'
import { resetAndSignInAsE2EUser, signInAsE2EUser } from './helpers/auth'
import { seedCoreProductFixture } from './helpers/core-product'

test.describe.configure({ mode: 'serial' })

async function auditCurrentPage(page: Page) {
  await expect(page.locator('main')).toBeVisible()
  const result = await new AxeBuilder({ page }).analyze()
  expect(result.violations.filter(v => ['critical', 'serious'].includes(v.impact ?? ''))).toEqual([])
  await expectNoHorizontalOverflow(page)
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

async function expectTouchTargetsAtLeast44(page: Page) {
  const failures = await page.evaluate(() => {
    const selectors = [
      'button',
      'a[href]',
      'input:not([type="hidden"])',
      'select',
      'textarea',
      'summary',
      '[role="button"]',
      '[role="link"]',
      '[role="tab"]',
    ].join(',')

    return Array.from(document.querySelectorAll<HTMLElement>(selectors))
      .filter(element => {
        const style = window.getComputedStyle(element)
        const rect = element.getBoundingClientRect()
        return style.display !== 'none' &&
          style.visibility !== 'hidden' &&
          !element.classList.contains('sr-only') &&
          Number(style.opacity) !== 0 &&
          rect.width > 0 &&
          rect.height > 0
      })
      .map(element => {
        const rect = element.getBoundingClientRect()
        return {
          label: element.getAttribute('aria-label') ?? element.textContent?.trim().replace(/\s+/g, ' ').slice(0, 80) ?? element.tagName,
          tag: element.tagName.toLowerCase(),
          width: Math.round(rect.width),
          height: Math.round(rect.height),
        }
      })
      .filter(target => target.width < 44 || target.height < 44)
  })

  expect(failures).toEqual([])
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
  await signInAsE2EUser(page)

  const routes = [
    { path: '/dashboard', primary: /empezar entrenamiento|start workout/i },
    { path: `/session/${fixture.workoutId}`, primary: /completar serie|complete set/i },
    { path: '/plan', primary: /empezar entrenamiento|abrir rutina de hoy|start workout|open today/i },
    { path: '/progress', primary: /historial|history/i },
  ] as const

  for (const route of routes) {
    await gotoAuthenticatedRoute(page, route.path)
    await expectOneH1(page)
    await expectVisiblePrimaryAction(page, route.primary)
    await expectTouchTargetsAtLeast44(page)
    await auditCurrentPage(page)
  }
})
