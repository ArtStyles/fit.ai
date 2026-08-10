import { expect, test as base } from '@playwright/test'
import { deriveTrainerRelationshipScope } from './helpers/core-product'

type TrainerFixtures = { trainerSecurityScope: string }

export const test = base.extend<TrainerFixtures>({
  page: async ({ page }, use) => {
    await page.route('**/api/analytics', async route => {
      await route.fulfill({ status: 202, contentType: 'application/json', body: '{}' })
    })
    await use(page)
  },
  trainerSecurityScope: async ({ browserName }, use, testInfo) => {
    void browserName
    await use(deriveTrainerRelationshipScope({
      projectName: `${testInfo.project.name}-security`,
      workerIndex: testInfo.workerIndex,
      parallelIndex: testInfo.parallelIndex,
      retry: testInfo.retry,
    }))
  },
})

export { expect }
