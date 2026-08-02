import { expect, test } from './fixtures'
import { signInAsE2EUser } from './helpers/auth'
import { seedCoreProductFixture } from './helpers/core-product'

test('dialogs are bottom sheets on mobile and centered panels on desktop', async ({ page }) => {
  test.setTimeout(120_000)
  await seedCoreProductFixture('es')
  await signInAsE2EUser(page)
  await page.goto('/plan')
  await page.addStyleTag({
    content: ':root { --safe-area-inset-top: 32px !important; --safe-area-inset-bottom: 20px !important; }',
  })

  await page.getByRole('button', { name: /ajustar plan|adjust plan/i }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()

  const viewport = page.viewportSize()
  const dialogBox = await dialog.boundingBox()
  const closeBox = await dialog.getByRole('button', { name: /cerrar|close/i }).boundingBox()
  expect(viewport).not.toBeNull()
  expect(dialogBox).not.toBeNull()
  expect(closeBox).not.toBeNull()
  if (!viewport || !dialogBox || !closeBox) throw new Error('Overlay geometry is unavailable')

  expect(closeBox.width).toBeGreaterThanOrEqual(44)
  expect(closeBox.height).toBeGreaterThanOrEqual(44)

  if (viewport.width < 640) {
    expect(dialogBox.y).toBeGreaterThanOrEqual(56)
    expect(Math.abs(dialogBox.y + dialogBox.height - viewport.height)).toBeLessThanOrEqual(1)
    expect(dialogBox.width).toBeLessThanOrEqual(viewport.width - 32)
  } else {
    expect(Math.abs(dialogBox.x + dialogBox.width / 2 - viewport.width / 2)).toBeLessThanOrEqual(2)
    expect(Math.abs(dialogBox.y + dialogBox.height / 2 - viewport.height / 2)).toBeLessThanOrEqual(2)
  }
})
