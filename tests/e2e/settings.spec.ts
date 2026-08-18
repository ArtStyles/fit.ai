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

  const routes = [
    { pathname: '/settings', search: '' },
    { pathname: '/settings/perfil', search: '' },
    { pathname: '/settings/datos', search: '' },
    { pathname: '/settings/entrenamiento', search: '' },
    { pathname: '/settings/notificaciones', search: '' },
    { pathname: '/settings/idioma', search: '' },
    { pathname: '/settings/cuenta', search: '' },
    { pathname: '/medidas', search: '?from=settings' },
  ] as const
  const gotoExact = async (pathname: string, search: string) => {
    await page.goto(`${pathname}${search}`)
    await expect(page).toHaveURL(url => url.pathname === pathname && url.search === search)
  }

  for (const route of routes) {
    await gotoExact(route.pathname, route.search)
    await expect(page.locator('h1')).toHaveCount(1)
    await expectNoHorizontalOverflow(page)
    await expectActionTargetsAtLeast44(page)
    await auditCriticalAndSeriousAccessibility(page)
  }

  await gotoExact('/settings/entrenamiento', '')
  await page.getByRole('button', {
    name: /casa con equipo b.sico|home with basic equipment/i,
  }).click()
  await expect(page.getByRole('group', { name: /equipo disponible|available equipment/i })).toBeVisible()
  const textEquipmentInputs = await page.locator('input[name="availableEquipment"]').evaluateAll(inputs => (
    inputs.filter(input => input instanceof HTMLInputElement && input.type === 'text').length
  ))
  expect(textEquipmentInputs).toBe(0)

  await gotoExact('/medidas', '?from=settings')
  await page.getByRole('link', { name: /ajustes|settings/i }).click()
  await expect(page).toHaveURL(url => url.pathname === '/settings' && url.search === '')
})
