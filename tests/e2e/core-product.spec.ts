import { expect, test } from './fixtures'
import { seedCoreProductFixture } from './helpers/core-product'
import { signInAsE2EUser } from './helpers/auth'

test.describe.configure({ mode: 'serial' })

test('user starts, logs, completes, and syncs today workout', async ({ page }) => {
  test.setTimeout(180_000)
  await seedCoreProductFixture('es')
  await signInAsE2EUser(page)

  await page.goto('/dashboard')
  await expect(page).toHaveURL(/\/dashboard$/)
  await expect(page.locator('h1')).toHaveCount(1, { timeout: 30_000 })
  await page.getByRole('link', { name: /empezar entrenamiento|start workout/i }).click()

  await expect(page).toHaveURL(/\/session\/[0-9a-f-]+$/i, { timeout: 90_000 })
  await expect(page.getByRole('button', { name: /finalizar|finish/i })).toBeDisabled({ timeout: 120_000 })

  await page.getByLabel(/peso en kilogramos|weight in kilograms/i).first().fill('40')
  await page.getByLabel(/repeticiones|reps/i).first().fill('10')
  await page.getByRole('button', { name: /completar serie|complete set/i }).first().click()

  await expect(page.locator('[data-session-sync-state="saved-local"]')).toBeVisible()
  await expect(page.getByText(/guardado en este dispositivo|saved on this device/i).first()).toBeVisible()

  await page.getByRole('button', { name: /finalizar|finish/i }).click()
  await expect(page.getByRole('heading', { level: 1, name: /e2e full body/i })).toBeVisible()

  await page.getByRole('button', { name: /guardar sesión|save session/i }).click()
  await expect(page.getByText(/sincronizado|synced/i).first()).toBeVisible({ timeout: 45_000 })
  await expect(page.getByRole('button', { name: /volver al dashboard|return to dashboard/i })).toBeEnabled()
})
