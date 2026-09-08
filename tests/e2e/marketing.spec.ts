import AxeBuilder from '@axe-core/playwright'
import { expect, test } from './fixtures'
import { expectLandingContract } from './helpers/acceptance'

test.describe.configure({ mode: 'serial' })

for (const landing of [
  {
    locale: 'es',
    h1: 'Entrena con un plan claro. Sigue tu progreso.',
    cta: 'Crear tu cuenta',
    login: 'Iniciar sesión',
    privacy: '/es/privacidad',
    terms: '/es/terminos',
  },
  {
    locale: 'en',
    h1: 'Train with a clear plan. Track your progress.',
    cta: 'Create your account',
    login: 'Sign in',
    privacy: '/en/privacy',
    terms: '/en/terms',
  },
] as const) {
  test(`${landing.locale} landing exposes the approved acquisition contract`, async ({ page }) => {
    await page.goto(`/${landing.locale}`)
    await expectLandingContract(page, landing)
  })

  for (const viewport of [{ width: 320, height: 640 }, { width: 390, height: 844 }, { width: 768, height: 1024 }, { width: 1440, height: 900 }]) {
    test(`${landing.locale} supports discovery and signup at ${viewport.width}px`, async ({ page }) => {
      await page.setViewportSize(viewport)
      await page.goto(`/${landing.locale}`)
      await expect(page.locator('h1')).toHaveText(landing.h1)
      await page.evaluate(() => document.fonts.ready)

      const hero = page.locator('section').filter({ has: page.locator('h1') })
      const signup = hero.getByRole('link', { name: landing.cta, exact: true })
      await expect(signup).toBeInViewport({ ratio: 1 })
      await expect(signup).toHaveAttribute('href', `/register?locale=${landing.locale}`)
      await expect(page.locator('header').getByRole('link', { name: landing.login, exact: true })).toHaveAttribute('href', '/login')

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
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
      await expect(page.locator(`footer a[href="${landing.privacy}"]`)).toBeVisible()
      await expect(page.locator(`footer a[href="${landing.terms}"]`)).toBeVisible()

      const faq = page.locator('details').first()
      await faq.locator('summary').focus()
      await page.keyboard.press('Enter')
      await expect(faq).toHaveAttribute('open', '')
      await expect(faq.locator('p')).toBeVisible()
      await hero.locator('a[href="#como-funciona"]').click()
      await expect(page.locator('#como-funciona')).toBeInViewport()
      await expect(page).toHaveURL(/#como-funciona$/)
    })
  }

  test(`${landing.locale} landing has no automated accessibility violations`, async ({ page }) => {
    await page.goto(`/${landing.locale}`)
    await expect(page.locator('h1')).toHaveText(landing.h1)
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()
    expect(results.violations).toEqual([])
  })
}
