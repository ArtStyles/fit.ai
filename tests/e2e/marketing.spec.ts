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

      const screenshots = page.locator('main img[src*="demo-"]')
      await expect(screenshots).toHaveCount(3)
      for (const screenshot of await screenshots.all()) {
        await screenshot.scrollIntoViewIfNeeded()
        await expect.poll(() => screenshot.evaluate(image => image instanceof HTMLImageElement && image.complete && image.naturalWidth > 0)).toBe(true)
        const ratios = await screenshot.evaluate(image => {
          const img = image as HTMLImageElement
          return { natural: img.naturalWidth / img.naturalHeight, rendered: img.getBoundingClientRect().width / img.getBoundingClientRect().height }
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
    await page.goto(`/${landing.locale}`)
    await expect(page.locator('h1')).toHaveText(landing.h1)
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()
    expect(results.violations).toEqual([])
  })
}
