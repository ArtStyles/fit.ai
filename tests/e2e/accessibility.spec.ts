import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'

for (const path of [
  '/',
  '/es',
  '/en',
  '/pricing',
  '/register?locale=es',
  '/register?locale=en&plan=pro-monthly',
  '/es/privacidad',
  '/en/privacy',
  '/es/terminos',
  '/en/terms',
]) {
  test(`${path} has no serious accessibility violations or horizontal overflow`, async ({ page }) => {
    await page.goto(path)
    await expect(page.locator('main')).toBeVisible()
    if (path.startsWith('/register?locale=')) {
      const expectedLanguage = path.includes('locale=en') ? 'en' : 'es'
      await expect(page.locator('html')).toHaveAttribute('lang', expectedLanguage)
    }
    const result = await new AxeBuilder({ page }).analyze()
    expect(result.violations.filter(v => ['critical', 'serious'].includes(v.impact ?? ''))).toEqual([])
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)
    expect(overflow).toBe(false)
  })
}
