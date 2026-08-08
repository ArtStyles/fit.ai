import type { Page } from '@playwright/test'
import { expect, test } from './fixtures'
import { seedCoreProductFixture } from './helpers/core-product'
import { signInAsE2EUser } from './helpers/auth'

test.describe.configure({ mode: 'serial' })

async function expectCommunityNotFound(page: Page, socialHeading: string): Promise<void> {
  await expect(page.getByRole('heading', { level: 1, name: '404', exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'This page could not be found.', exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: socialHeading, exact: true })).toHaveCount(0)
}

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

  await page.goto('/feed/new')
  await expectCommunityNotFound(page, 'Crear publicación')

  await page.goto('/post/00000000-0000-4000-8000-000000000001')
  await expectCommunityNotFound(page, 'Publicación')

  await page.goto('/notifications')
  await expect(page.getByRole('heading', { level: 1, name: 'Notificaciones', exact: true })).toBeVisible()
  await expect(
    page.getByRole('heading', { name: 'No tienes notificaciones todavía', exact: true })
      .or(page.getByRole('heading', { name: 'Recientes', exact: true })),
  ).toBeVisible()
})
