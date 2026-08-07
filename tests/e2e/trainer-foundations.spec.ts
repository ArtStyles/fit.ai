import { expect, test } from './fixtures'
import { seedCoreProductFixture } from './helpers/core-product'
import { signInAsE2EUser } from './helpers/auth'

test.describe.configure({ mode: 'serial' })

test('community-off rollout exposes trainer navigation and guards social routes', async ({ page }) => {
  test.setTimeout(180_000)
  await seedCoreProductFixture('es')
  await signInAsE2EUser(page)

  await page.goto('/dashboard')
  await expect(page.getByRole('link', { name: 'Entrenadores', exact: true })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Comunidad', exact: true })).toHaveCount(0)

  await page.goto('/feed')
  await expect(page).toHaveURL(/\/trainers$/)
  await expect(page.getByRole('heading', { level: 1, name: 'Entrenadores', exact: true })).toBeVisible()

  const newPostResponse = await page.goto('/feed/new')
  expect(newPostResponse?.status()).toBe(404)
  await expect(page.getByRole('heading', { name: 'Crear publicación', exact: true })).toHaveCount(0)

  const postResponse = await page.goto('/post/00000000-0000-4000-8000-000000000001')
  expect(postResponse?.status()).toBe(404)
  await expect(page.getByRole('heading', { name: 'Publicación', exact: true })).toHaveCount(0)

  await page.goto('/notifications')
  await expect(page.getByRole('heading', { level: 1, name: 'Notificaciones', exact: true })).toBeVisible()
  await expect(
    page.getByRole('heading', { name: 'No tienes notificaciones todavía', exact: true })
      .or(page.getByRole('heading', { name: 'Recientes', exact: true })),
  ).toBeVisible()
})
