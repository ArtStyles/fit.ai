import { test } from '@playwright/test'
import { expectLandingContract } from './helpers/acceptance'

test.describe.configure({ mode: 'serial' })

for (const landing of [
  {
    locale: 'es',
    h1: 'Convierte cada entrenamiento en el siguiente paso de tu progresión.',
    cta: 'Crear mi plan gratis',
  },
  {
    locale: 'en',
    h1: 'Turn every workout into the next step in your progression.',
    cta: 'Create my free plan',
  },
] as const) {
  test(`${landing.locale} landing exposes the approved acquisition contract`, async ({ page }) => {
    await page.goto(`/${landing.locale}`)
    await expectLandingContract(page, landing)
  })
}
