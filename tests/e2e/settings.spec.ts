import { expect, test } from './fixtures'
import {
  auditCriticalAndSeriousAccessibility,
  expectActionTargetsAtLeast44,
  expectNoHorizontalOverflow,
} from './helpers/acceptance'
import { signInAsE2EUser } from './helpers/auth'

test('settings routes are coherent, responsive and accessible', async ({ page }) => {
  test.setTimeout(240_000)
  await signInAsE2EUser(page)

  for (const route of [
    '/settings',
    '/settings/perfil',
    '/settings/datos',
    '/settings/entrenamiento',
    '/settings/notificaciones',
    '/settings/idioma',
    '/settings/cuenta',
    '/medidas?from=settings',
  ]) {
    await page.goto(route)
    await expect(page.locator('h1')).toHaveCount(1)
    await expectNoHorizontalOverflow(page)
    await expectActionTargetsAtLeast44(page)
    await auditCriticalAndSeriousAccessibility(page)
  }

  await page.goto('/settings/entrenamiento')
  await expect(page.getByRole('group', { name: /equipo disponible|available equipment/i })).toBeVisible()
  await expect(page.locator('input[name="availableEquipment"][type="text"]')).toHaveCount(0)

  await page.goto('/medidas?from=settings')
  await page.getByRole('link', { name: /ajustes|settings/i }).click()
  await expect(page).toHaveURL(/\/settings$/)
})
