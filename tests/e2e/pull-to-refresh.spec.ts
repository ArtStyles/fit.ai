import type { Locator, Page } from '@playwright/test'
import { expect, test } from './fixtures'
import { signInAsE2EUser } from './helpers/auth'
import { seedCoreProductFixture } from './helpers/core-product'

async function dragDown(page: Page, viewport: Locator, distance: number) {
  const selector = '[data-app-scroll-viewport]'
  await expect(viewport).toBeVisible()

  await page.evaluate(async ({ selector, distance }) => {
    const target = document.querySelector(selector)
    if (!(target instanceof HTMLElement)) throw new Error('App viewport not found')

    const fire = (type: 'touchstart' | 'touchmove' | 'touchend', y: number) => {
      const touch = new Touch({
        identifier: 1,
        target,
        clientX: 180,
        clientY: y,
        pageX: 180,
        pageY: y,
        radiusX: 2,
        radiusY: 2,
        force: 0.5,
      })
      const activeTouches = type === 'touchend' ? [] : [touch]
      target.dispatchEvent(new TouchEvent(type, {
        bubbles: true,
        cancelable: true,
        touches: activeTouches,
        targetTouches: activeTouches,
        changedTouches: [touch],
      }))
    }

    fire('touchstart', 80)
    await new Promise(resolve => setTimeout(resolve, 20))
    fire('touchmove', 80 + distance / 2)
    await new Promise(resolve => setTimeout(resolve, 20))
    fire('touchmove', 80 + distance)
    await new Promise(resolve => setTimeout(resolve, 20))
    fire('touchend', 80 + distance)
  }, { selector, distance })
}

test.describe.configure({ mode: 'serial' })

test('pull-to-refresh only activates beyond the threshold and keeps chrome fixed', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile-375')
  test.setTimeout(120_000)

  await page.addInitScript(() => {
    const vibrations: Array<number | number[]> = []
    Object.defineProperty(window, '__vekiraTestVibrations', {
      configurable: true,
      value: vibrations,
    })
    Object.defineProperty(navigator, 'vibrate', {
      configurable: true,
      value: (pattern: number | number[]) => {
        vibrations.push(pattern)
        return true
      },
    })
  })

  await seedCoreProductFixture()
  await signInAsE2EUser(page)
  await page.goto('/dashboard')
  await expect(page).toHaveURL(/\/dashboard$/)
  await expect(page.locator('h1')).toHaveCount(1, { timeout: 30_000 })
  await page.waitForLoadState('networkidle')

  const viewport = page.locator('[data-app-scroll-viewport]')
  await viewport.evaluate(element => { element.scrollTop = 0 })

  const header = page.locator('header').first()
  const before = await header.boundingBox()
  if (!before) throw new Error('Fixed header geometry is unavailable')

  const refreshRequests: string[] = []
  page.on('request', request => {
    const url = new URL(request.url())
    const isCurrentRscRefresh = url.pathname === '/dashboard'
      && url.searchParams.has('_rsc')
      && request.headers()['next-router-prefetch'] !== '1'
    if (isCurrentRscRefresh) refreshRequests.push(request.url())
  })

  await dragDown(page, viewport, 48)
  await page.waitForTimeout(750)
  expect(refreshRequests).toHaveLength(0)
  expect(await page.evaluate(() => (
    (window as typeof window & {
      __vekiraTestVibrations: Array<number | number[]>
    }).__vekiraTestVibrations
  ))).toEqual([])

  const refreshStartedAt = Date.now()
  await dragDown(page, viewport, 96)
  await expect(page.locator('[data-pull-refresh-phase="refreshing"]')).toBeVisible()
  await expect.poll(() => refreshRequests.length).toBe(1)
  expect(await page.evaluate(() => (
    (window as typeof window & {
      __vekiraTestVibrations: Array<number | number[]>
    }).__vekiraTestVibrations
  ))).toEqual([40])

  await expect(page.locator('[data-pull-refresh-phase]')).toHaveCount(0, {
    timeout: 3_000,
  })
  expect(Date.now() - refreshStartedAt).toBeGreaterThanOrEqual(600)
  await page.waitForTimeout(500)
  expect(refreshRequests).toHaveLength(1)

  const after = await header.boundingBox()
  if (!after) throw new Error('Fixed header geometry is unavailable after refresh')
  expect(Math.abs(after.y - before.y)).toBeLessThanOrEqual(1)
  expect(Math.abs(after.height - before.height)).toBeLessThanOrEqual(1)
})

test('a stalled refresh releases the indicator through the ten-second fail-safe', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile-375')
  test.setTimeout(120_000)

  await seedCoreProductFixture()
  await signInAsE2EUser(page)
  await page.goto('/dashboard')
  await expect(page).toHaveURL(/\/dashboard$/)

  await page.route('**/dashboard?*', async route => {
    const url = new URL(route.request().url())
    if (url.searchParams.has('_rsc')) {
      await new Promise(resolve => setTimeout(resolve, 11_000))
      await route.abort()
      return
    }
    await route.continue()
  })

  const viewport = page.locator('[data-app-scroll-viewport]')
  await viewport.evaluate(element => { element.scrollTop = 0 })
  await dragDown(page, viewport, 96)

  await expect(page.locator('[data-pull-refresh-phase="refreshing"]')).toBeVisible()
  await expect(page.locator('[data-pull-refresh-phase]')).toHaveCount(0, {
    timeout: 12_000,
  })
})
