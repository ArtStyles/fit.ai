import type { Locator } from '@playwright/test'
import { expect, test } from './fixtures'
import { signInAsE2EUser } from './helpers/auth'
import { seedCoreProductFixture } from './helpers/core-product'

async function waitForOwnAnimations(locator: Locator) {
  await locator.evaluate(async element => {
    const animations = element.getAnimations({ subtree: false })
    await Promise.all(animations.map(animation => animation.finished.catch(() => undefined)))
  })
}

test('dialogs are bottom sheets on mobile and centered panels on desktop', async ({ page }) => {
  test.setTimeout(120_000)
  await seedCoreProductFixture('es')
  await signInAsE2EUser(page)
  await page.goto('/plan')
  await page.addStyleTag({
    content: ':root { --safe-area-inset-top: 32px !important; --safe-area-inset-bottom: 20px !important; }',
  })

  await page.getByLabel(/acciones del plan|plan actions/i, { exact: true }).click()
  await expect(page.getByRole('button', { name: /regenerar semana|regenerate week/i })).toHaveCount(0)
  await page.getByRole('button', { name: /ajustar plan|adjust plan/i }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()
  await waitForOwnAnimations(dialog)

  const viewport = page.viewportSize()
  const dialogBox = await dialog.boundingBox()
  const closeBox = await dialog.getByRole('button', { name: /cerrar|close/i }).boundingBox()
  expect(viewport).not.toBeNull()
  expect(dialogBox).not.toBeNull()
  expect(closeBox).not.toBeNull()
  if (!viewport || !dialogBox || !closeBox) throw new Error('Overlay geometry is unavailable')

  expect(closeBox.width).toBeGreaterThanOrEqual(44)
  expect(closeBox.height).toBeGreaterThanOrEqual(44)
  expect(dialogBox.x).toBeGreaterThanOrEqual(0)
  expect(dialogBox.x + dialogBox.width).toBeLessThanOrEqual(viewport.width)
  expect(await dialog.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true)

  if (viewport.width < 640) {
    expect(dialogBox.y).toBeGreaterThanOrEqual(56)
    expect(Math.abs(dialogBox.y + dialogBox.height - viewport.height)).toBeLessThanOrEqual(1)
    expect(dialogBox.width).toBeLessThanOrEqual(viewport.width - 32)
  } else {
    expect(Math.abs(dialogBox.x + dialogBox.width / 2 - viewport.width / 2)).toBeLessThanOrEqual(2)
    expect(Math.abs(dialogBox.y + dialogBox.height / 2 - viewport.height / 2)).toBeLessThanOrEqual(2)
    expect(await dialog.evaluate(element => getComputedStyle(element).borderRadius)).toBe('16px')
  }

  await page.setViewportSize({ width: viewport.width, height: 480 })
  const scrollRegion = dialog.locator('[data-fitai-dialog-scroll-region]')
  await scrollRegion.evaluate(element => { element.scrollTop = element.scrollHeight })
  await expect.poll(() => scrollRegion.evaluate(element => element.scrollTop)).toBeGreaterThan(0)

  const scrolledDialogBox = await dialog.boundingBox()
  const scrolledCloseBox = await dialog.getByRole('button', { name: /cerrar|close/i }).boundingBox()
  expect(scrolledDialogBox).not.toBeNull()
  expect(scrolledCloseBox).not.toBeNull()
  if (!scrolledDialogBox || !scrolledCloseBox) throw new Error('Scrolled dialog geometry is unavailable')

  expect(scrolledCloseBox.x).toBeGreaterThanOrEqual(scrolledDialogBox.x)
  expect(scrolledCloseBox.y).toBeGreaterThanOrEqual(scrolledDialogBox.y)
  expect(scrolledCloseBox.x + scrolledCloseBox.width)
    .toBeLessThanOrEqual(scrolledDialogBox.x + scrolledDialogBox.width)
  expect(scrolledCloseBox.y + scrolledCloseBox.height)
    .toBeLessThanOrEqual(scrolledDialogBox.y + scrolledDialogBox.height)

  const close = dialog.getByRole('button', { name: /cerrar|close/i })
  await close.focus()
  await expect(close).toBeFocused()
})

test('toasts respect simulated safe areas and reduced motion', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/login?notice=settings_saved')
  await page.addStyleTag({
    content: ':root { --safe-area-inset-top: 32px !important; --safe-area-inset-right: 18px !important; --safe-area-inset-left: 12px !important; }',
  })

  const close = page.getByRole('button', { name: /cerrar notificacion|close notification/i }).first()
  await expect(close).toBeVisible()
  const toast = close.locator('xpath=..')
  const viewport = page.viewportSize()
  const toastBox = await toast.boundingBox()
  const closeBox = await close.boundingBox()
  expect(viewport).not.toBeNull()
  expect(toastBox).not.toBeNull()
  expect(closeBox).not.toBeNull()
  if (!viewport || !toastBox || !closeBox) throw new Error('Toast geometry is unavailable')

  expect(toastBox.y).toBeGreaterThanOrEqual(48)
  expect(toastBox.x).toBeGreaterThanOrEqual(28)
  expect(viewport.width - toastBox.x - toastBox.width).toBeGreaterThanOrEqual(34)
  expect(closeBox.width).toBeGreaterThanOrEqual(44)
  expect(closeBox.height).toBeGreaterThanOrEqual(44)
  expect(await toast.evaluate(element => element.getAnimations({ subtree: false }).length)).toBe(0)
})
