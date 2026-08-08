import { expect, test } from './fixtures'
import { isTrainerRelationshipsE2EEnabled, seedCoreProductFixture } from './helpers/core-product'
import { signInAsE2EUser } from './helpers/auth'

test.describe.configure({ mode: 'serial' })

test('trainer relationships keeps the browser entry point scoped to the E2E run', async ({ page }) => {
  test.skip(!isTrainerRelationshipsE2EEnabled(process.env), 'Requires E2E_TRAINER_RELATIONSHIPS_ENABLED=true and dedicated E2E credentials')
  test.setTimeout(240_000)
  await seedCoreProductFixture('es')
  await signInAsE2EUser(page)

  await page.goto('/trainers')
  await expect(page.getByRole('heading', { name: 'Entrenadores', exact: true })).toBeVisible()
  // The complete fixture is intentionally service-role scoped: it creates two
  // pending requests, accepts one, grants/revokes body consent, ends the
  // relationship, suspends/reinstates the trainer, then requires client resume.
  // It runs only on the dedicated remote once migration 042 is deployed.
})
