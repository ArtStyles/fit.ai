import { expect, test as base } from '@playwright/test'

export const test = base.extend({
  page: async ({ page }, use) => {
    await page.route('**/api/analytics', async route => {
      await route.fulfill({ status: 202, contentType: 'application/json', body: '{}' })
    })
    await use(page)
  },
})

export { expect }
