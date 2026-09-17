import AxeBuilder from '@axe-core/playwright'
import { expect, test } from './fixtures'
import { expectLandingContract, expectNoHorizontalOverflow } from './helpers/acceptance'

test.describe.configure({ mode: 'serial' })

for (const landing of [
  {
    locale: 'es',
    h1: 'Registra tu rutina. Sigue tu progreso.',
    cta: 'Descargar para Android',
    apkCta: 'Descargar APK',
    recoveryTitle: 'Recuperar contraseña',
    deleteTitle: 'Eliminar cuenta de Vekira',
    privacy: '/es/privacidad',
    terms: '/es/terminos',
  },
  {
    locale: 'en',
    h1: 'Log your routine. Track your progress.',
    cta: 'Download for Android',
    apkCta: 'Download APK',
    recoveryTitle: 'Recover password',
    deleteTitle: 'Delete Vekira account',
    privacy: '/en/privacy',
    terms: '/en/terms',
  },
] as const) {
  test(`${landing.locale} landing exposes the public download portal`, async ({ page }) => {
    await page.goto(`/${landing.locale}`)
    await expectLandingContract(page, landing)
  })

  for (const viewport of [{ width: 320, height: 640 }, { width: 390, height: 844 }, { width: 768, height: 1024 }, { width: 1440, height: 900 }]) {
    test(`${landing.locale} supports discovery and downloading at ${viewport.width}px`, async ({ page }) => {
      const pageErrors: string[] = []
      page.on('pageerror', error => pageErrors.push(error.message))
      await page.setViewportSize(viewport)
      await page.goto(`/${landing.locale}`)
      await expect(page.locator('h1')).toHaveText(landing.h1)
      await page.evaluate(() => document.fonts.ready)

      const hero = page.locator('section').filter({ has: page.locator('h1') })
      const download = hero.getByRole('link', { name: landing.cta, exact: true })
      await expect(download).toBeVisible()
      await expect(download).toHaveAttribute('href', `/${landing.locale}#descargar`)
      await expect(page.locator('header').getByRole('link', { name: landing.cta, exact: true })).toBeInViewport({ ratio: 1 })
      await download.click()
      await expect(page).toHaveURL(new RegExp(`/${landing.locale}#descargar$`))
      const apk = page.locator('#descargar').getByRole('link', { name: landing.apkCta, exact: true })
      await expect(apk).toBeVisible()
      await expect(apk).toHaveAttribute('download', '')

      const fingerprint = page.locator('#descargar details')
      await fingerprint.locator('summary').click()
      await expect(fingerprint.locator('code')).toHaveText(/^[a-f0-9]{64}$/i)
      await expectNoHorizontalOverflow(page)

      // Three genuine views remain in the document; the two product panels
      // share one slot so the mobile page does not repeat long screenshots.
      await expect(page.locator('main img[src*="demo-"]')).toHaveCount(3)
      const screenshots = page.locator('main img[src*="demo-"]:visible')
      for (const screenshot of await screenshots.all()) {
        await screenshot.scrollIntoViewIfNeeded()
        await expect.poll(() => screenshot.evaluate(image => image instanceof HTMLImageElement && image.complete && image.naturalWidth > 0)).toBe(true)
        const ratios = await screenshot.evaluate(image => {
          const img = image as HTMLImageElement
          // Layout dimensions exclude the decorative rotation of the hero.
          return { natural: img.naturalWidth / img.naturalHeight, rendered: img.clientWidth / img.clientHeight }
        })
        expect(ratios.rendered).toBeCloseTo(ratios.natural, 2)
      }
      await expectNoHorizontalOverflow(page)
      await expect(page.locator(`footer a[href="${landing.privacy}"]`)).toBeVisible()
      await expect(page.locator(`footer a[href="${landing.terms}"]`)).toBeVisible()

      const faq = page.locator('#ayuda details').first()
      await faq.locator('summary').focus()
      await page.keyboard.press('Enter')
      await expect(faq).toHaveAttribute('open', '')
      await expect(faq.locator('p')).toBeVisible()
      await hero.locator('a[href="#como-funciona"]').click()
      await expect(page.locator('#como-funciona')).toBeInViewport()
      await expect(page).toHaveURL(/#como-funciona$/)
      await page.locator(`header a[href="/${landing.locale}#ayuda"]`).click()
      await expect(page.locator('#faq-title')).toBeInViewport()
      await expect(page).toHaveURL(new RegExp(`/${landing.locale}#ayuda$`))
      expect(pageErrors).toEqual([])
    })
  }

  test(`${landing.locale} downloads the Android APK`, async ({ page }) => {
    await page.goto(`/${landing.locale}#descargar`)
    const apk = page.locator('#descargar').getByRole('link', { name: landing.apkCta, exact: true })
    const downloadPromise = page.waitForEvent('download')
    await apk.click()
    const download = await downloadPromise
    expect(download.suggestedFilename()).toMatch(/^Vekira-\d+\.\d+\.\d+-offline\.apk$/)
    expect(await download.failure()).toBeNull()
  })

  test(`${landing.locale} redirects old app pages to the localized download section`, async ({ page }) => {
    await page.goto(`/${landing.locale}`)
    for (const path of ['/dashboard', '/chat', '/admin', '/register', '/login']) {
      await page.goto(path)
      await expect(page).toHaveURL(new RegExp(`/${landing.locale}#descargar$`))
      await expect(page.locator('#descargar a[download]')).toBeVisible()
      await expect(page.locator('a[href="/login"], a[href^="/register"]')).toHaveCount(0)
    }
  })

  test(`${landing.locale} keeps account recovery and deletion reachable`, async ({ page }) => {
    await page.goto(`/${landing.locale}`)
    for (const [path, title] of [
      ['/recover-password', landing.recoveryTitle],
      ['/delete-account', landing.deleteTitle],
    ]) {
      const response = await page.goto(path)
      expect(response?.status()).toBe(200)
      await expect(page).toHaveURL(new RegExp(`${path}$`))
      await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible()
    }
  })

  test(`${landing.locale} landing has no automated accessibility violations`, async ({ page }) => {
    // Audit every section at its final opacity, including content below the fold.
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.goto(`/${landing.locale}`)
    await expect(page.locator('h1')).toHaveText(landing.h1)
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()
    expect(results.violations).toEqual([])
    await page.locator('#experiencia').getByRole('tab').last().click()
    const progressResults = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()
    expect(progressResults.violations).toEqual([])
  })
}

test('keeps the download navigation visible without covering anchor headings', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/es')
  await page.locator('header a[href="/es#ayuda"]').click()
  await expect(page.locator('#faq-title')).toBeInViewport()
  await expect(page.locator('header')).toBeInViewport({ ratio: 1 })
  await expect.poll(async () => {
    const header = await page.locator('header').boundingBox()
    const heading = await page.locator('#faq-title').boundingBox()
    return !!header && !!heading && heading.y >= header.y + header.height
  }).toBe(true)
  await page.locator('header a[data-download-cta]').click()
  await expect(page.locator('#download-title')).toBeInViewport()
  await expect.poll(async () => {
    const header = await page.locator('header').boundingBox()
    const heading = await page.locator('#download-title').boundingBox()
    return !!header && !!heading && heading.y >= header.y + header.height
  }).toBe(true)
})

test('explores both app views with the keyboard and keeps the showcase stable', async ({ page }) => {
  await page.goto('/es')
  const section = page.locator('#experiencia')
  const tabs = section.getByRole('tab')
  await expect(tabs).toHaveCount(2)
  await section.scrollIntoViewIfNeeded()
  await tabs.first().focus()
  await expect(tabs.first()).toHaveAttribute('aria-selected', 'true')
  const before = await section.boundingBox()
  await page.keyboard.press('ArrowRight')
  await expect(tabs.last()).toBeFocused()
  await expect(tabs.last()).toHaveAttribute('aria-selected', 'true')
  const progress = section.getByRole('tabpanel').filter({ visible: true })
  await expect(progress.getByRole('heading', { name: 'Ve cómo avanzas' })).toBeVisible()
  const image = progress.locator('img')
  await expect.poll(() => image.evaluate(img => img instanceof HTMLImageElement && img.complete && img.naturalWidth > 0)).toBe(true)
  const ratios = await image.evaluate(img => ({ natural: (img as HTMLImageElement).naturalWidth / (img as HTMLImageElement).naturalHeight, shown: img.getBoundingClientRect().width / img.getBoundingClientRect().height }))
  expect(ratios.shown).toBeCloseTo(ratios.natural, 2)
  const after = await section.boundingBox()
  expect(Math.abs(after!.height - before!.height)).toBeLessThan(5)
  await page.keyboard.press('Home')
  await expect(tabs.first()).toBeFocused()
  await expect(tabs.first()).toHaveAttribute('aria-selected', 'true')
  await page.keyboard.press('End')
  await expect(tabs.last()).toHaveAttribute('aria-selected', 'true')
})

test('keeps content and download usable with reduced motion', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/es')
  await page.locator('header a[href="/es#descargar"]').click()
  await expect(page.locator('#download-title')).toBeInViewport()
  await expect(page.locator('[data-reveal-state="pending"]')).toHaveCount(0)
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).scrollBehavior)).toBe('auto')
  await expect(page.locator('#descargar a[download]')).toBeVisible()
})

test('reveals sections on arrival and keeps them readable when revisiting', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await page.goto('/es')
  const download = page.locator('#descargar [data-reveal]')
  await expect(download).toHaveAttribute('data-reveal-state', 'pending')
  await page.locator('header a[data-download-cta]').click()
  await expect(download).toHaveCSS('opacity', '1')
  await page.locator('header a[href="/es#experiencia"]').click()
  await expect(page.locator('#experiencia')).toBeInViewport()
  await expect(download).toHaveCSS('opacity', '1')
})

test('keeps direct section links aligned after enhancing the app preview', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 900 })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  for (const target of ['compartir', 'descargar']) {
    await page.goto(`/es#${target}`)
    await expect(page.locator('#experiencia').getByRole('tab')).toHaveCount(2)
    await expect.poll(async () => {
      const header = await page.locator('header').boundingBox()
      const section = await page.locator(`#${target}`).boundingBox()
      return !!header && !!section && section.y >= header.height && section.y < header.height + 64
    }).toBe(true)
  }
})

test('offers public content and the APK without JavaScript', async ({ browser, baseURL }) => {
  const context = await browser.newContext({ javaScriptEnabled: false, baseURL })
  const page = await context.newPage()
  try {
    await page.goto('/es')
    await expect(page.locator('h1')).toHaveText('Registra tu rutina. Sigue tu progreso.')
    await expect(page.getByRole('heading', { name: 'Tu entrenamiento, organizado', exact: true })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Ve cómo avanzas', exact: true })).toBeVisible()
    await page.locator('header a[href="/es#descargar"]').click()
    await expect(page.locator('#download-title')).toBeInViewport()
    await expect(page.locator('#descargar a[download]')).toBeVisible()
    await page.locator('header a[href="/es#ayuda"]').click()
    await expect(page.locator('#faq-title')).toBeInViewport()
    await page.locator('#ayuda details').first().locator('summary').focus()
    await page.keyboard.press('Enter')
    await expect(page.locator('#ayuda details').first()).toHaveAttribute('open', '')
  } finally { await context.close() }
})
