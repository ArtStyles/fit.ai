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
  await expect(page.getByRole('heading', { name: /semana en curso|week in progress/i })).toBeVisible()

  await page.getByRole('link', { name: /^plan$/i }).click()
  await expect(page.getByRole('heading', { name: /tu semana|your week/i })).toBeVisible()
  await page.getByRole('button', { name: /e2e full body/i }).first().click()
  await expect(page.getByRole('button', { name: /editar estructura|edit structure/i })).toBeVisible()

  await page.goto('/dashboard')
  await page.getByRole('link', { name: /empezar entrenamiento|start workout/i }).click()

  await expect(page).toHaveURL(/\/session\/[0-9a-f-]+$/i, { timeout: 90_000 })
  await expect(page.getByRole('button', { name: /finalizar|finish/i })).toBeDisabled({ timeout: 120_000 })

  const currentSet = page.getByRole('group', { name: /serie actual|current set/i })
  await currentSet.getByLabel(/peso en kilogramos|weight in kilograms/i).fill('40')
  await currentSet.getByLabel(/repeticiones|reps/i).fill('10')
  await page.getByRole('button', { name: /completar serie 1|complete set 1/i }).click()
  await expect(page.getByText(/descanso activo|active rest/i)).toBeVisible()

  await expect(page.locator('[data-session-sync-state="saved-local"]')).toBeVisible()
  await expect(page.getByText(/guardado en este dispositivo|saved on this device/i).first()).toBeVisible()

  await page.getByRole('button', { name: /finalizar|finish/i }).click()
  await expect(page.getByRole('heading', { level: 1, name: /e2e full body/i })).toBeVisible()

  await page.getByRole('button', { name: /guardar sesión|save session/i }).click()
  await expect(page.getByText(/sincronizado|synced/i).first()).toBeVisible({ timeout: 45_000 })
  await expect(page.getByRole('button', { name: /volver al dashboard|return to dashboard/i })).toBeEnabled()
})
