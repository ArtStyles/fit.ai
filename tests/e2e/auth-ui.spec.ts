import { test, expect } from './fixtures'

const viewports = [320, 390, 768, 1024, 1440]

async function expectControlsContained(page: import('@playwright/test').Page) {
  await expect.poll(() => page.locator('header, main, main > a, main > a span, main > a svg, input, button, h1, form a').evaluateAll(elements =>
    elements.filter(element => {
      const rect = element.getBoundingClientRect()
      return rect.width > 0 && (rect.left < -1 || rect.right > window.innerWidth + 1)
    }).map(element => element.outerHTML.slice(0,180)),
  )).toEqual([])
}

for (const route of ['/login', '/register', '/register?locale=en']) {
  test(`${route} keeps the form readable, focusable and contained across widths`, async ({ page }) => {
    await page.goto(route)
    await page.evaluate(() => document.fonts.ready)
    for (const width of viewports) {
      await page.setViewportSize({ width, height: 844 })
      await expect(page.locator('main#app-main-content')).toBeVisible()
      await expect(page.locator('header')).toHaveCount(0)
      await expect(page.locator('h1')).toHaveCount(1)
      await expect(page.locator('h1')).toBeVisible()
      await expectControlsContained(page)
      for (const field of ['email', 'password']) {
        const input = page.locator(`#${field}`)
        await input.focus()
        await expect(input).toBeFocused()
        expect(await input.evaluate(element => parseFloat(getComputedStyle(element).fontSize))).toBeGreaterThanOrEqual(16)
        await expectControlsContained(page)
      }
      const invalidPaints = await page.locator('svg').evaluateAll(svgs => svgs.flatMap(svg =>
        Array.from(svg.querySelectorAll('path[fill^="url(#"]')).filter(path => {
          const id = path.getAttribute('fill')?.slice(5, -1)
          return !id || document.getElementById(id)?.closest('svg') !== svg
        }).map(path => path.outerHTML),
      ))
      expect(invalidPaints).toEqual([])
    }
    // Text enlargement must wrap instead of clipping essential controls.
    await page.setViewportSize({ width: 320, height: 844 })
    await page.evaluate(() => { document.documentElement.style.fontSize = '200%' })
    await page.evaluate(() => document.fonts.ready)
    await expectControlsContained(page)
    const viewport = await page.locator('meta[name="viewport"]').getAttribute('content')
    expect(viewport).not.toMatch(/maximum-scale|user-scalable\s*=\s*no/)
  })
}

test('login retains validation, password visibility and the unconfirmed-email flow', async ({ page }) => {
  await page.goto('/login')
  await page.locator('form button[type="submit"]').click()
  await expect(page.locator('#email')).toHaveAttribute('aria-invalid', 'true')
  await expect(page.locator('#password')).toHaveAttribute('aria-invalid', 'true')
  await page.locator('#email').fill('Person@Example.com')
  await page.locator('#password').fill('Example123')
  await page.getByRole('button', { name: 'Mostrar contraseña' }).click()
  await expect(page.locator('#password')).toHaveAttribute('type', 'text')
  await expect(page.locator('#password')).toHaveValue('Example123')
  await page.getByRole('button', { name: 'Ocultar contraseña' }).click()
  await page.route('**/auth/v1/token?**', async route => {
    expect(route.request().postDataJSON()).toMatchObject({email:'person@example.com',password:'Example123'})
    await route.fulfill({status:400,contentType:'application/json',body:JSON.stringify({code:'email_not_confirmed',message:'Email not confirmed'})})
  })
  await page.locator('form button[type="submit"]').click()
  await expect(page.locator('#otp_code')).toBeVisible()
  await expect(page.locator('#otp_code')).toHaveAttribute('autocomplete', 'one-time-code')
  await expect(page.getByRole('button', {name:/Reenviar código en/})).toBeDisabled()
  await expectControlsContained(page)
})

for (const route of ['/login', '/register']) {
  test(`${route} scrolls naturally on a short screen without a top bar`, async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 360 })
    await page.goto(route)
    await page.evaluate(() => document.fonts.ready)
    await expect(page.locator('header')).toHaveCount(0)
    const logo = page.locator('main > a').first()
    const initialTop = await logo.evaluate(element => element.getBoundingClientRect().top)
    for (const selector of ['#email', '#password', 'form button[type="submit"]', 'form a:last-child']) {
      const control = page.locator(selector).last()
      await control.scrollIntoViewIfNeeded()
      await control.focus()
      await expect(control).toBeInViewport()
    }
    expect(await logo.evaluate(element => element.getBoundingClientRect().top)).toBeLessThan(initialTop - 100)
    const pinned = await page.locator('main, main *, aside').evaluateAll(elements => elements.filter(element =>
      ['fixed', 'sticky'].includes(getComputedStyle(element).position),
    ).map(element => element.tagName))
    expect(pinned).toEqual([])
    // A reduced viewport approximates the available space with an on-screen keyboard.
    await page.setViewportSize({ width: 390, height: 260 })
    await page.locator('#password').focus()
    await expect(page.locator('#password')).toBeInViewport()
    await page.locator('form button[type="submit"]').scrollIntoViewIfNeeded()
    await expect(page.locator('form button[type="submit"]')).toBeInViewport()
  })
}

for (const locale of ['es', 'en']) {
  test(`registration preserves the ${locale} signup payload and readable verification step`, async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 640 })
    await page.goto(`/register?locale=${locale}`)
    await expect(page.locator('form input')).toHaveCount(2)
    const email = 'a.long.email.for.registration@example.test'
    await page.route('**/auth/v1/signup', async route => {
      expect(route.request().postDataJSON()).toMatchObject({email, password:'Example123',data:{preferred_language:locale}})
      await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({id:'local-user',email,identities:[{id:'local-identity'}],user_metadata:{preferred_language:locale}})})
    })
    await page.locator('#email').fill(email)
    await page.locator('#password').fill('Example123')
    await page.locator('form button[type="submit"]').click()
    const otp = page.locator('#otp_code')
    await expect(otp).toBeVisible()
    await otp.fill('12345678')
    await expect(otp).toHaveValue('12345678')
    await page.evaluate(() => { document.documentElement.style.fontSize = '200%' })
    await expectControlsContained(page)
    const digitFit = await otp.evaluate(element => {
      const input = element as HTMLInputElement
      const style = getComputedStyle(input)
      const canvas = document.createElement('canvas').getContext('2d')!
      canvas.font = style.font
      const digitWidth = canvas.measureText(input.value).width
        + (parseFloat(style.letterSpacing) || 0) * input.value.length
      const contentWidth = input.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight)
      return { digitWidth, contentWidth }
    })
    expect(digitFit.digitWidth).toBeLessThanOrEqual(digitFit.contentWidth)
    await page.locator('form button[type="submit"]').scrollIntoViewIfNeeded()
    await expect(page.locator('form button[type="submit"]')).toBeInViewport()
  })
}
