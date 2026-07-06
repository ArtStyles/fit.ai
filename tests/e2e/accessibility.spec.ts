import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { expectNoHorizontalOverflow } from './helpers/acceptance'
import { resetAndSignInAsE2EUser } from './helpers/auth'

test.describe.configure({ mode: 'serial' })

async function auditCurrentPage(page: Page) {
  await expect(page.locator('main')).toBeVisible()
  const result = await new AxeBuilder({ page }).analyze()
  expect(result.violations.filter(v => ['critical', 'serious'].includes(v.impact ?? ''))).toEqual([])
  await expectNoHorizontalOverflow(page)
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
