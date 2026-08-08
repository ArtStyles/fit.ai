import { expect, test } from './fixtures'
import {
  cleanupTrainerRelationshipsFixture,
  endSuspendReinstateAndResumeTrainerRelationship,
  deriveTrainerRelationshipScope,
  exerciseTrainerRelationshipLifecycle,
  isTrainerRelationshipsE2EEnabled,
  seedTrainerRelationshipsFixture,
} from './helpers/core-product'

test.describe.configure({ mode: 'serial' })

test('trainer relationships keep requests, consent, suspension, and resume isolated to the E2E run', async ({ page }, testInfo) => {
  test.skip(!isTrainerRelationshipsE2EEnabled(process.env), 'Requires E2E_TRAINER_RELATIONSHIPS_ENABLED=true and dedicated E2E credentials')
  test.setTimeout(300_000)
  const fixture = await seedTrainerRelationshipsFixture(deriveTrainerRelationshipScope({
    projectName: testInfo.project.name,
    workerIndex: testInfo.workerIndex,
    parallelIndex: testInfo.parallelIndex,
    retry: testInfo.retry,
  }))
  try {
    await page.goto('/login')
    await page.getByLabel('Correo electrÃ³nico', { exact: true }).fill(fixture.client.email)
    await page.getByLabel('ContraseÃ±a', { exact: true }).fill(process.env.E2E_USER_PASSWORD!)
    await page.getByRole('button', { name: 'Iniciar sesiÃ³n', exact: true }).click()
    await expect(page).toHaveURL(/\/dashboard$/, { timeout: 30_000 })
    await page.goto('/trainers')
    await expect(page.getByRole('heading', { name: 'Entrenadores verificados', exact: true })).toBeVisible()
    await expect(page.getByText(fixture.trainerA.professionalName, { exact: true })).toBeVisible()
    await expect(page.getByText(/precio|moneda|suscripciÃ³n/i)).toHaveCount(0)

    const first = await exerciseTrainerRelationshipLifecycle(fixture)
    await page.goto('/coaching')
    await expect(page.getByRole('heading', { name: 'AcompaÃ±amiento activo', exact: true })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Tus consentimientos', exact: true })).toBeVisible()

    await endSuspendReinstateAndResumeTrainerRelationship(fixture, first.relationshipId)
    await page.reload()
    await expect(page.getByRole('heading', { name: 'AcompaÃ±amiento activo', exact: true })).toBeVisible()
  } finally {
    await cleanupTrainerRelationshipsFixture(fixture)
  }
})
