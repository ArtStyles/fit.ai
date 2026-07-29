import type { Locator, Page } from '@playwright/test'
import { expect, test } from './fixtures'
import { signInAsE2EUser } from './helpers/auth'
import { seedCoreProductFixture } from './helpers/core-product'

type TestTouch = {
  identifier: number
  x: number
  y: number
}

async function fireTouchEvent(
  target: Locator,
  type: 'touchstart' | 'touchmove' | 'touchend' | 'touchcancel',
  touches: TestTouch[],
  changedTouches: TestTouch[] = touches,
): Promise<boolean> {
  return target.evaluate((element, event) => {
    const createTouch = (point: TestTouch) => new Touch({
      identifier: point.identifier,
      target: element,
      clientX: point.x,
      clientY: point.y,
      pageX: point.x,
      pageY: point.y,
      radiusX: 2,
      radiusY: 2,
      force: 0.5,
    })
    const active = event.touches.map(createTouch)
    const touchEvent = new TouchEvent(event.type, {
      bubbles: true,
      cancelable: true,
      touches: active,
      targetTouches: active,
      changedTouches: event.changedTouches.map(createTouch),
    })
    element.dispatchEvent(touchEvent)
    return touchEvent.defaultPrevented
  }, { type, touches, changedTouches })
}

async function dragDown(page: Page, viewport: Locator, distance: number) {
  await expect(viewport).toBeVisible()
  const start = { identifier: 1, x: 180, y: 80 }
  const halfway = { ...start, y: 80 + distance / 2 }
  const end = { ...start, y: 80 + distance }

  await fireTouchEvent(viewport, 'touchstart', [start])
  await page.waitForTimeout(20)
  await fireTouchEvent(viewport, 'touchmove', [halfway])
  await page.waitForTimeout(20)
  await fireTouchEvent(viewport, 'touchmove', [end])
  await page.waitForTimeout(20)
  await fireTouchEvent(viewport, 'touchend', [], [end])
}

async function openDashboard(page: Page) {
  await signInAsE2EUser(page)
  await page.goto('/dashboard')
  await expect(page).toHaveURL(/\/dashboard$/)
  await expect(page.locator('h1')).toHaveCount(1, { timeout: 30_000 })
}

async function mountNestedScroller(viewport: Locator): Promise<Locator> {
  await viewport.evaluate(element => {
    const scroller = document.createElement('div')
    scroller.id = 'ptr-nested-scroller'
    scroller.style.height = '120px'
    scroller.style.width = '100%'
    scroller.style.flex = '0 0 120px'
    scroller.style.overflowY = 'auto'

    const content = document.createElement('div')
    content.style.height = '720px'
    content.textContent = 'Nested scrolling content'
    scroller.append(content)
    element.prepend(scroller)
  })

  const nestedScroller = viewport.locator('#ptr-nested-scroller')
  await expect(nestedScroller).toBeVisible()
  return nestedScroller
}

test.beforeAll(async (_fixtures, workerInfo) => {
  if (workerInfo.project.name !== 'mobile-375') return
  test.setTimeout(120_000)
  await seedCoreProductFixture()
})

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

  await openDashboard(page)
  await page.waitForLoadState('networkidle')

  const viewport = page.locator('[data-app-scroll-viewport]')
  await viewport.evaluate(element => { element.scrollTop = 0 })

  const header = page.locator('header').first()
  const before = await header.boundingBox()
  if (!before) throw new Error('Fixed header geometry is unavailable')

  const bottomNavigation = page.getByRole('navigation', {
    name: /principal|main navigation/i,
  })
  const bottomBefore = await bottomNavigation.boundingBox()
  if (!bottomBefore) throw new Error('Fixed bottom navigation geometry is unavailable')

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
    timeout: 9_000,
  })
  const refreshElapsed = Date.now() - refreshStartedAt
  expect(refreshElapsed).toBeGreaterThanOrEqual(600)
  expect(refreshElapsed).toBeLessThan(10_000)
  await page.waitForTimeout(500)
  expect(refreshRequests).toHaveLength(1)

  const after = await header.boundingBox()
  if (!after) throw new Error('Fixed header geometry is unavailable after refresh')
  expect(Math.abs(after.y - before.y)).toBeLessThanOrEqual(1)
  expect(Math.abs(after.height - before.height)).toBeLessThanOrEqual(1)

  const bottomAfter = await bottomNavigation.boundingBox()
  if (!bottomAfter) {
    throw new Error('Fixed bottom navigation geometry is unavailable after refresh')
  }
  expect(Math.abs(bottomAfter.x - bottomBefore.x)).toBeLessThanOrEqual(1)
  expect(Math.abs(bottomAfter.y - bottomBefore.y)).toBeLessThanOrEqual(1)
  expect(Math.abs(bottomAfter.width - bottomBefore.width)).toBeLessThanOrEqual(1)
  expect(Math.abs(bottomAfter.height - bottomBefore.height)).toBeLessThanOrEqual(1)
})

test('adding a second touch cancels an armed pull without refreshing', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile-375')
  test.setTimeout(120_000)

  await openDashboard(page)
  await page.waitForLoadState('networkidle')

  const refreshRequests: string[] = []
  page.on('request', request => {
    const url = new URL(request.url())
    if (
      url.pathname === '/dashboard'
      && url.searchParams.has('_rsc')
      && request.headers()['next-router-prefetch'] !== '1'
    ) refreshRequests.push(request.url())
  })

  const viewport = page.locator('[data-app-scroll-viewport]')
  await viewport.evaluate(element => { element.scrollTop = 0 })
  const primary = { identifier: 1, x: 180, y: 176 }
  const secondary = { identifier: 2, x: 220, y: 176 }

  await fireTouchEvent(viewport, 'touchstart', [{ ...primary, y: 80 }])
  await fireTouchEvent(viewport, 'touchmove', [primary])
  await expect(page.locator('[data-pull-refresh-phase="armed"]')).toBeVisible()

  await fireTouchEvent(viewport, 'touchstart', [primary, secondary], [secondary])
  await expect(page.locator('[data-pull-refresh-phase="settling"]')).toBeVisible()
  await fireTouchEvent(viewport, 'touchend', [primary], [secondary])
  await fireTouchEvent(viewport, 'touchend', [], [primary])

  await expect(page.locator('[data-pull-refresh-phase]')).toHaveCount(0)
  await page.waitForTimeout(750)
  expect(refreshRequests).toHaveLength(0)
})

test('a nested scroller away from its top keeps normal downward scrolling uncaptured', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile-375')
  test.setTimeout(120_000)

  await openDashboard(page)
  const viewport = page.locator('[data-app-scroll-viewport]')
  await viewport.evaluate(element => { element.scrollTop = 0 })
  const nestedScroller = await mountNestedScroller(viewport)
  await nestedScroller.evaluate(element => { element.scrollTop = 80 })

  const start = { identifier: 1, x: 180, y: 80 }
  const moved = { ...start, y: 176 }
  await fireTouchEvent(nestedScroller, 'touchstart', [start])
  const defaultPrevented = await fireTouchEvent(
    nestedScroller,
    'touchmove',
    [moved],
  )

  expect(defaultPrevented).toBe(false)
  await expect(page.locator('[data-pull-refresh-phase]')).toHaveCount(0)
  await fireTouchEvent(nestedScroller, 'touchend', [], [moved])
})

test('a nested scroller leaving the top cancels before preventing the next move', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile-375')
  test.setTimeout(120_000)

  await openDashboard(page)
  const viewport = page.locator('[data-app-scroll-viewport]')
  await viewport.evaluate(element => { element.scrollTop = 0 })
  const nestedScroller = await mountNestedScroller(viewport)
  await nestedScroller.evaluate(element => { element.scrollTop = 0 })

  const start = { identifier: 1, x: 180, y: 80 }
  const moved = { ...start, y: 176 }
  await fireTouchEvent(nestedScroller, 'touchstart', [start])
  await expect(page.locator('[data-pull-refresh-phase="pulling"]')).toBeVisible()
  await nestedScroller.evaluate(element => { element.scrollTop = 24 })
  const defaultPrevented = await fireTouchEvent(
    nestedScroller,
    'touchmove',
    [moved],
  )

  expect(defaultPrevented).toBe(false)
  await expect(page.locator('[data-pull-refresh-phase="settling"]')).toBeVisible()
  await fireTouchEvent(nestedScroller, 'touchend', [], [moved])
  await expect(page.locator('[data-pull-refresh-phase]')).toHaveCount(0)
})

test('the threshold heartbeat and both waves survive immediate release without replaying on recross', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile-375')
  test.setTimeout(120_000)

  await openDashboard(page)
  await page.route('**/dashboard?*', async route => {
    const url = new URL(route.request().url())
    if (url.searchParams.has('_rsc')) {
      await new Promise(resolve => setTimeout(resolve, 1_500))
    }
    await route.continue()
  })
  await page.evaluate(() => {
    const testWindow = window as typeof window & {
      __vekiraPtrAnimationStarts?: string[]
    }
    testWindow.__vekiraPtrAnimationStarts = []
    document.addEventListener('animationstart', event => {
      testWindow.__vekiraPtrAnimationStarts?.push(event.animationName)
    })
  })

  const viewport = page.locator('[data-app-scroll-viewport]')
  await viewport.evaluate(element => { element.scrollTop = 0 })
  const start = { identifier: 1, x: 180, y: 80 }
  const armed = { ...start, y: 176 }
  const backedOff = { ...start, y: 120 }
  const recrossed = { ...start, y: 180 }

  await fireTouchEvent(viewport, 'touchstart', [start])
  await fireTouchEvent(viewport, 'touchmove', [armed])
  const indicator = page.locator('[data-pull-refresh-phase]')
  await expect(indicator).toHaveAttribute('data-threshold-pulse', 'true')
  await page.waitForTimeout(50)
  await fireTouchEvent(viewport, 'touchmove', [backedOff])
  await fireTouchEvent(viewport, 'touchmove', [recrossed])
  await fireTouchEvent(viewport, 'touchend', [], [recrossed])

  await expect(indicator).toHaveAttribute('data-pull-refresh-phase', 'refreshing')
  await expect(indicator).toHaveAttribute('data-threshold-pulse', 'true')
  const activeAnimations = await indicator.evaluate(element => {
    const energy = element.querySelector('.vekira-ptr-energy')
    const mark = element.querySelector('.vekira-ptr-mark')
    const waves = Array.from(element.querySelectorAll('.vekira-ptr-wave'))
    if (!energy || !mark || waves.length !== 2) {
      throw new Error('Threshold animation elements are unavailable')
    }
    return {
      indicator: getComputedStyle(element).animationName,
      energy: getComputedStyle(energy).animationName,
      mark: getComputedStyle(mark).animationName,
      waves: waves.map(wave => getComputedStyle(wave).animationName),
      secondWaveDelay: getComputedStyle(waves[1]).animationDelay,
    }
  })
  expect(activeAnimations).toEqual({
    indicator: 'vekira-ptr-catch',
    energy: 'vekira-ptr-heartbeat',
    mark: 'none',
    waves: ['vekira-ptr-wave', 'vekira-ptr-wave'],
    secondWaveDelay: '0.16s',
  })

  await page.waitForTimeout(220)
  const animationStarts = await page.evaluate(() => (
    (window as typeof window & {
      __vekiraPtrAnimationStarts?: string[]
    }).__vekiraPtrAnimationStarts ?? []
  ))
  expect(animationStarts.filter(name => name === 'vekira-ptr-catch')).toHaveLength(1)
  expect(animationStarts.filter(name => name === 'vekira-ptr-heartbeat')).toHaveLength(1)
  expect(animationStarts.filter(name => name === 'vekira-ptr-wave')).toHaveLength(2)

  await expect(indicator).toHaveAttribute('data-threshold-pulse', 'false', {
    timeout: 1_500,
  })
  await expect(indicator).toHaveAttribute('data-pull-refresh-phase', 'refreshing')
  await expect(indicator.locator('.vekira-ptr-mark')).toHaveCSS(
    'animation-name',
    'vekira-ptr-loading-pulse',
  )
})

test('a second touch outside the app viewport cancels an armed pull', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile-375')
  test.setTimeout(120_000)

  await openDashboard(page)
  await page.waitForLoadState('networkidle')
  const refreshRequests: string[] = []
  page.on('request', request => {
    const url = new URL(request.url())
    if (
      url.pathname === '/dashboard'
      && url.searchParams.has('_rsc')
      && request.headers()['next-router-prefetch'] !== '1'
    ) refreshRequests.push(request.url())
  })

  const viewport = page.locator('[data-app-scroll-viewport]')
  const header = page.locator('header').first()
  await expect(header).toBeVisible()
  await viewport.evaluate(element => { element.scrollTop = 0 })
  const primary = { identifier: 1, x: 180, y: 176 }
  const secondary = { identifier: 2, x: 220, y: 176 }

  await fireTouchEvent(viewport, 'touchstart', [{ ...primary, y: 80 }])
  await fireTouchEvent(viewport, 'touchmove', [primary])
  await expect(page.locator('[data-pull-refresh-phase="armed"]')).toBeVisible()

  await fireTouchEvent(header, 'touchstart', [primary, secondary], [secondary])
  await expect(page.locator('[data-pull-refresh-phase="settling"]')).toBeVisible()
  await fireTouchEvent(viewport, 'touchend', [], [primary])
  await expect(page.locator('[data-pull-refresh-phase]')).toHaveCount(0)
  await page.waitForTimeout(750)
  expect(refreshRequests).toHaveLength(0)
})

test('the completed heartbeat remains mounted through its full settle animation', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile-375')
  test.setTimeout(120_000)

  await openDashboard(page)
  let interceptedRequests = 0
  await page.route('**/dashboard?*', async route => {
    const url = new URL(route.request().url())
    if (url.searchParams.has('_rsc')) {
      interceptedRequests += 1
      await new Promise(resolve => setTimeout(resolve, 300))
    }
    await route.continue()
  })
  await page.evaluate(() => {
    const testWindow = window as typeof window & {
      __vekiraCompletionHeartbeatEndedWhileConnected?: boolean | null
    }
    testWindow.__vekiraCompletionHeartbeatEndedWhileConnected = null
    document.addEventListener('animationend', event => {
      if (
        event.animationName !== 'vekira-ptr-heartbeat'
        || !(event.target instanceof Element)
        || !event.target.matches('.vekira-ptr-mark')
      ) return
      const indicator = event.target.closest(
        '[data-completion-pulse="true"]',
      )
      if (indicator) {
        testWindow.__vekiraCompletionHeartbeatEndedWhileConnected =
          indicator.isConnected
      }
    })
  })
  const viewport = page.locator('[data-app-scroll-viewport]')
  await viewport.evaluate(element => { element.scrollTop = 0 })
  await dragDown(page, viewport, 96)

  await expect(page.locator('[data-pull-refresh-phase="refreshing"]')).toBeVisible()
  await expect.poll(() => interceptedRequests).toBe(1)
  const settling = page.locator(
    '[data-pull-refresh-phase="settling"][data-completion-pulse="true"]',
  )
  await expect(settling).toBeVisible({ timeout: 9_000 })
  await expect(settling.locator('.vekira-ptr-mark')).toHaveCSS(
    'animation-duration',
    '0.3s',
  )
  await expect(settling).toHaveCSS('transition-duration', '0.32s, 0.32s')

  await expect.poll(() => page.evaluate(() => (
    (window as typeof window & {
      __vekiraCompletionHeartbeatEndedWhileConnected?: boolean | null
    }).__vekiraCompletionHeartbeatEndedWhileConnected
  )), { timeout: 1_000 }).toBe(true)
  await expect(settling).toHaveCount(0, { timeout: 500 })
})

test('non-passive touchmove handling exists only during a valid active pull', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile-375')
  test.setTimeout(120_000)

  await page.addInitScript({
    content: `(() => {
      const tracked = new Set()
      const originalAdd = EventTarget.prototype.addEventListener
      const originalRemove = EventTarget.prototype.removeEventListener
      EventTarget.prototype.addEventListener = function(type, listener, options) {
        const isViewport = this instanceof HTMLElement
          && this.hasAttribute('data-app-scroll-viewport')
        const passive = typeof options === 'object' && options !== null
          ? options.passive
          : false
        if (isViewport && type === 'touchmove' && passive === false) tracked.add(listener)
        return originalAdd.call(this, type, listener, options)
      }
      EventTarget.prototype.removeEventListener = function(type, listener, options) {
        const isViewport = this instanceof HTMLElement
          && this.hasAttribute('data-app-scroll-viewport')
        if (isViewport && type === 'touchmove') tracked.delete(listener)
        return originalRemove.call(this, type, listener, options)
      }
      Object.defineProperty(window, '__vekiraActiveTouchMoveListeners', {
        configurable: true,
        get: () => tracked.size,
      })
    })()`,
  })

  await openDashboard(page)
  const viewport = page.locator('[data-app-scroll-viewport]')
  const activeListenerCount = () => page.evaluate(() => (
    (window as typeof window & {
      __vekiraActiveTouchMoveListeners: number
    }).__vekiraActiveTouchMoveListeners
  ))

  await expect.poll(activeListenerCount).toBe(0)

  const touch = { identifier: 1, x: 180, y: 80 }
  await fireTouchEvent(viewport, 'touchstart', [touch])
  await expect.poll(activeListenerCount).toBe(1)
  await fireTouchEvent(viewport, 'touchend', [], [touch])
  await expect.poll(activeListenerCount).toBe(0)

  await expect(page.locator('[data-pull-refresh-phase]')).toHaveCount(0)
  await fireTouchEvent(viewport, 'touchstart', [touch])
  await expect.poll(activeListenerCount).toBe(1)
  await fireTouchEvent(viewport, 'touchcancel', [], [touch])
  await expect.poll(activeListenerCount).toBe(0)
})

test('bare and plaintext-only editable targets do not start a pull', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile-375')
  test.setTimeout(120_000)

  await openDashboard(page)
  const viewport = page.locator('[data-app-scroll-viewport]')
  await viewport.evaluate(element => {
    for (const [id, value] of [
      ['bare-editable', ''],
      ['plaintext-editable', 'plaintext-only'],
      ['false-editable', 'false'],
    ]) {
      const target = document.createElement('div')
      target.id = id
      target.setAttribute('contenteditable', value)
      target.textContent = id
      element.prepend(target)
    }
  })

  for (const id of ['bare-editable', 'plaintext-editable']) {
    const target = page.locator(`#${id}`)
    const start = { identifier: 1, x: 180, y: 80 }
    const armed = { ...start, y: 176 }
    await fireTouchEvent(target, 'touchstart', [start])
    await fireTouchEvent(target, 'touchmove', [armed])
    await expect(page.locator('[data-pull-refresh-phase]')).toHaveCount(0)
    await fireTouchEvent(target, 'touchend', [], [armed])
  }

  const nonEditable = page.locator('#false-editable')
  const start = { identifier: 1, x: 180, y: 80 }
  const armed = { ...start, y: 176 }
  await fireTouchEvent(nonEditable, 'touchstart', [start])
  await fireTouchEvent(nonEditable, 'touchmove', [armed])
  await expect(page.locator('[data-pull-refresh-phase="armed"]')).toBeVisible()
  await fireTouchEvent(nonEditable, 'touchcancel', [], [armed])
})

test('a delayed refresh stays visible after the minimum until its RSC request completes', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile-375')
  test.setTimeout(120_000)

  await openDashboard(page)

  let interceptedRequests = 0
  await page.route('**/dashboard?*', async route => {
    const url = new URL(route.request().url())
    if (url.searchParams.has('_rsc')) {
      interceptedRequests += 1
      await new Promise(resolve => setTimeout(resolve, 1_500))
    }
    await route.continue()
  })

  const viewport = page.locator('[data-app-scroll-viewport]')
  await viewport.evaluate(element => { element.scrollTop = 0 })
  await dragDown(page, viewport, 96)

  await expect(page.locator('[data-pull-refresh-phase="refreshing"]')).toBeVisible()
  await expect.poll(() => interceptedRequests).toBe(1)
  await page.waitForTimeout(900)
  await expect(page.locator('[data-pull-refresh-phase="refreshing"]')).toBeVisible()
  await expect(page.locator('[data-pull-refresh-phase]')).toHaveCount(0, {
    timeout: 5_000,
  })
  expect(interceptedRequests).toBe(1)
})

test('a stalled refresh stays visible until the ten-second fail-safe', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile-375')
  test.setTimeout(120_000)

  await openDashboard(page)

  let interceptedRequests = 0
  await page.route('**/dashboard?*', async route => {
    const url = new URL(route.request().url())
    if (url.searchParams.has('_rsc')) {
      interceptedRequests += 1
      await new Promise(resolve => setTimeout(resolve, 11_000))
      await route.abort()
      return
    }
    await route.continue()
  })

  const viewport = page.locator('[data-app-scroll-viewport]')
  await viewport.evaluate(element => { element.scrollTop = 0 })
  const refreshStartedAt = Date.now()
  await dragDown(page, viewport, 96)

  await expect(page.locator('[data-pull-refresh-phase="refreshing"]')).toBeVisible()
  await expect.poll(() => interceptedRequests).toBe(1)
  await page.waitForTimeout(Math.max(0, refreshStartedAt + 9_800 - Date.now()))
  await expect(page.locator('[data-pull-refresh-phase="refreshing"]')).toBeVisible()
  await expect(page.locator('[data-pull-refresh-phase]')).toHaveCount(0, {
    timeout: 2_500,
  })
  expect(Date.now() - refreshStartedAt).toBeGreaterThanOrEqual(10_000)
  expect(interceptedRequests).toBe(1)
})
