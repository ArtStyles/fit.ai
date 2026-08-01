import { expect, test } from './fixtures'
import { signInAsE2EUser } from './helpers/auth'
import { seedCoreProductFixture, seedCoreProgressHistory } from './helpers/core-product'

test('training evidence routes form one navigable journey', async ({ page }) => {
  test.setTimeout(180_000)
  const fixture = await seedCoreProductFixture('es')
  const { progressLogId } = await seedCoreProgressHistory(fixture)
  await signInAsE2EUser(page)

  await page.goto('/calendario')
  await expect(page.getByRole('heading', { name: /actividad del mes|monthly activity/i })).toBeVisible()
  await expect(page.getByText(/día seleccionado|selected day/i)).toBeVisible()

  await page.goto('/progress')
  await expect(page.getByRole('heading', { name: /tu progreso tiene dirección|your progress has direction/i })).toBeVisible()
  await page.getByRole('button', { name: /4 semanas|4 weeks/i }).click()

  await page.goto('/history')
  await expect(page.getByRole('heading', { name: /registro cronológico|chronological log/i })).toBeVisible()

  await page.goto(`/history/${progressLogId}`)
  await expect(page.getByRole('heading', { name: /secuencia de la sesión|session sequence/i })).toBeVisible()

  await page.goto(`/exercises/${fixture.exerciseId}`)
  await expect(page.getByRole('heading', { name: /evolución de fuerza|strength progression/i })).toBeVisible()
})
